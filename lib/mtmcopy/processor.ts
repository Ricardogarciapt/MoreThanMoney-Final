import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isPremiumTp1HitConfirmed } from './channel-context'
import { buildPremiumExitLegs } from './premium-exits'
import { formatTrailingDistance, TRADE_IDEAS_TRAILING_PIPS } from './pip-points'
import { getMtmcopySubscription } from './subscription'
import { chatMatchesAllowlist, connectionMatchesChannel, connectionMatchesSignalSource } from './sources'
import {
  getActiveConnections,
  getCopyConnections,
  logMtmcopySignal,
  markConnectionStatus,
  hasRecentDuplicate,
  hasRecentDuplicateGlobal,
  countExecutedToday,
} from './db'
import { computeLotSize, getLotSizingSkipReason } from './lot-sizing'
import { getAccountBalance, isMetaApiConfigured, placeOrder } from './metaapi'
import { isCopyFactoryEnabled } from './copyfactory'
import type { MtmcopyChannelKey } from './channel-context'
import { resolveChannelFromChat, shouldIgnoreChannelMessage } from './channel-context'
import { hasMtmProviderConfigured, type MtmChannelProvider } from './provider-accounts'
import {
  executionProfileToConnectionFields,
  formatExecutionSummary,
  getProviderExecutionProfile,
} from './provider-execution'
import { resolveMtmProvidersForSignal } from './provider-resolution'
import {
  applyManagementToAccount,
  applyTrailingToLatestPosition,
  trailingDistanceForConnection,
  trailingDistanceForManagement,
  trailingPointsForConnection,
} from './position-management'
import { buildTelegramMessageContext } from './reply-context'
import {
  looksLikeManagementOrReplyInstruction,
  parseManagementUpdate,
  parseSignal,
} from './signal-parser'
import { formatExecutionDetail, logProviderSignalEvent } from './signal-log'
import {
  applyValidationToSignal,
  formatAiValidationDetail,
  shouldExecuteSignal,
  validateSignalWithAi,
  type AiSignalValidation,
} from './signal-ai-validator'
import type { MTMcopierConnection } from './types'
import type { OrderRequest } from './metaapi'
import {
  applySymbolFromProfile,
  getAiMinConfidence,
  isWithinTradingSchedule,
  mtCommentForProfile,
  resolveLotForSymbol,
  resolveSlTpForSignal,
  shouldExecuteForProfile,
  shouldSkipSymbolForProfile,
} from './provider-profile-apply'

export interface TelegramMessage {
  message_id?: number
  text?: string
  caption?: string
  reply_to_message?: {
    message_id?: number
    text?: string
    caption?: string
  }
  chat?: { id?: number; username?: string; title?: string; type?: string }
}

async function buildProviderConnection(
  channel: MtmcopyChannelKey,
  routeExecution?: import('./signal-sources-config').ProviderExecutionProfile | null,
): Promise<MTMcopierConnection> {
  const execution = await getProviderExecutionProfile(channel, routeExecution)
  return {
    id: 'mtm-provider',
    user_id: 'mtm-provider',
    telegram_channel: null,
    telegram_status: 'connected',
    mt5_login_last4: null,
    mt5_status: 'connected',
    ...executionProfileToConnectionFields(execution),
    is_active: true,
    last_signal_at: null,
    last_error: null,
  }
}

function buildOrderRequest(
  conn: Pick<
    MTMcopierConnection,
    'copy_sl' | 'copy_tp' | 'reverse_signals' | 'auto_trailing_stop' | 'trailing_stop_points'
  >,
  accountId: string,
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  lot: number,
  comment: string,
): OrderRequest {
  const direction = conn.reverse_signals
    ? signal.direction === 'buy'
      ? 'sell'
      : 'buy'
    : signal.direction!

  return {
    accountId,
    symbol: signal.symbol!,
    direction,
    volume: lot,
    orderType: signal.orderType ?? 'market',
    openPrice: signal.entry,
    stopLoss: conn.copy_sl ? signal.sl : null,
    takeProfit: conn.copy_tp ? (signal.tp[0] ?? null) : null,
    comment,
    trailingStop: trailingDistanceForConnection(conn),
    trailingStopPoints: trailingPointsForConnection(conn),
  }
}

async function resolveLogTargets(subscribers: MTMcopierConnection[]): Promise<MTMcopierConnection[]> {
  if (subscribers.length) return subscribers
  const all = await getCopyConnections()
  return all.filter((c) => c.is_active && c.copyfactory_subscribed)
}

async function filterEligibleSubscribers(
  connections: MTMcopierConnection[],
  channel: MtmcopyChannelKey,
): Promise<MTMcopierConnection[]> {
  const supabase = getSupabaseAdmin()
  const eligible: MTMcopierConnection[] = []

  for (const conn of connections) {
    if (!conn.is_active) continue
    if (!connectionMatchesChannel(conn, channel)) continue

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', conn.user_id)
      .maybeSingle()

    const sub = await getMtmcopySubscription(conn.user_id, profile?.user_type)
    if (!sub.active) continue
    eligible.push(conn)
  }

  return eligible
}

export async function processMtmcopyTelegramMessage(message: TelegramMessage) {
  if (!message.chat) return

  const channel = resolveChannelFromChat(message.chat)
  const ctx = await buildTelegramMessageContext(message, channel)
  const text = ctx.text
  if (!text) return

  if (!isMetaApiConfigured()) {
    console.warn('[mtmcopy] METAAPI_TOKEN em falta — sinais não serão executados no MT5')
  }

  const chatAllowed = await chatMatchesAllowlist(message.chat)
  if (!chatAllowed) {
    console.log(
      `[mtmcopy] chat ignorado (não está nos canais activos): id=${message.chat.id} title=${message.chat.title ?? ''}`,
    )
    return
  }

  const allConnections = await getCopyConnections()
  const matched = await Promise.all(
    allConnections.map(async (c) => ({
      c,
      ok: await connectionMatchesSignalSource(c, message.chat!),
    })),
  )
  const isTelegramCopyTarget = (c: MTMcopierConnection) =>
    (c.account_role ?? 'slave') !== 'master' && (c.sender_mode ?? 'telegram') !== 'master_account'

  const matchedConnections = matched
    .filter((m) => m.ok && isTelegramCopyTarget(m.c) && connectionMatchesChannel(m.c, channel))
    .map((m) => m.c)
  const subscribers = await filterEligibleSubscribers(matchedConnections, channel)

  if (!subscribers.length && !matchedConnections.length) {
    console.log('[mtmcopy] canal permitido mas sem ligações MTMcopier configuradas')
  } else if (!subscribers.length) {
    console.log(
      `[mtmcopy] ${matchedConnections.length} ligação(ões) encontrada(s) mas nenhuma activa (is_active=false)`,
    )
  }

  if (shouldIgnoreChannelMessage(text)) {
    console.log(`[mtmcopy] mensagem ignorada (${channel}): ${text.slice(0, 80)}`)
    return
  }

  const mtmProvidersPreview = await resolveMtmProvidersForSignal(channel, message.chat?.id)
  const mtmProvider = mtmProvidersPreview[0] ?? null

  if (looksLikeManagementOrReplyInstruction(text, channel, ctx)) {
    const management = parseManagementUpdate(text, channel, ctx.parentText)
    if (management) {
      const targets = subscribers.length ? subscribers : matchedConnections
      if (targets.length || mtmProvider) {
        await processManagementUpdate(targets, management, text, message.message_id, channel, ctx)
      }
    } else {
      await logProviderSignalEvent({
        channel,
        provider: mtmProvider,
        raw: text,
        telegramMessageId: message.message_id,
        status: 'skipped',
        detail: ctx.isReply
          ? 'Instrução em resposta não reconhecida'
          : 'Gestão não reconhecida pelo parser',
      })
    }
    return
  }

  const signal = parseSignal(text)
  if (!signal?.symbol || !signal.direction) {
    console.log('[mtmcopy] mensagem sem sinal estruturado:', text.slice(0, 120))
    await logProviderSignalEvent({
      channel,
      provider: mtmProvider,
      raw: text,
      telegramMessageId: message.message_id,
      status: 'skipped',
      detail: 'Sinal não reconhecido pelo parser',
    })
    return
  }

  const validation = await validateSignalWithAi(text, signal)
  const enriched = applyValidationToSignal(signal, validation)
  const aiDetail = formatAiValidationDetail(validation)

  console.log(
    `[mtmcopy] ${enriched.symbol} ${enriched.direction} · ${channel} · ${aiDetail} · ${validation.latencyMs.toFixed(0)}ms`,
  )

  if (mtmProvidersPreview.length) {
    for (const prov of mtmProvidersPreview) {
      const routeProfile = await getProviderExecutionProfile(channel, prov.execution)
      if (!shouldExecuteForProfile(validation, routeProfile)) {
        const minPct = Math.round(getAiMinConfidence(routeProfile) * 100)
        await logProviderSignalEvent({
          channel,
          provider: prov,
          signal: enriched,
          raw: text,
          telegramMessageId: message.message_id,
          status: 'skipped',
          detail: `${aiDetail} · confiança < ${minPct}%`,
        })
        continue
      }
      await executeViaMtmProvider(
        subscribers.length ? subscribers : matchedConnections,
        enriched,
        text,
        message.message_id,
        prov,
        channel,
        validation,
      )
    }
    return
  }

  if (!subscribers.length) return

  if (!shouldExecuteSignal(validation)) {
    return
  }

  for (const conn of subscribers) {
    await processSignalDirect(conn, enriched, text, message.message_id, validation)
  }
}

async function applyTrailingToCopyFactorySlaves(
  subscribers: MTMcopierConnection[],
  symbol: string,
) {
  await new Promise((r) => setTimeout(r, 5000))
  for (const conn of subscribers) {
    if (!conn.auto_trailing_stop || !conn.metaapi_account_id) continue
    const trailing = trailingDistanceForConnection(conn)
    if (!trailing) continue
    const trail = await applyTrailingToLatestPosition(conn.metaapi_account_id, symbol, trailing)
    if (!trail.success && trail.error) {
      console.warn(`[mtmcopy] trailing slave ${conn.user_id}: ${trail.error}`)
    }
  }
}

async function processManagementUpdate(
  subscribers: MTMcopierConnection[],
  management: NonNullable<ReturnType<typeof parseManagementUpdate>>,
  raw: string,
  telegramMessageId?: number,
  channel: MtmcopyChannelKey = 'unknown',
  ctx?: { isReply?: boolean; parentText?: string | null; parentMessageId?: number | null },
) {
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''
  const replyRef = ctx?.isReply && ctx.parentMessageId != null ? ` · reply tg:${ctx.parentMessageId}` : ''
  const trailingFromChannel = management.trailing
    ? management.trailing
    : management.trailingPips
      ? ({ mode: 'pips' as const, pips: management.trailingPips })
      : null

  if (
    channel === 'premium-signals' &&
    management.tpLevel === 1 &&
    isPremiumTp1HitConfirmed(raw)
  ) {
    const pseudoSignal = parseSignal(raw) ?? {
      symbol: management.symbol ?? 'XAUUSD',
      direction: 'buy' as const,
      entry: null,
      sl: null,
      tp: [],
      orderType: 'market' as const,
      raw,
    }
    const validation = await validateSignalWithAi(raw, pseudoSignal)
    if (!shouldExecuteSignal(validation)) {
      const previewProviders = await resolveMtmProvidersForSignal(channel)
      await logProviderSignalEvent({
        channel,
        provider: previewProviders[0] ?? null,
        raw,
        telegramMessageId,
        status: 'skipped',
        detail: `${formatAiValidationDetail(validation)} · HIT TP1 não confirmado`,
        symbol: management.symbol,
      })
      return
    }
  }

  console.log(
    `[mtmcopy] gestão ${management.type}${management.symbol ? ' ' + management.symbol : ''}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${ctx?.isReply ? ' (reply)' : ''} · ${channel} → ${subscribers.length} subscritor(es)`,
  )

  const mtmProviders = await resolveMtmProvidersForSignal(channel)
  const accountIds = new Set<string>()
  for (const p of mtmProviders) {
    accountIds.add(p.accountId)
  }
  if (management.type === 'enable_trailing') {
    for (const conn of subscribers) {
      if (conn.metaapi_account_id) accountIds.add(conn.metaapi_account_id)
    }
  } else {
    for (const conn of subscribers) {
      if (conn.metaapi_account_id) accountIds.add(conn.metaapi_account_id)
    }
  }

  for (const accountId of accountIds) {
    const providerMatch = mtmProviders.find((p) => p.accountId === accountId)
    const related = subscribers.filter(
      (c) =>
        c.metaapi_account_id === accountId ||
        (providerMatch && accountId === providerMatch.accountId),
    )
    const isProviderAccount = Boolean(providerMatch)
    const providerConn = isProviderAccount
      ? await buildProviderConnection(channel, providerMatch?.execution)
      : null
    const connTrailing = isProviderAccount && providerConn
      ? trailingDistanceForConnection(providerConn)
      : related.find((c) => c.auto_trailing_stop)
        ? trailingDistanceForConnection(related.find((c) => c.auto_trailing_stop)!)
        : null
    const trailing = trailingDistanceForManagement(management, trailingFromChannel ?? connTrailing)

    const mgmt =
      management.type === 'enable_trailing' && trailing
        ? management
        : management.type === 'enable_trailing'
          ? null
          : management

    if (!mgmt) continue

    const outcome = await applyManagementToAccount(accountId, mgmt, trailing)
    const trailingLabel = trailing ? formatTrailingDistance(trailing) : '0'
    console.log(
      `[mtmcopy] gestão ${accountId}: ${outcome.updated} SL/trailing (${trailingLabel}), ${outcome.closed} fechadas, ${outcome.cancelled} ordens canceladas`,
    )

    if (providerMatch && accountId === providerMatch.accountId) {
      const slNote =
        management.sl != null
          ? ` · SL ${management.sl}`
          : management.slPoints != null
            ? ` · SL ${management.slPoints} pts`
            : ''
      await logProviderSignalEvent({
        channel,
        provider: providerMatch,
        raw,
        telegramMessageId,
        status: outcome.errors.length && !outcome.updated && !outcome.closed && !outcome.cancelled ? 'error' : 'executed',
        detail: `Gestão ${management.type}${management.symbol ? ` ${management.symbol}` : ''}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${slNote}${replyRef}${outcome.cancelled ? ` · ${outcome.cancelled} ordens canceladas` : ''}`.trim(),
        symbol: management.symbol,
      })
    }
  }

  for (const conn of subscribers) {
    const trailingNote = management.trailing
      ? ` · trailing ${formatTrailingDistance(management.trailing)}`
      : management.trailingPips
        ? ` · trailing ${management.trailingPips} pips`
        : ''
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: management.symbol,
      direction: null,
      status: 'received',
      detail: `Gestão: ${management.type}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${trailingNote}${replyRef} ${tgRef}`.trim(),
      raw_message: raw,
    })
    await markConnectionStatus(conn.id, { last_signal_at: new Date().toISOString() })
  }
}

/** Sinal executado na conta MTM do canal; CopyFactory replica para slaves subscritos */
async function executeViaMtmProvider(
  subscribers: MTMcopierConnection[],
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  raw: string,
  telegramMessageId: number | undefined,
  provider: MtmChannelProvider,
  channel: MtmcopyChannelKey,
  validation: AiSignalValidation,
) {
  const aiDetail = formatAiValidationDetail(validation)
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''

  if (await hasRecentDuplicateGlobal(raw, telegramMessageId)) {
    console.log(`[mtmcopy] duplicado ignorado (${provider.tag})`)
    await logProviderSignalEvent({
      channel,
      provider,
      signal,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: 'Duplicado ignorado',
    })
    return
  }

  const executionProfile = await getProviderExecutionProfile(channel, provider.execution)

  if (!isWithinTradingSchedule(executionProfile)) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: 'Fora do horário de trading configurado',
    })
    return
  }

  const mappedSymbol = applySymbolFromProfile(signal.symbol!, executionProfile)
  const skipSymbol = shouldSkipSymbolForProfile(mappedSymbol, executionProfile)
  if (skipSymbol) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: { ...signal, symbol: mappedSymbol },
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: skipSymbol,
    })
    return
  }

  const slTp = resolveSlTpForSignal(signal, executionProfile)
  if (slTp.skipReason) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: { ...signal, symbol: mappedSymbol },
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: slTp.skipReason,
    })
    return
  }

  const signalForExec = {
    ...signal,
    symbol: mappedSymbol,
    sl: slTp.sl,
    tp: slTp.tp != null ? [slTp.tp, ...signal.tp.slice(1)] : signal.tp,
    direction: executionProfile.reverse_signals
      ? signal.direction === 'buy'
        ? ('sell' as const)
        : ('buy' as const)
      : signal.direction,
  }

  const providerConn = await buildProviderConnection(channel, provider.execution)
  const executionSummary = formatExecutionSummary(executionProfile)
  const balance = await getAccountBalance(provider.accountId)
  let totalLot = computeLotSize(providerConn, signalForExec, balance)
  totalLot = resolveLotForSymbol(mappedSymbol, totalLot, executionProfile)

  const lotSkip = getLotSizingSkipReason(providerConn, signalForExec, balance, totalLot)
  if (lotSkip) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: `${aiDetail} · ${lotSkip} · ${executionSummary}`,
    })
    return
  }

  const mtComment = mtCommentForProfile(executionProfile, provider.tag)
  const logTargets = await resolveLogTargets(subscribers)

  const isPremium = channel === 'premium-signals'
  const legs = isPremium
    ? buildPremiumExitLegs(signalForExec, totalLot, {
        tp1: executionProfile.exit_pct_tp1,
        tp2: executionProfile.exit_pct_tp2,
        tp3: executionProfile.exit_pct_tp3,
      })
    : null

  type LegResult = { success: boolean; orderId?: string; brokerSymbol?: string; error?: string; label: string; lot: number }
  const results: LegResult[] = []

  if (legs?.length) {
    for (const leg of legs) {
      const req = buildOrderRequest(providerConn, provider.accountId, signalForExec, leg.lot, `${mtComment}-${leg.label}`)
      req.takeProfit = leg.tpPrice
      if (leg.trailing) req.trailingStop = leg.trailing
      const r = await placeOrder(req)
      results.push({
        ...r,
        label: leg.label,
        lot: req.volume,
      })
    }
  } else {
    const req = buildOrderRequest(providerConn, provider.accountId, signalForExec, totalLot, mtComment)
    if (channel === 'trade-ideas') {
      req.trailingStop = { mode: 'pips', pips: TRADE_IDEAS_TRAILING_PIPS }
    }
    const r = await placeOrder(req)
    results.push({
      ...r,
      label: signalForExec.orderType === 'limit' ? 'LIMIT' : 'MARKET',
      lot: totalLot,
    })
  }

  const result = results[results.length - 1] ?? { success: false, error: 'Sem ordens' }
  const anySuccess = results.some((r) => r.success)
  const orderLabel = legs?.length
    ? `${legs.length} exits · ${results.filter((r) => r.success).length} OK`
    : signalForExec.orderType === 'limit' && signalForExec.entry != null
      ? `LIMIT @ ${signalForExec.entry}`
      : 'MARKET'

  await logProviderSignalEvent({
    channel,
    provider,
    signal: signalForExec,
    raw,
    telegramMessageId,
    lot: totalLot,
    result: { ...result, success: anySuccess },
    status: anySuccess ? 'executed' : 'error',
    detail: `${aiDetail} · ${results.map((r) => `${r.label}: ${r.success ? `#${r.orderId}` : r.error}`).join(' · ')} · ${executionSummary}`,
  })

  for (const conn of logTargets) {
    if (conn.symbols_whitelist?.length && !conn.symbols_whitelist.includes(signalForExec.symbol!)) {
      await logMtmcopySignal({
        user_id: conn.user_id,
        connection_id: conn.id,
        symbol: signalForExec.symbol,
        direction: signalForExec.direction,
        status: 'skipped',
        detail: 'Símbolo fora da whitelist',
        raw_message: raw,
      })
      continue
    }

    const direction = conn.reverse_signals
      ? signalForExec.direction === 'buy'
        ? 'sell'
        : 'buy'
      : signalForExec.direction!

    const trailingNote = conn.auto_trailing_stop
      ? ` · trailing ${trailingPointsForConnection(conn)}pts`
      : ''

    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      channel_key: channel,
      telegram_message_id: telegramMessageId ?? null,
      symbol: signalForExec.symbol,
      direction,
      entry: signalForExec.entry,
      sl: signalForExec.sl,
      tp: signalForExec.tp[0] ?? null,
      lot: totalLot,
      status: anySuccess ? 'executed' : 'error',
      detail: anySuccess
        ? `${aiDetail} · ${provider.tag} · ${orderLabel} · ${executionSummary}${trailingNote} ${tgRef}`.trim()
        : `${aiDetail} · ${provider.tag}: ${result.error} ${tgRef}`.trim(),
      raw_message: raw,
    })

    await markConnectionStatus(conn.id, {
      telegram_status: 'connected',
      last_signal_at: new Date().toISOString(),
      ...(anySuccess
        ? { mt5_status: 'connected', last_error: null }
        : { last_error: result.error ?? 'Erro na conta mestre', mt5_status: 'error' }),
    })
  }

  if (anySuccess && signalForExec.orderType !== 'limit' && channel === 'trade-ideas') {
    void applyTrailingToCopyFactorySlaves(logTargets, signalForExec.symbol!)
  }

  console.log(
    anySuccess
      ? `[mtmcopy] ✅ ${provider.tag} ${result.brokerSymbol} ${signalForExec.direction} ${totalLot} ${orderLabel} (${executionSummary}) → ${logTargets.length} slave(s)`
      : `[mtmcopy] ❌ ${provider.tag}: ${result.error}`,
  )
}

async function processSignalDirect(
  conn: MTMcopierConnection,
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  raw: string,
  telegramMessageId?: number,
  validation?: AiSignalValidation,
) {
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''
  const aiDetail = validation ? formatAiValidationDetail(validation) : ''
  const aiPrefix = aiDetail ? `${aiDetail} · ` : ''

  if (conn.copyfactory_subscribed && isCopyFactoryEnabled()) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'received',
      detail: `CopyFactory activo — aguarda execução na conta mestre ${tgRef}`.trim(),
      raw_message: raw,
    })
    return
  }

  if (await hasRecentDuplicate(conn.id, raw, telegramMessageId)) {
    console.log(`[mtmcopy] duplicado ignorado (${conn.user_id})`)
    return
  }

  if (conn.symbols_whitelist?.length && !conn.symbols_whitelist.includes(signal.symbol!)) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp[0] ?? null,
      status: 'skipped',
      detail: `Símbolo fora da whitelist ${tgRef}`.trim(),
      raw_message: raw,
    })
    return
  }

  if (!conn.metaapi_account_id) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp[0] ?? null,
      status: 'received',
      detail: `Sinal recebido — liga a conta MT5 ${tgRef}`.trim(),
      raw_message: raw,
    })
    await markConnectionStatus(conn.id, {
      telegram_status: 'connected',
      last_signal_at: new Date().toISOString(),
    })
    return
  }

  if (!isMetaApiConfigured()) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'error',
      detail: 'METAAPI_TOKEN não configurado no servidor',
      raw_message: raw,
    })
    return
  }

  const maxDaily = Number(process.env.MTMCOPY_MAX_DAILY_TRADES) || 30
  const executedToday = await countExecutedToday(conn.id)
  if (executedToday >= maxDaily) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'skipped',
      detail: `Limite diário de operações atingido (${executedToday}/${maxDaily})`,
      raw_message: raw,
    })
    return
  }

  let balance: number | null = null
  if (conn.lot_mode === 'risk_percent') {
    balance = await getAccountBalance(conn.metaapi_account_id)
  }

  const lot = computeLotSize(conn, signal, balance)
  const lotSkip = getLotSizingSkipReason(conn, signal, balance, lot)
  if (lotSkip) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'skipped',
      detail: lotSkip,
      raw_message: raw,
    })
    return
  }

  const direction = conn.reverse_signals
    ? signal.direction === 'buy'
      ? 'sell'
      : 'buy'
    : signal.direction!

  const result = await placeOrder(
    buildOrderRequest(conn, conn.metaapi_account_id, signal, lot, 'MTMcopier'),
  )

  const trailingNote = conn.auto_trailing_stop
    ? ` · trailing ${trailingPointsForConnection(conn)}pts`
    : ''

  await logMtmcopySignal({
    user_id: conn.user_id,
    connection_id: conn.id,
    symbol: signal.symbol,
    direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp[0] ?? null,
    lot,
    status: result.success ? 'executed' : 'error',
    detail: result.success
      ? `${aiPrefix}Ordem #${result.orderId} · ${result.brokerSymbol ?? signal.symbol}${trailingNote} ${tgRef}`.trim()
      : `${aiPrefix}${result.error} ${tgRef}`.trim(),
    raw_message: raw,
  })

  await markConnectionStatus(conn.id, {
    telegram_status: 'connected',
    last_signal_at: new Date().toISOString(),
    ...(result.success
      ? { mt5_status: 'connected', last_error: null }
      : { last_error: result.error ?? 'Erro na execução', mt5_status: 'error' }),
  })

  console.log(
    result.success
      ? `[mtmcopy] ✅ ${conn.user_id} ${result.brokerSymbol} ${direction} ${lot}`
      : `[mtmcopy] ❌ ${conn.user_id}: ${result.error}`,
  )
}

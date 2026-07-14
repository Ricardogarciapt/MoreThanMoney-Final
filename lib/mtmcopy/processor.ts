import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isPremiumTp1HitConfirmed } from './channel-context'
import {
  buildPremiumSingleOrder,
  scaleLotForSmallCapital,
  shouldSkipDuplicatePremiumEntry,
} from './premium-single'
import { formatTrailingDistance, riskPipsFromEntrySl, tradeIdeasDynamicTrailing } from './pip-points'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
} from './provider-constants'
import { connectionCopyMethod, prefersDirectExecution } from './copy-limits'
import { getMtmcopySubscription } from './subscription'
import { chatMatchesAllowlist, connectionMatchesChannel, connectionMatchesSignalSource } from './sources'
import {
  getActiveConnections,
  getCopyConnections,
  logMtmcopySignal,
  markConnectionStatus,
  hasRecentDuplicate,
  hasRecentProviderDuplicate,
  countExecutedToday,
} from './db'
import { computeLotSize, getLotSizingSkipReason, signalForRiskSizing } from './lot-sizing'
import {
  fetchLotSizingContext,
  getAccountSnapshot,
  getSymbolSpecification,
  isMetaApiConfigured,
  placeOrdersSequential,
  type OrderResult,
} from './metaapi'
import { isCopyFactoryEnabled } from './copyfactory'
import {
  openT2TRowsForManagement,
  reconcileT2TPositionsClosed,
  type OpenT2TPosition,
} from './t2t-management'
import type { MtmcopyChannelKey } from './channel-context'
import { resolveChannelFromChat, shouldIgnoreChannelMessage } from './channel-context'
import { hasMtmProviderConfigured, type MtmChannelProvider } from './provider-accounts'
import {
  executionProfileToConnectionFields,
  formatExecutionSummary,
  getProviderExecutionProfile,
} from './provider-execution'
import { resolveMtmProvidersForSignal, resolveMtmProviderForStrategyId } from './provider-resolution'
import {
  CANONICAL_SENSEI_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_GOLDKILLER_STRATEGY_ID,
  CANONICAL_GOLDKILLER_ACCOUNT_ID,
} from './provider-constants'
import {
  applyManagementToAccount,
  applyTrailingToLatestPosition,
  trailingDistanceForConnection,
  trailingDistanceForManagement,
  trailingPointsForConnection,
} from './position-management'
import { applyPremiumManagement } from './premium-management-exec'
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
  isOfficialMtmTelegramFormat,
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

/**
 * Premium é um provider de confiança e estruturado: executa pela validação LOCAL sem
 * esperar pelo LLM (corta ~0.5–1.2s → menos slippage). As mensagens de gestão (HIT TP,
 * Trade Active…) são filtradas antes deste ponto. Reversível: MTMCOPY_PREMIUM_FAST_EXEC=false.
 */
const PREMIUM_FAST_EXEC = process.env.MTMCOPY_PREMIUM_FAST_EXEC !== 'false'

export interface TelegramMessage {
  message_id?: number
  text?: string
  caption?: string
  /** Hora ORIGINAL de envio (Unix s). Em mensagens editadas mantém-se a original. */
  date?: number
  /** Hora da edição (Unix s) — NÃO usar para o guard de gestão (ver processManagementUpdate). */
  edit_date?: number
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
    // Trailing por canal/perna (Premium: trail nas pernas 2/3 só no HIT TP1)
    trailingStop: null,
  }
}

/** Subscritores elegíveis para log/estado — nunca expandir a todas as contas CopyFactory. */
async function resolveLogTargets(subscribers: MTMcopierConnection[]): Promise<MTMcopierConnection[]> {
  return subscribers
}

async function filterEligibleSubscribers(
  connections: MTMcopierConnection[],
  channel: MtmcopyChannelKey,
): Promise<MTMcopierConnection[]> {
  const candidates = connections.filter(
    (conn) => conn.is_active && connectionMatchesChannel(conn, channel),
  )
  if (!candidates.length) return []

  const supabase = getSupabaseAdmin()
  const userIds = [...new Set(candidates.map((c) => c.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, user_type')
    .in('id', userIds)

  const userTypeById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.user_type as string | undefined]),
  )

  const eligible: MTMcopierConnection[] = []
  await Promise.all(
    candidates.map(async (conn) => {
      const sub = await getMtmcopySubscription(conn.user_id, userTypeById.get(conn.user_id))
      if (sub.active) eligible.push(conn)
    }),
  )

  return eligible
}

/** Métodos 1 e 2 — execução directa MetaAPI na conta do utilizador (parser → MT5). */
function isDirectExecutionSubscriber(conn: MTMcopierConnection): boolean {
  return prefersDirectExecution(conn)
}

async function resolveMatchedSubscribers(
  message: TelegramMessage,
  channel: MtmcopyChannelKey,
): Promise<{ matchedConnections: MTMcopierConnection[]; subscribers: MTMcopierConnection[] }> {
  const allConnections = await getCopyConnections()
  const isTelegramCopyTarget = (c: MTMcopierConnection) =>
    (c.account_role ?? 'slave') !== 'master' && (c.sender_mode ?? 'telegram') !== 'master_account'

  const matched = await Promise.all(
    allConnections.map(async (c) => ({
      c,
      ok: await connectionMatchesSignalSource(c, message.chat!),
    })),
  )
  const matchedConnections = matched
    .filter((m) => m.ok && isTelegramCopyTarget(m.c) && connectionMatchesChannel(m.c, channel))
    .map((m) => m.c)
  const subscribers = await filterEligibleSubscribers(matchedConnections, channel)
  return { matchedConnections, subscribers }
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

  if (shouldIgnoreChannelMessage(text)) {
    console.log(`[mtmcopy] mensagem ignorada (${channel}): ${text.slice(0, 80)}`)
    return
  }

  const mtmProvidersPreview = await resolveMtmProvidersForSignal(channel, message.chat?.id)
  const mtmProvider = mtmProvidersPreview[0] ?? null

  if (looksLikeManagementOrReplyInstruction(text, channel, ctx)) {
    const { matchedConnections, subscribers } = await resolveMatchedSubscribers(message, channel)
    const management = parseManagementUpdate(text, channel, ctx.parentText)
    if (management) {
      const targets = subscribers.length ? subscribers : matchedConnections
      if (targets.length || mtmProvider) {
        await processManagementUpdate(
          targets,
          management,
          text,
          message.message_id,
          channel,
          ctx,
          message.date ? message.date * 1000 : undefined,
        )
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

  const subscribersPromise = resolveMatchedSubscribers(message, channel)
  const primaryProfile = await getProviderExecutionProfile(
    channel,
    mtmProvidersPreview[0]?.execution,
  )
  const officialFormat = isOfficialMtmTelegramFormat(text)
  const validation = await validateSignalWithAi(text, signal, {
    skipAi: primaryProfile.ai_validation_enabled === false,
    minConfidence: getAiMinConfidence(primaryProfile),
    // Premium: fast-path (sem esperar pelo LLM) quando o parser local valida o sinal.
    forceFastPath: officialFormat || (PREMIUM_FAST_EXEC && channel === 'premium-signals'),
    channel,
    strategyPrompt:
      channel === 'premium-signals'
        ? mtmProvidersPreview[0]?.aiStrategyPrompt ?? null
        : null,
  })
  const enriched = applyValidationToSignal(signal, validation)
  const aiDetail = formatAiValidationDetail(validation)

  console.log(
    `[mtmcopy] ${enriched.symbol} ${enriched.direction} · ${channel} · ${aiDetail} · ${validation.latencyMs.toFixed(0)}ms`,
  )

  const { matchedConnections, subscribers } = await subscribersPromise
  const logTargets = subscribers.length ? subscribers : matchedConnections
  const directTargets = subscribers.filter(
    (c) => connectionCopyMethod(c) === 'telegram_group' && isDirectExecutionSubscriber(c),
  )
  const canExecute = shouldExecuteSignal(validation)

  const method2Task =
    mtmProvidersPreview.length > 0
      ? Promise.all(
          mtmProvidersPreview.map(async (prov) => {
            const routeProfile = await getProviderExecutionProfile(channel, prov.execution)
            if (!canExecute || !shouldExecuteForProfile(validation, routeProfile)) {
              const minPct = Math.round(getAiMinConfidence(routeProfile) * 100)
              await logProviderSignalEvent({
                channel,
                provider: prov,
                signal: enriched,
                raw: text,
                telegramMessageId: message.message_id,
                status: 'skipped',
                detail: canExecute
                  ? `${aiDetail} · confiança < ${minPct}%`
                  : `${aiDetail} · validação abaixo do mínimo`,
              })
              return
            }
            await executeViaMtmProvider(
              logTargets,
              enriched,
              text,
              message.message_id,
              prov,
              channel,
              validation,
            )
          }),
        )
      : Promise.resolve()

  const directTask =
    canExecute && directTargets.length > 0
      ? Promise.all(
          directTargets.map((conn) =>
            processSignalDirect(conn, enriched, text, message.message_id, validation, channel),
          ),
        )
      : Promise.resolve()

  await Promise.all([method2Task, directTask])

  if (!mtmProvidersPreview.length && !directTargets.length) {
    await logProviderSignalEvent({
      channel,
      provider: mtmProvider,
      signal: enriched,
      raw: text,
      telegramMessageId: message.message_id,
      status: 'skipped',
      detail: subscribers.length
        ? 'Subscribers activos usam CopyFactory/estratégia — aguardam conta provider'
        : 'Sem subscribers nem rota provider para este canal',
    })
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
  /** Hora ORIGINAL da mensagem (ms). Gestão não atua em posições abertas DEPOIS disto. */
  messageTimeMs?: number,
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
    const previewProviders = await resolveMtmProvidersForSignal(channel)
    const validation = await validateSignalWithAi(raw, pseudoSignal, {
      channel,
      strategyPrompt:
        channel === 'premium-signals'
          ? previewProviders[0]?.aiStrategyPrompt ?? null
          : null,
    })
    if (!shouldExecuteSignal(validation)) {
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
  for (const conn of subscribers) {
    if (conn.metaapi_account_id && prefersDirectExecution(conn)) {
      accountIds.add(conn.metaapi_account_id)
    }
  }

  // T2T: estende a gestão do mestre às contas Tap to Trade com posição aberta neste
  // canal+símbolo (se a estratégia está ativa no T2T). Mesma lógica por estratégia.
  let t2tPositions: OpenT2TPosition[] = []
  try {
    t2tPositions = await openT2TRowsForManagement(channel, management.symbol)
    for (const p of t2tPositions) accountIds.add(p.accountId)
    if (t2tPositions.length) {
      console.log(`[mtmcopy] gestão T2T: +${t2tPositions.length} posição(ões) Tap to Trade`)
    }
  } catch (e) {
    console.warn('[mtmcopy] T2T management resolve falhou:', e)
  }

  const managementOutcomes = new Map<
    string,
    { updated: number; closed: number; cancelled: number; errors: string[] }
  >()

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

    // Se o monitor de preço Premium estiver LIGADO, ele é a autoridade dos parciais
    // (por preço) — ignora a gestão Premium por mensagem para não fechar a dobrar.
    if (channel === 'premium-signals') {
      const { getExecSwitches } = await import('./exec-switches')
      const sw = await getExecSwitches()
      if (sw.premium_price_monitor) {
        console.log('[mtmcopy] gestão Premium por mensagem ignorada (monitor de preço ativo)')
        continue
      }
    }

    // Premium: nova lógica de gestão (premium-management-plan/exec) — por PREÇO,
    // zona vantajosa, sem BE/trailing prematuros. Demais canais: caminho legado.
    const outcome =
      channel === 'premium-signals'
        ? await applyPremiumManagement(accountId, raw, ctx?.parentText ?? null, management.symbol, messageTimeMs)
        : await applyManagementToAccount(accountId, mgmt, trailing)
    managementOutcomes.set(accountId, outcome)
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

  // T2T: marca como fechadas as posições Tap to Trade que a gestão do mestre encerrou
  if (t2tPositions.length) {
    await reconcileT2TPositionsClosed(t2tPositions).catch((e) =>
      console.warn('[mtmcopy] T2T reconcile falhou:', e),
    )
  }

  for (const conn of subscribers) {
    const trailingNote = management.trailing
      ? ` · trailing ${formatTrailingDistance(management.trailing)}`
      : management.trailingPips
        ? ` · trailing ${management.trailingPips} pips`
        : ''

    let status: 'received' | 'executed' | 'skipped' | 'error' = 'received'
    let detailSuffix = ''

    if (!conn.metaapi_account_id) {
      status = 'skipped'
      detailSuffix = ' · conta MT5 não ligada'
    } else if (conn.mt5_status === 'error') {
      status = 'skipped'
      detailSuffix = ` · ${conn.last_error ?? 'conta MT5 em erro'}`
    } else if (!prefersDirectExecution(conn)) {
      status = 'received'
      detailSuffix = ' · via CopyFactory (replica do provider/mestre)'
    } else {
      const outcome = managementOutcomes.get(conn.metaapi_account_id)
      if (!outcome) {
        status = 'skipped'
        detailSuffix = ' · gestão não aplicada nesta conta'
      } else if (outcome.errors.length && !outcome.updated && !outcome.closed && !outcome.cancelled) {
        status = 'error'
        detailSuffix = ` · ${outcome.errors[0]}`
      } else if (outcome.updated || outcome.closed || outcome.cancelled) {
        status = 'executed'
        detailSuffix = ` · ${outcome.updated} SL/trail · ${outcome.closed} fechadas`
      }
    }

    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: management.symbol,
      direction: null,
      status,
      detail: `Gestão: ${management.type}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${trailingNote}${detailSuffix}${replyRef} ${tgRef}`.trim(),
      raw_message: raw,
    })
    await markConnectionStatus(conn.id, {
      last_signal_at: new Date().toISOString(),
      ...(status === 'error' && detailSuffix
        ? { mt5_status: 'error', last_error: detailSuffix.replace(/^ · /, '') }
        : status === 'executed'
          ? { mt5_status: 'connected', last_error: null }
          : {}),
    })
  }
}

function subscriberLogAfterProviderExecution(
  conn: MTMcopierConnection,
  opts: {
    anySuccess: boolean
    aiDetail: string
    providerTag: string
    orderLabel: string
    executionSummary: string
    trailingNote: string
    tgRef: string
    resultError?: string
  },
): {
  status: 'received' | 'error'
  detail: string
  connectionPatch: Record<string, unknown>
} {
  const {
    anySuccess,
    aiDetail,
    providerTag,
    orderLabel,
    executionSummary,
    trailingNote,
    tgRef,
    resultError,
  } = opts

  if (!anySuccess) {
    // CopyFactory: falha na conta provider não deve marcar o subscriber como erro MT5
    if (conn.copyfactory_subscribed && !prefersDirectExecution(conn)) {
      return {
        status: 'skipped',
        detail: `${aiDetail} · ${providerTag} mestre: ${resultError ?? 'erro'} (sem replica — conta subscriber intacta) ${tgRef}`.trim(),
        connectionPatch: {},
      }
    }
    return {
      status: 'error',
      detail: `${aiDetail} · ${providerTag} mestre: ${resultError ?? 'erro'} ${tgRef}`.trim(),
      connectionPatch: {
        last_error: resultError ?? 'Erro na conta mestre',
        mt5_status: 'error',
      },
    }
  }

  const base = `${aiDetail} · ${providerTag} mestre · ${orderLabel} · ${executionSummary}`
  if (conn.copyfactory_subscribed) {
    return {
      status: 'received',
      detail: `${base} · CopyFactory replica (confirma no MT5)${trailingNote} ${tgRef}`.trim(),
      connectionPatch: { last_error: null },
    }
  }
  if (prefersDirectExecution(conn)) {
    return {
      status: 'received',
      detail: `${base} · aguarda execução na tua conta${trailingNote} ${tgRef}`.trim(),
      connectionPatch: {},
    }
  }
  return {
    status: 'received',
    detail: `${base}${trailingNote} ${tgRef}`.trim(),
    connectionPatch: {},
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

  const [isDuplicate, executionProfile, providerConn] = await Promise.all([
    hasRecentProviderDuplicate(raw, telegramMessageId),
    getProviderExecutionProfile(channel, provider.execution),
    buildProviderConnection(channel, provider.execution),
  ])

  if (isDuplicate) {
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
  // Premium (Ouro/BTC) e Forex → risco 0.5% por trade (forçado). CopyFactory replica por saldo.
  const FX_CODES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'])
  const clean6 = mappedSymbol.toUpperCase().replace(/[^A-Z]/g, '')
  const isForexSym = clean6.length === 6 && FX_CODES.has(clean6.slice(0, 3)) && FX_CODES.has(clean6.slice(3, 6))
  // GoldKiller: 0.5% de risco por trade (conta própria), tal como Premium/Forex.
  const isGoldKillerProvider =
    provider.accountId === CANONICAL_GOLDKILLER_ACCOUNT_ID ||
    provider.strategyId === CANONICAL_GOLDKILLER_STRATEGY_ID
  const forceRisk05 = channel === 'premium-signals' || isForexSym || isGoldKillerProvider
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

  const executionSummary = formatExecutionSummary(executionProfile)
  let balance: number | null = null
  let marketPrice: number | null = null

  // Chamadas MetaAPI independentes em paralelo (corta ~200ms vs. sequencial):
  //  - lot sizing context (só risk_percent)
  //  - account snapshot (equity, sempre)
  //  - symbol specification (só trade-ideas, para trailing dinâmico)
  const needsSpec = channel === 'trade-ideas'
  const [lotCtx, snapshot, symbolSpec] = await Promise.all([
    executionProfile.lot_mode === 'risk_percent' || forceRisk05
      ? fetchLotSizingContext(provider.accountId, mappedSymbol, signalForExec.direction!)
      : Promise.resolve(null),
    getAccountSnapshot(provider.accountId),
    needsSpec
      ? getSymbolSpecification(provider.accountId, mappedSymbol)
      : Promise.resolve(null),
  ])

  if (lotCtx) {
    balance = lotCtx.balance
    marketPrice = lotCtx.marketPrice
  }

  // Forex: SL máximo 20 pips (200 pontos) da entrada; TP fica conforme sinal.
  if (isForexSym && signalForExec.sl != null && signalForExec.sl > 0) {
    const entryRef = signalForExec.entry ?? marketPrice
    if (entryRef && entryRef > 0) {
      const pip = clean6.includes('JPY') ? 0.01 : 0.0001
      const maxDist = 20 * pip
      const dist = Math.abs(entryRef - signalForExec.sl)
      if (dist > maxDist) {
        signalForExec.sl = signalForExec.direction === 'buy' ? entryRef - maxDist : entryRef + maxDist
      }
    }
  }

  // Premium/Forex → risco 0.5% por trade (sobrepõe config da conta provider).
  const lotConn = forceRisk05
    ? { ...providerConn, lot_mode: 'risk_percent' as const, lot_value: 0.5 }
    : providerConn

  const signalForLot = signalForRiskSizing(signalForExec, marketPrice)
  let totalLot = computeLotSize(lotConn, signalForLot, balance)
  totalLot = resolveLotForSymbol(mappedSymbol, totalLot, executionProfile)

  const equity = snapshot?.equity ?? snapshot?.balance ?? balance
  totalLot = scaleLotForSmallCapital(totalLot, equity)

  const lotSkip = getLotSizingSkipReason(
    lotConn,
    signalForExec,
    balance,
    totalLot,
    marketPrice,
  )
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

  await logProviderSignalEvent({
    channel,
    provider,
    signal: signalForExec,
    raw,
    telegramMessageId,
    lot: totalLot,
    status: 'received',
    detail: `${aiDetail} · A abrir ${signalForExec.symbol} ${signalForExec.direction} · ${executionSummary}`,
  })

  const isPremiumProvider = channel === 'premium-signals'
  // Mecânica "1 posição + parciais por Exit": Premium usa sempre; outras rotas por opt-in
  // (execution.partial_exits) — programável nas configurações da rota, sem afetar ativos.
  const usePartialExits = isPremiumProvider || executionProfile.partial_exits === true
  const exitPcts = {
    tp1: executionProfile.exit_pct_tp1,
    tp2: executionProfile.exit_pct_tp2,
    tp3: executionProfile.exit_pct_tp3,
  }

  /** 1 posição + parciais por Exit (fecho por preço via monitor). */
  const premiumProviderSingle = usePartialExits
    ? buildPremiumSingleOrder(signalForExec, totalLot, exitPcts, equity)
    : null

  if (usePartialExits && !premiumProviderSingle) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: `${aiDetail} · Sem TP no sinal — provider Premium exige pelo menos 1 exit`,
    })
    return
  }

  if (isPremiumProvider && premiumProviderSingle) {
    const dup = await shouldSkipDuplicatePremiumEntry(
      provider.accountId,
      mappedSymbol,
      signalForExec.direction!,
    )
    if (dup.skip) {
      await logProviderSignalEvent({
        channel,
        provider,
        signal: signalForExec,
        raw,
        telegramMessageId,
        lot: totalLot,
        status: 'skipped',
        detail: `${aiDetail} · ${dup.reason}`,
      })
      return
    }
  }

  type LegResult = { success: boolean; orderId?: string; brokerSymbol?: string; error?: string; label: string; lot: number }
  const results: LegResult[] = []

  try {
    if (premiumProviderSingle) {
      const req = buildOrderRequest(
        providerConn,
        provider.accountId,
        signalForExec,
        premiumProviderSingle.lot,
        premiumProviderSingle.comment,
      )
      req.takeProfit = null
      const [r] = await placeOrdersSequential(provider.accountId, [req])
      results.push({
        ...(r ?? { success: false, error: 'Sem resposta MetaAPI' }),
        label: `PREM · parciais ${premiumProviderSingle.exitPcts.tp1}/${premiumProviderSingle.exitPcts.tp2}/${premiumProviderSingle.exitPcts.tp3}%`,
        lot: premiumProviderSingle.lot,
      })
      // Regista a trade ativa para o monitor de preço (fecha parciais por PREÇO).
      // Premium sempre; outras rotas só se tiverem price_monitor ligado na config.
      if (r?.success && (isPremiumProvider || executionProfile.price_monitor === true)) {
        try {
          const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
          const tps = signalForExec.tp ?? []
          await getSupabaseAdmin().from('mtmcopy_premium_active').insert({
            account_id: provider.accountId,
            symbol: mappedSymbol,
            direction: signalForExec.direction,
            entry: signalForExec.entry ?? marketPrice ?? null,
            sl: signalForExec.sl ?? null,
            tp1: tps[0] ?? null,
            tp2: tps[1] ?? null,
            tp3: tps[2] ?? null,
            exit_pct_tp1: premiumProviderSingle.exitPcts.tp1,
            exit_pct_tp2: premiumProviderSingle.exitPcts.tp2,
            exit_pct_tp3: premiumProviderSingle.exitPcts.tp3,
            original_lot: premiumProviderSingle.lot,
            small_account: premiumProviderSingle.smallAccount === true,
            exits_done: 0,
            trailing_started: false,
            status: 'open',
          })
        } catch (e) {
          console.error('[mtmcopy] persist premium active falhou:', e)
        }
      }
    } else {
      const req = buildOrderRequest(providerConn, provider.accountId, signalForExec, totalLot, mtComment)
      if (channel === 'trade-ideas') {
        const isSensei = provider.accountId === CANONICAL_SENSEI_ACCOUNT_ID
        if (isSensei) {
          // Sensei: abre só com SL — TP/parciais geridos pelos alertas (25% por TP).
          req.takeProfit = null
          req.trailingStop = null
        } else {
          // Forex (Trade Ideas): TP do sinal + trailing BE@25 pips (inalterado).
          const spec = symbolSpec
          const entry = signalForExec.entry ?? marketPrice
          const riskPips = spec ? riskPipsFromEntrySl(entry, signalForExec.sl, spec, mappedSymbol) : null
          const targetPips = spec ? riskPipsFromEntrySl(entry, signalForExec.tp?.[0] ?? null, spec, mappedSymbol) : null
          req.trailingStop = tradeIdeasDynamicTrailing(riskPips, targetPips)
        }
      }
      const [r] = await placeOrdersSequential(provider.accountId, [req])
      results.push({
        ...(r ?? { success: false, error: 'Sem resposta MetaAPI' }),
        label: signalForExec.orderType === 'limit' ? 'LIMIT' : 'MARKET',
        lot: totalLot,
      })
    }
  } catch (execErr) {
    const msg = execErr instanceof Error ? execErr.message : 'Erro fatal na execução MetaAPI'
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      lot: totalLot,
      status: 'error',
      detail: `${aiDetail} · ${msg}`,
    })
    throw execErr
  }

  const result: LegResult = results[results.length - 1] ?? {
    success: false,
    error: 'Sem ordens',
    label: '—',
    lot: 0,
  }
  const anySuccess = results.some((r) => r.success)
  const orderLabel = premiumProviderSingle
    ? `1 perna · parciais ${premiumProviderSingle.exitPcts.tp1}/${premiumProviderSingle.exitPcts.tp2}/${premiumProviderSingle.exitPcts.tp3}%`
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

  void Promise.all(
    logTargets.map(async (conn) => {
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
        return
      }

      const direction = conn.reverse_signals
        ? signalForExec.direction === 'buy'
          ? 'sell'
          : 'buy'
        : signalForExec.direction!

      const trailingNote = conn.auto_trailing_stop
        ? ` · trailing ${trailingPointsForConnection(conn)}pts`
        : ''

      const slaveLog = subscriberLogAfterProviderExecution(conn, {
        anySuccess,
        aiDetail,
        providerTag: provider.tag,
        orderLabel,
        executionSummary,
        trailingNote,
        tgRef,
        resultError: result.error,
      })

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
        status: slaveLog.status,
        detail: slaveLog.detail,
        raw_message: raw,
      })

      await markConnectionStatus(conn.id, {
        telegram_status: 'connected',
        last_signal_at: new Date().toISOString(),
        ...slaveLog.connectionPatch,
      })
    }),
  )

  console.log(
    anySuccess
      ? `[mtmcopy] ✅ ${provider.tag} ${result.brokerSymbol ?? signalForExec.symbol} ${signalForExec.direction} ${totalLot} ${orderLabel} (${executionSummary}) → ${logTargets.length} slave(s)`
      : `[mtmcopy] ❌ ${provider.tag}: ${result.error}`,
  )
}

async function processSignalDirect(
  conn: MTMcopierConnection,
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  raw: string,
  telegramMessageId?: number,
  validation?: AiSignalValidation,
  channel: MtmcopyChannelKey = 'unknown',
) {
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''
  const aiDetail = validation ? formatAiValidationDetail(validation) : ''
  const aiPrefix = aiDetail ? `${aiDetail} · ` : ''

  // Copy trader (método 3): replica via CopyFactory da conta mestre — não executar aqui
  if (conn.copyfactory_subscribed && isCopyFactoryEnabled() && !prefersDirectExecution(conn)) {
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
  let marketPrice: number | null = null
  const execDirection = conn.reverse_signals
    ? signal.direction === 'buy'
      ? 'sell'
      : 'buy'
    : signal.direction!
  if (conn.lot_mode === 'risk_percent') {
    const ctx = await fetchLotSizingContext(
      conn.metaapi_account_id,
      signal.symbol!,
      execDirection,
    )
    balance = ctx.balance
    marketPrice = ctx.marketPrice
  }

  const signalForLot = signalForRiskSizing(signal, marketPrice)
  let lot = computeLotSize(conn, signalForLot, balance)

  const snapshot = conn.metaapi_account_id
    ? await getAccountSnapshot(conn.metaapi_account_id)
    : null
  const equity = snapshot?.equity ?? snapshot?.balance ?? balance
  lot = scaleLotForSmallCapital(lot, equity)

  const lotSkip = getLotSizingSkipReason(conn, signal, balance, lot, marketPrice)
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

  const direction = execDirection

  /** Método 1 — grupos Telegram: 1 posição + parciais 33/33/34% via mensagens HIT TP. */
  const isPremium = channel === 'premium-signals'
  const premiumSingle = isPremium
    ? buildPremiumSingleOrder(
        signal,
        lot,
        {
          tp1: conn.exit_pct_tp1 ?? 75,
          tp2: conn.exit_pct_tp2 ?? 15,
          tp3: conn.exit_pct_tp3 ?? 10,
        },
        equity,
        { manual: conn.copy_as_manual === true },
      )
    : null

  if (isPremium && premiumSingle && conn.metaapi_account_id) {
    const dup = await shouldSkipDuplicatePremiumEntry(
      conn.metaapi_account_id,
      signal.symbol!,
      direction,
    )
    if (dup.skip) {
      await logMtmcopySignal({
        user_id: conn.user_id,
        connection_id: conn.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: 'skipped',
        detail: dup.reason ?? 'Exposição Premium activa',
        raw_message: raw,
      })
      return
    }
  }

  await logMtmcopySignal({
    user_id: conn.user_id,
    connection_id: conn.id,
    channel_key: channel,
    telegram_message_id: telegramMessageId ?? null,
    symbol: signal.symbol,
    direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp[0] ?? null,
    lot,
    status: 'received',
    detail: `${aiPrefix}A abrir ${signal.symbol} ${direction} · lot ${lot} ${tgRef}`.trim(),
    raw_message: raw,
  })

  let result: OrderResult
  if (premiumSingle && conn.metaapi_account_id) {
    const req = buildOrderRequest(
      conn,
      conn.metaapi_account_id,
      signal,
      premiumSingle.lot,
      premiumSingle.comment,
    )
    req.takeProfit = null
    const [single] = await placeOrdersSequential(conn.metaapi_account_id, [req])
    result = single ?? { success: false, error: 'Sem resposta MetaAPI' }
  } else {
    const req = buildOrderRequest(conn, conn.metaapi_account_id, signal, lot, 'MTMcopier')
    if (channel === 'trade-ideas' && conn.metaapi_account_id) {
      const spec = await getSymbolSpecification(conn.metaapi_account_id, signal.symbol!)
      const entry = signal.entry ?? marketPrice
      const riskPips = spec ? riskPipsFromEntrySl(entry, signal.sl, spec, signal.symbol!) : null
      const targetPips = spec ? riskPipsFromEntrySl(entry, signal.tp?.[0] ?? null, spec, signal.symbol!) : null
      req.trailingStop = tradeIdeasDynamicTrailing(riskPips, targetPips)
    }
    const [single] = await placeOrdersSequential(conn.metaapi_account_id!, [req])
    result = single ?? { success: false, error: 'Sem resposta MetaAPI' }
  }

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

/**
 * Execução provider a partir de webhook TradingView.
 * target='sensei' (default) → conta Sensei (Ouro/BTC).
 * target='forex' → conta MTM Auto Forex (5IHE), resolvida por strategy id,
 * sem tocar na rota canónica nem no caminho Telegram.
 */
export async function processMtmcopyWebhookSignal(opts: {
  raw: string
  signal: NonNullable<ReturnType<typeof parseSignal>>
  validation: AiSignalValidation
  externalRef?: string
  target?: 'sensei' | 'forex' | 'goldkiller'
}): Promise<{ executed: boolean; detail?: string }> {
  if (!isMetaApiConfigured()) {
    return { executed: false, detail: 'MetaAPI não configurado' }
  }

  const channel: MtmcopyChannelKey = 'trade-ideas'
  const providers =
    opts.target === 'forex'
      ? await (async () => {
          const p = await resolveMtmProviderForStrategyId(CANONICAL_TRADE_IDEAS_STRATEGY_ID)
          return p ? [p] : []
        })()
      : opts.target === 'goldkiller'
        ? await (async () => {
            const p = await resolveMtmProviderForStrategyId(CANONICAL_GOLDKILLER_STRATEGY_ID)
            return p ? [p] : []
          })()
        : await resolveMtmProvidersForSignal(channel, null, { signalSource: 'webhook' })
  if (!providers.length) {
    return {
      executed: false,
      detail:
        opts.target === 'forex'
          ? 'Rota MTM Auto Forex não configurada'
          : opts.target === 'goldkiller'
            ? 'Rota MTM Auto GoldKiller não configurada'
            : 'Rota provider Sensei não configurada',
    }
  }

  const enriched = applyValidationToSignal(opts.signal, opts.validation)
  const canExecute = shouldExecuteSignal(opts.validation)

  if (!canExecute) {
    await logProviderSignalEvent({
      channel,
      provider: providers[0],
      signal: enriched,
      raw: opts.raw,
      status: 'skipped',
      detail: `${formatAiValidationDetail(opts.validation)} · validação abaixo do mínimo`,
    })
    return { executed: false, detail: 'Sinal rejeitado pela validação' }
  }

  for (const prov of providers) {
    const routeProfile = await getProviderExecutionProfile(channel, prov.execution)
    if (!shouldExecuteForProfile(opts.validation, routeProfile)) {
      const minPct = Math.round(getAiMinConfidence(routeProfile) * 100)
      await logProviderSignalEvent({
        channel,
        provider: prov,
        signal: enriched,
        raw: opts.raw,
        status: 'skipped',
        detail: `${formatAiValidationDetail(opts.validation)} · confiança < ${minPct}%`,
      })
      continue
    }

    await executeViaMtmProvider(
      [],
      enriched,
      opts.raw,
      undefined,
      prov,
      channel,
      opts.validation,
    )
  }

  return {
    executed: true,
    detail: `${opts.target === 'forex' ? 'Auto Forex' : opts.target === 'goldkiller' ? 'Auto GoldKiller' : 'Sensei'} · ${providers.map((p) => p.strategyId ?? CANONICAL_SENSEI_STRATEGY_ID).join(',')}`,
  }
}

/**
 * Gestão automática Sensei (webhook): TP1-4 / BE / SL → parciais + BE + trailing
 * ou fecho, na conta Sensei. CopyFactory replica aos subscritores.
 */
export async function processMtmcopyWebhookManagement(opts: {
  symbol: string
  direction: 'buy' | 'sell' | null
  alertType: import('./signal-parser').SenseiAlertType
  tpLevel: number | null
  entry: number | null
  target?: 'sensei' | 'goldkiller'
}): Promise<{ applied: boolean; detail?: string }> {
  if (!isMetaApiConfigured()) return { applied: false, detail: 'MetaAPI não configurado' }

  const channel: MtmcopyChannelKey = 'trade-ideas'
  const providers =
    opts.target === 'goldkiller'
      ? await (async () => {
          const p = await resolveMtmProviderForStrategyId(CANONICAL_GOLDKILLER_STRATEGY_ID)
          return p ? [p] : []
        })()
      : await resolveMtmProvidersForSignal(channel, null, { signalSource: 'webhook' })
  if (!providers.length) {
    return { applied: false, detail: opts.target === 'goldkiller' ? 'Rota GoldKiller não configurada' : 'Rota Sensei não configurada' }
  }

  const { applySenseiManagement } = await import('./sensei-management-exec')
  const details: string[] = []
  let anyApplied = false
  for (const prov of providers) {
    const outcome = await applySenseiManagement({
      accountId: prov.accountId,
      symbol: opts.symbol,
      direction: opts.direction,
      alertType: opts.alertType,
      tpLevel: opts.tpLevel,
      entry: opts.entry,
    })
    if (outcome.closed || outcome.updated) anyApplied = true
    await logProviderSignalEvent({
      channel,
      provider: prov,
      symbol: opts.symbol,
      raw: `sensei-mgmt ${opts.alertType}${opts.tpLevel ? ` TP${opts.tpLevel}` : ''}`,
      status: outcome.errors.length && !outcome.closed && !outcome.updated ? 'error' : 'executed',
      detail: `Gestão Sensei ${opts.alertType}${opts.tpLevel ? ` TP${opts.tpLevel}` : ''} · ${outcome.actions.join(', ') || outcome.errors.join('; ') || 'sem ação'}`,
    })
    details.push(outcome.actions.join(', ') || outcome.errors.join('; '))
  }
  return { applied: anyApplied, detail: details.join(' · ') }
}

import { buildPremiumSingleOrder, scaleLotForSmallCapital, shouldSkipDuplicatePremiumEntry } from './premium-single'
import { formatTrailingDistance, riskPipsFromEntrySl, tradeIdeasDynamicTrailing } from './pip-points'
import { connectionCopyMethod, prefersDirectExecution } from './copy-limits'
import {
  getActiveConnections,
  getCopyConnections,
  logMtmcopySignal,
  markConnectionStatus,
  hasRecentDuplicate,
  hasRecentDuplicateGlobal,
} from './db'
import { computeLotSize, getLotSizingSkipReason, signalForRiskSizing } from './lot-sizing'
import {
  fetchLotSizingContext,
  getAccountSnapshot,
  getSymbolSpecification,
  isMetaApiConfigured,
  placeOrdersSequential,
} from './metaapi'
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
import { CANONICAL_SENSEI_STRATEGY_ID } from './provider-constants'
import {
  applyManagementToAccount,
  applyTrailingToLatestPosition,
  trailingDistanceForConnection,
  trailingDistanceForManagement,
  trailingPointsForConnection,
} from './position-management'
import type { ParsedSignal } from './signal-parser'
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

// Cache de especificações de símbolos
const symbolSpecCache = new Map<
  string,
  { spec: any; cachedAt: number; ttl: number }
>()
const SYMBOL_CACHE_TTL = 30 * 60 * 1000 // 30 minutos

function getSymbolSpecCached(accountId: string, symbol: string, ttl = SYMBOL_CACHE_TTL) {
  const key = `${accountId}:${symbol}`
  const cached = symbolSpecCache.get(key)
  if (cached && Date.now() - cached.cachedAt < cached.ttl) {
    return cached.spec
  }
  return null
}

function setSymbolSpecCache(accountId: string, symbol: string, spec: any) {
  const key = `${accountId}:${symbol}`
  symbolSpecCache.set(key, {
    spec,
    cachedAt: Date.now(),
    ttl: SYMBOL_CACHE_TTL,
  })
}

// Cache de perfis de execução
const execProfileCache = new Map<
  string,
  { profile: any; cachedAt: number; ttl: number }
>()
const EXEC_PROFILE_CACHE_TTL = 5 * 60 * 1000 // 5 minutos

function getExecProfileCached(channel: string, key?: string, ttl = EXEC_PROFILE_CACHE_TTL) {
  const cacheKey = `${channel}:${key || 'default'}`
  const cached = execProfileCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < cached.ttl) {
    return cached.profile
  }
  return null
}

function setExecProfileCache(channel: string, profile: any, key?: string) {
  const cacheKey = `${channel}:${key || 'default'}`
  execProfileCache.set(cacheKey, {
    profile,
    cachedAt: Date.now(),
    ttl: EXEC_PROFILE_CACHE_TTL,
  })
}

async function resolveLogTargets(subscribers: MTMcopierConnection[]): Promise<MTMcopierConnection[]> {
  return subscribers.filter((s) => s.account_role !== 'provider')
}

function buildOrderRequest(
  conn: MTMcopierConnection,
  accountId: string,
  signal: ParsedSignal,
  lot: number,
  comment: string,
): OrderRequest {
  return {
    symbol: signal.symbol!,
    type: signal.orderType === 'limit' ? 'limit' : 'market',
    side: signal.direction === 'buy' ? 'buy' : 'sell',
    volume: lot,
    takeProfit: signal.tp?.[0] ?? undefined,
    stopLoss: signal.sl ?? undefined,
    comment,
    magic: Number.parseInt(`999${accountId.slice(-4)}`, 10),
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
): { status: string; detail: string; connectionPatch: Record<string, any> } {
  const { anySuccess, aiDetail, providerTag, orderLabel, executionSummary, trailingNote, tgRef, resultError } = opts

  const baseDetail = anySuccess
    ? `${aiDetail} · ${providerTag} ${orderLabel} ${executionSummary}${trailingNote} ${tgRef}`.trim()
    : `${aiDetail} · Erro na master: ${resultError || '?'} ${tgRef}`.trim()

  return {
    status: anySuccess ? 'executed' : 'error',
    detail: baseDetail,
    connectionPatch: {
      ...(anySuccess ? { telegram_status: 'connected' } : {}),
    },
  }
}

/**
 * OTIMIZADO: Execução assíncrona com paralelização de chamadas MetaAPI
 * Reduz latência através de Promise.all() para fetchLotSizingContext + getAccountSnapshot
 */
export async function executeViaMtmProvider(
  subscribers: MTMcopierConnection[],
  signal: NonNullable<ParsedSignal>,
  raw: string,
  telegramMessageId: number | undefined,
  provider: MtmChannelProvider | undefined | null,
  channel: MtmcopyChannelKey,
  validation: AiSignalValidation,
) {
  if (!provider) {
    console.warn('[processor-async] Provider não definido')
    return
  }

  const aiDetail = formatAiValidationDetail(validation)
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''

  // Phase 1: Verificações iniciais em paralelo
  const [isDuplicate, executionProfile, providerConn] = await Promise.all([
    hasRecentDuplicateGlobal(raw, telegramMessageId),
    getProviderExecutionProfile(channel, provider.execution).then((p) => {
      setExecProfileCache(channel, p, provider.tag)
      return p
    }),
    getProviderExecutionProfile(channel, provider.execution).then((p) => {
      return {
        id: 'mtm-provider',
        user_id: 'mtm-provider',
        telegram_channel: null,
        metaapi_account_id: provider.accountId,
        account_role: 'provider',
        ...executionProfileToConnectionFields(p),
      }
    }),
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

  // Phase 2: Parallelizar MetaAPI calls (OTIMIZAÇÃO CRÍTICA)
  let cachedSnapshot: any = null
  let cachedSpec: any = null

  const metaApiCalls = []
  if (executionProfile.lot_mode === 'risk_percent') {
    metaApiCalls.push(
      fetchLotSizingContext(provider.accountId, mappedSymbol, signalForExec.direction!)
        .then((ctx) => {
          balance = ctx.balance
          marketPrice = ctx.marketPrice
        })
        .catch((e) => console.warn('[processor-async] fetchLotSizingContext error:', e.message)),
    )
  }

  metaApiCalls.push(
    getAccountSnapshot(provider.accountId)
      .then((snap) => {
        cachedSnapshot = snap
      })
      .catch((e) => console.warn('[processor-async] getAccountSnapshot error:', e.message)),
  )

  if (channel === 'trade-ideas') {
    const cached = getSymbolSpecCached(provider.accountId, mappedSymbol)
    if (cached) {
      cachedSpec = cached
    } else {
      metaApiCalls.push(
        getSymbolSpecification(provider.accountId, mappedSymbol)
          .then((spec) => {
            cachedSpec = spec
            setSymbolSpecCache(provider.accountId, mappedSymbol, spec)
          })
          .catch((e) => console.warn('[processor-async] getSymbolSpecification error:', e.message)),
      )
    }
  }

  // Aguardar todas as chamadas MetaAPI em paralelo
  if (metaApiCalls.length > 0) {
    await Promise.all(metaApiCalls)
  }

  const signalForLot = signalForRiskSizing(signalForExec, marketPrice)
  let totalLot = computeLotSize(providerConn, signalForLot, balance)
  totalLot = resolveLotForSymbol(mappedSymbol, totalLot, executionProfile)

  const equity = cachedSnapshot?.equity ?? cachedSnapshot?.balance ?? balance
  totalLot = scaleLotForSmallCapital(totalLot, equity)

  const lotSkip = getLotSizingSkipReason(
    providerConn,
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
  const exitPcts = {
    tp1: executionProfile.exit_pct_tp1,
    tp2: executionProfile.exit_pct_tp2,
    tp3: executionProfile.exit_pct_tp3,
  }

  const premiumProviderSingle = isPremiumProvider
    ? buildPremiumSingleOrder(signalForExec, totalLot, exitPcts, equity)
    : null

  if (isPremiumProvider && !premiumProviderSingle) {
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
    } else {
      const req = buildOrderRequest(providerConn, provider.accountId, signalForExec, totalLot, mtComment)
      if (channel === 'trade-ideas' && cachedSpec) {
        const entry = signalForExec.entry ?? marketPrice
        const riskPips = riskPipsFromEntrySl(entry, signalForExec.sl, cachedSpec, mappedSymbol)
        const targetPips = riskPipsFromEntrySl(entry, signalForExec.tp?.[0] ?? null, cachedSpec, mappedSymbol)
        req.trailingStop = tradeIdeasDynamicTrailing(riskPips, targetPips)
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

  // Fire-and-forget logging para slave accounts (não bloqueia)
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

export function clearSymbolCache(): void {
  symbolSpecCache.clear()
}

export function clearExecProfileCache(): void {
  execProfileCache.clear()
}

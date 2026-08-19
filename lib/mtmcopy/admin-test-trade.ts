import type { MtmcopyChannelKey } from './channel-context'
import { getProviderExecutionProfile, executionProfileToConnectionFields } from './provider-execution'
import {
  placeOrder,
  isMetaApiConfigured,
  fetchLotSizingContext,
  type OrderRequest,
} from './metaapi'
import { computeLotSize, getLotSizingSkipReason, signalForRiskSizing } from './lot-sizing'
import { trailingDistanceForConnection } from './position-management'
import {
  applySymbolFromProfile,
  mtCommentForProfile,
  resolveLotForSymbol,
  resolveSlTpForSignal,
} from './provider-profile-apply'
import type { ProviderExecutionProfile } from './signal-sources-config'
import type { MTMcopierConnection } from './types'
import type { ParsedSignal } from './signal-parser'

export interface AdminTestTradeInput {
  accountId: string
  channel?: MtmcopyChannelKey
  symbol: string
  direction: 'buy' | 'sell'
  orderType: 'market' | 'limit'
  volume?: number
  entry?: number | null
  sl?: number | null
  tp?: number | null
  execution?: ProviderExecutionProfile | null
  comment?: string
}

function connFromProfile(profile: ProviderExecutionProfile): MTMcopierConnection {
  return {
    id: 'admin-test',
    user_id: 'admin-test',
    telegram_channel: null,
    telegram_status: 'connected',
    mt5_login_last4: null,
    mt5_server: null,
    mt5_status: 'connected',
    ...executionProfileToConnectionFields(profile),
    is_active: true,
    last_signal_at: null,
    last_error: null,
  }
}

export async function executeAdminTestTrade(input: AdminTestTradeInput) {
  if (!isMetaApiConfigured()) {
    return { ok: false as const, error: 'METAAPI_TOKEN não configurado' }
  }

  const channel = input.channel ?? 'premium-signals'
  const profile = input.execution
    ? input.execution
    : await getProviderExecutionProfile(channel)

  const mappedSymbol = applySymbolFromProfile(input.symbol, profile)
  const signal: ParsedSignal = {
    symbol: mappedSymbol,
    direction: input.direction,
    entry: input.orderType === 'limit' ? (input.entry ?? null) : null,
    sl: input.sl ?? null,
    tp: input.tp != null ? [input.tp] : [],
    orderType: input.orderType,
    raw: `admin-test ${mappedSymbol} ${input.direction}`,
  }

  let slTp = resolveSlTpForSignal(signal, profile)
  if (slTp.skipReason && !input.volume) {
    const fallbackSl =
      input.direction === 'buy' ? (input.entry ?? 1) * 0.99 : (input.entry ?? 1) * 1.01
    const fallbackTp =
      input.direction === 'buy' ? (input.entry ?? 1) * 1.01 : (input.entry ?? 1) * 0.99
    slTp = {
      sl: input.sl ?? fallbackSl,
      tp: input.tp ?? fallbackTp,
      skipReason: null,
    }
  }

  const conn = connFromProfile(profile)
  const signalWithSl = { ...signal, sl: slTp.sl, tp: slTp.tp != null ? [slTp.tp] : [] }
  let volume = input.volume ?? 0
  if (!volume || volume <= 0) {
    let balance: number | null = null
    let marketPrice: number | null = null
    if (profile.lot_mode === 'risk_percent') {
      const ctx = await fetchLotSizingContext(input.accountId, mappedSymbol, input.direction)
      balance = ctx.balance
      marketPrice = ctx.marketPrice
    }
    const signalForLot = signalForRiskSizing(signalWithSl, marketPrice)
    volume = computeLotSize(conn, signalForLot, balance)
    volume = resolveLotForSymbol(mappedSymbol, volume, profile)
    const skip = getLotSizingSkipReason(conn, signalWithSl, balance, volume, marketPrice)
    if (skip) return { ok: false as const, error: skip }
    if (!volume || volume <= 0) volume = 0.01
  }

  const comment = input.comment?.trim() || mtCommentForProfile(profile, 'MTM-TEST')
  const req: OrderRequest = {
    accountId: input.accountId,
    symbol: mappedSymbol,
    direction: profile.reverse_signals
      ? input.direction === 'buy'
        ? 'sell'
        : 'buy'
      : input.direction,
    volume,
    orderType: input.orderType,
    openPrice: signal.entry,
    stopLoss: profile.copy_sl !== false ? slTp.sl : null,
    takeProfit: profile.copy_tp !== false ? slTp.tp : null,
    comment,
    trailingStop:
      channel === 'trade-ideas'
        ? trailingDistanceForConnection(conn)
        : undefined,
  }

  const result = await placeOrder(req)
  return {
    ok: result.success,
    result,
    volume,
    symbol: mappedSymbol,
    comment,
    error: result.error,
  }
}

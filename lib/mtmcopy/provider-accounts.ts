import type { MtmcopyChannelKey } from './channel-context'
import type { ProviderExecutionProfile } from './signal-sources-config'
import type { MTMcopierConnection } from './types'

export interface MtmChannelProvider {
  channel: MtmcopyChannelKey
  accountId: string
  tag: string
  strategyId: string | null
  routeId?: string
  execution?: ProviderExecutionProfile
}

/** Perfil de execução das contas MTM (provider) — 0,75% risco + gestão por canal */
export const MTM_PROVIDER_EXECUTION_PROFILE: Pick<
  MTMcopierConnection,
  | 'lot_mode'
  | 'lot_value'
  | 'max_risk_percent'
  | 'copy_sl'
  | 'copy_tp'
  | 'auto_trailing_stop'
  | 'trailing_stop_points'
  | 'reverse_signals'
  | 'symbols_whitelist'
> = {
  lot_mode: 'risk_percent',
  lot_value: 0.75,
  max_risk_percent: 2,
  copy_sl: true,
  copy_tp: true,
  auto_trailing_stop: true,
  trailing_stop_points: 200,
  reverse_signals: false,
  symbols_whitelist: null,
}

const PREMIUM_ACCOUNT_DEFAULT = 'c17a8c46-7fe7-40cf-acb4-41678d42f9a9'
const TRADE_IDEAS_ACCOUNT_DEFAULT = 'fbeeafeb-96a9-4133-bc6c-194cc281b6e0'

function envOr(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback
}

/** Contas MetaAPI MTM por canal Telegram (execução directa + CopyFactory provider). */
export function getMtmChannelProviders(): Record<MtmcopyChannelKey, MtmChannelProvider | null> {
  const legacyAccount = process.env.METAAPI_PROVIDER_ACCOUNT_ID?.trim() || null
  const legacyStrategy = process.env.METAAPI_COPY_STRATEGY_ID?.trim() || null

  const premium: MtmChannelProvider = {
    channel: 'premium-signals',
    accountId: envOr('METAAPI_PROVIDER_PREMIUM_ACCOUNT_ID', PREMIUM_ACCOUNT_DEFAULT),
    tag: 'Conta XAUUSD PREMIUM',
    strategyId:
      process.env.METAAPI_COPY_STRATEGY_PREMIUM_ID?.trim() ||
      legacyStrategy,
  }

  const tradeIdeas: MtmChannelProvider = {
    channel: 'trade-ideas',
    accountId: envOr('METAAPI_PROVIDER_TRADE_IDEAS_ACCOUNT_ID', TRADE_IDEAS_ACCOUNT_DEFAULT),
    tag: 'Conta Trade Ideas',
    strategyId:
      process.env.METAAPI_COPY_STRATEGY_TRADE_IDEAS_ID?.trim() ||
      legacyStrategy,
  }

  return {
    'premium-signals': premium.accountId ? premium : null,
    'trade-ideas': tradeIdeas.accountId ? tradeIdeas : null,
  }
}

export function getMtmProviderForChannel(
  channel: MtmcopyChannelKey,
): MtmChannelProvider | null {
  if (channel === 'unknown') return null
  const providers = getMtmChannelProviders()
  return providers[channel] ?? null
}

export function hasMtmProviderConfigured(): boolean {
  const p = getMtmChannelProviders()
  return Boolean(p['premium-signals'] || p['trade-ideas'])
}

export function getMtmProviderAccountId(channel: MtmcopyChannelKey): string | null {
  return getMtmProviderForChannel(channel)?.accountId ?? null
}

export function getMtmProviderStrategyId(channel: MtmcopyChannelKey): string | null {
  return getMtmProviderForChannel(channel)?.strategyId ?? null
}

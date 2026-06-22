import {
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_SENSEI_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
} from './provider-constants'
import {
  PREMIUM_PROVIDER_EXECUTION,
  SENSEI_PROVIDER_EXECUTION,
  TRADE_IDEAS_PROVIDER_EXECUTION,
} from './provider-execution'
import { MTM_DEFAULT_RISK_PERCENT } from './provider-accounts'
import type { ProviderRoute } from './signal-sources-config'

export {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_SENSEI_STRATEGY_ID,
} from './provider-constants'

/** Rotas provider MTM Auto — uma conta/estratégia por canal ou fonte de sinal. */
export function buildCanonicalProviderRoutes(): ProviderRoute[] {
  return [
    {
      id: 'canonical-premium-signals',
      label: 'MTM Auto Premium',
      sender_channel: 'premium-signals',
      sender_chat_id: resolvedPremiumSignalsChatId(),
      signal_source: 'telegram',
      account_id: CANONICAL_PREMIUM_ACCOUNT_ID,
      strategy_id: CANONICAL_PREMIUM_STRATEGY_ID,
      tag: 'MTM Auto Premium',
      ai_strategy_prompt: null,
      execution: {
        ...PREMIUM_PROVIDER_EXECUTION,
        lot_value: MTM_DEFAULT_RISK_PERCENT,
        mt_comment: 'MTM Auto Premium',
      },
      enabled: true,
    },
    {
      id: 'canonical-trade-ideas',
      label: 'MTM Auto Trade Ideas',
      sender_channel: 'trade-ideas',
      sender_chat_id: resolvedTradeIdeasChatId(),
      signal_source: 'telegram',
      account_id: CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
      strategy_id: CANONICAL_TRADE_IDEAS_STRATEGY_ID,
      tag: 'MTM Auto Trade Ideas',
      ai_strategy_prompt: null,
      execution: {
        ...TRADE_IDEAS_PROVIDER_EXECUTION,
        lot_value: MTM_DEFAULT_RISK_PERCENT,
        trailing_stop_points: 100,
        mt_comment: 'MTM Auto Trade Ideas',
      },
      enabled: true,
    },
    {
      id: 'canonical-sensei-scanner',
      label: 'MTM Auto Sensei',
      sender_channel: 'trade-ideas',
      sender_chat_id: resolvedTradeIdeasChatId(),
      signal_source: 'webhook',
      account_id: CANONICAL_SENSEI_ACCOUNT_ID,
      strategy_id:
        process.env.METAAPI_COPY_STRATEGY_SENSEI_ID?.trim() || CANONICAL_SENSEI_STRATEGY_ID,
      tag: 'MTM Auto Sensei',
      ai_strategy_prompt: null,
      execution: {
        ...SENSEI_PROVIDER_EXECUTION,
        lot_value: MTM_DEFAULT_RISK_PERCENT,
        mt_comment: 'MTM Auto Sensei',
      },
      enabled: true,
    },
  ]
}

/** Repara rotas mal configuradas (chat errado, sender_channel null, contas trocadas). */
export function repairProviderRoutes(routes: ProviderRoute[]): ProviderRoute[] {
  const canonical = buildCanonicalProviderRoutes()
  const custom = routes.filter(
    (r) =>
      r.enabled !== false &&
      r.account_id?.trim() &&
      !isCanonicalRoute(r) &&
      r.id !== 'legacy-global',
  )

  const merged = [...canonical, ...custom]
  const seenAccount = new Set<string>()
  return merged.filter((r) => {
    const acc = r.account_id.trim()
    if (seenAccount.has(acc)) return false
    seenAccount.add(acc)
    return true
  })
}

function isCanonicalRoute(r: ProviderRoute): boolean {
  if (r.account_id === CANONICAL_PREMIUM_ACCOUNT_ID) return true
  if (r.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID) return true
  if (r.account_id === CANONICAL_SENSEI_ACCOUNT_ID) return true
  if (r.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID) return true
  if (r.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID) return true
  if (r.strategy_id === CANONICAL_SENSEI_STRATEGY_ID) return true
  return false
}

export function routeBelongsToChannel(
  route: ProviderRoute,
  channel: 'premium-signals' | 'trade-ideas',
): boolean {
  if (route.signal_source === 'webhook') return false

  if (route.sender_channel === channel) return true

  if (channel === 'premium-signals') {
    if (
      route.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID ||
      route.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID ||
      route.strategy_id === CANONICAL_SENSEI_STRATEGY_ID ||
      route.account_id === CANONICAL_SENSEI_ACCOUNT_ID
    ) {
      return false
    }
    return (
      route.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID ||
      route.account_id === CANONICAL_PREMIUM_ACCOUNT_ID
    )
  }

  if (
    route.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID ||
    route.account_id === CANONICAL_PREMIUM_ACCOUNT_ID
  ) {
    return false
  }
  return (
    route.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID ||
    route.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID
  )
}

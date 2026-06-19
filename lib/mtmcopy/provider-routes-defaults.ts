import {
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'
import { PREMIUM_PROVIDER_EXECUTION, TRADE_IDEAS_PROVIDER_EXECUTION } from './provider-execution'
import type { ProviderRoute } from './signal-sources-config'

export const CANONICAL_PREMIUM_ACCOUNT_ID = 'c17a8c46-7fe7-40cf-acb4-41678d42f9a9'
export const CANONICAL_TRADE_IDEAS_ACCOUNT_ID = 'fbeeafeb-96a9-4133-bc6c-194cc281b6e0'
export const CANONICAL_PREMIUM_STRATEGY_ID = '9gsL'
export const CANONICAL_TRADE_IDEAS_STRATEGY_ID = '5IHE'

/** Rotas provider MTM Auto — uma conta/estratégia por canal Telegram. */
export function buildCanonicalProviderRoutes(): ProviderRoute[] {
  return [
    {
      id: 'canonical-premium-signals',
      label: 'MTM Auto - Premium · MT5-17980',
      sender_channel: 'premium-signals',
      sender_chat_id: resolvedPremiumSignalsChatId(),
      account_id: CANONICAL_PREMIUM_ACCOUNT_ID,
      strategy_id: CANONICAL_PREMIUM_STRATEGY_ID,
      tag: 'MTM Auto - Premium',
      ai_strategy_prompt: null,
      execution: {
        ...PREMIUM_PROVIDER_EXECUTION,
        lot_value: 0.75,
        mt_comment: 'MTM Auto - Premium',
      },
      enabled: true,
    },
    {
      id: 'canonical-trade-ideas',
      label: 'MTM Auto - Trade Ideas · MT5-17986',
      sender_channel: 'trade-ideas',
      sender_chat_id: resolvedTradeIdeasChatId(),
      account_id: CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
      strategy_id: CANONICAL_TRADE_IDEAS_STRATEGY_ID,
      tag: 'MTM Auto - Trade Ideas',
      ai_strategy_prompt: null,
      execution: {
        ...TRADE_IDEAS_PROVIDER_EXECUTION,
        lot_value: 0.75,
        trailing_stop_points: 100,
        mt_comment: 'MTM Auto - Forex',
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
  if (r.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID) return true
  if (r.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID) return true
  return false
}

export function routeBelongsToChannel(
  route: ProviderRoute,
  channel: 'premium-signals' | 'trade-ideas',
): boolean {
  if (route.sender_channel === channel) return true

  if (channel === 'premium-signals') {
    if (
      route.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID ||
      route.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID
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

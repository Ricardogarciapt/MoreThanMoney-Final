import type { MtmcopyChannelKey } from './channel-context'
import { chatIdsMatch } from './channels'
import { getMtmChannelProviders } from './provider-accounts'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
} from './provider-constants'
import {
  repairProviderRoutes,
  routeBelongsToChannel,
} from './provider-routes-defaults'
import type {
  MtmcopyChannelProviderConfig,
  MtmcopySignalSourcesConfig,
  MtmcopyTelegramChannelKey,
  ProviderExecutionProfile,
  ProviderRoute,
} from './signal-sources-config'

const CHANNEL_KEYS: MtmcopyTelegramChannelKey[] = ['premium-signals', 'trade-ideas']

export function newProviderRouteId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `route-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function routeFromChannelConfig(
  channel: MtmcopyTelegramChannelKey,
  cfg: MtmcopyChannelProviderConfig,
): ProviderRoute {
  const env = getMtmChannelProviders()[channel]
  return {
    id: `legacy-${channel}`,
    label: cfg.tag ?? env?.tag ?? channel,
    sender_channel: channel,
    account_id: cfg.account_id,
    strategy_id: cfg.strategy_id ?? env?.strategyId ?? null,
    tag: cfg.tag ?? env?.tag,
    execution: cfg.execution,
    enabled: true,
  }
}

/** Normaliza rotas: repara canónicas → provider_routes → channel_providers → env. */
export function normalizeProviderRoutes(config: MtmcopySignalSourcesConfig): ProviderRoute[] {
  const fromRoutes = (config.provider_routes ?? []).filter((r) => r.account_id?.trim())
  if (fromRoutes.length) {
    const normalized = fromRoutes.map((r) => ({
      ...r,
      enabled: r.enabled !== false,
      account_id: r.account_id.trim(),
      strategy_id: r.strategy_id?.trim() || null,
    }))
    return repairProviderRoutes(normalized)
  }

  const legacy: ProviderRoute[] = []
  for (const key of CHANNEL_KEYS) {
    const cfg = config.channel_providers?.[key]
    if (cfg?.account_id?.trim()) {
      legacy.push(routeFromChannelConfig(key, cfg))
    }
  }

  if (legacy.length) return legacy

  const envProviders = getMtmChannelProviders()
  for (const key of CHANNEL_KEYS) {
    const env = envProviders[key]
    if (env?.accountId) {
      legacy.push({
        id: `env-${key}`,
        label: env.tag,
        sender_channel: key,
        account_id: env.accountId,
        strategy_id: env.strategyId,
        tag: env.tag,
        enabled: true,
      })
    }
  }

  if (
    !legacy.length &&
    config.provider_account_id?.trim()
  ) {
    legacy.push({
      id: 'legacy-global',
      label: 'Provider global',
      sender_channel: null,
      account_id: config.provider_account_id.trim(),
      strategy_id: config.provider_strategy_id,
      enabled: true,
    })
  }

  return legacy
}

/** Mantém channel_providers em sync (1ª rota por canal) para código legado. */
export function syncChannelProvidersFromRoutes(
  routes: ProviderRoute[],
): MtmcopySignalSourcesConfig['channel_providers'] {
  const out: NonNullable<MtmcopySignalSourcesConfig['channel_providers']> = {}
  for (const r of routes) {
    if (r.enabled === false || !r.sender_channel || !r.account_id?.trim()) continue
    if (out[r.sender_channel]) continue
    out[r.sender_channel] = {
      account_id: r.account_id.trim(),
      strategy_id: r.strategy_id,
      tag: r.tag ?? r.label,
      execution: r.execution,
    }
  }
  return Object.keys(out).length ? out : undefined
}

export function routeMatchesSignal(
  route: ProviderRoute,
  channel: MtmcopyChannelKey,
  chatId?: string | number | null,
): boolean {
  if (route.enabled === false || !route.account_id?.trim()) return false

  if (channel !== 'unknown') {
    if (route.sender_channel && route.sender_channel !== channel) return false
    if (!routeBelongsToChannel(route, channel)) return false
  }

  if (route.sender_channel && channel !== 'unknown' && route.sender_channel === channel) {
    return true
  }

  if (route.sender_chat_id && chatId != null) {
    return chatIdsMatch(route.sender_chat_id, chatId)
  }

  if (route.sender_channel && channel !== 'unknown') {
    return route.sender_channel === channel
  }

  return false
}

/** Uma rota provider por sinal — evita duplicar trades na mesma conta. */
export function pickSingleProviderRoute(
  routes: ProviderRoute[],
  channel: MtmcopyChannelKey,
  chatId?: string | number | null,
): ProviderRoute | null {
  const matched = routes.filter((r) => routeMatchesSignal(r, channel, chatId))
  if (!matched.length) return null

  if (channel === 'premium-signals') {
    return (
      matched.find(
        (r) =>
          r.sender_channel === 'premium-signals' ||
          r.strategy_id === CANONICAL_PREMIUM_STRATEGY_ID ||
          r.account_id === CANONICAL_PREMIUM_ACCOUNT_ID,
      ) ?? matched[0]!
    )
  }

  if (channel === 'trade-ideas') {
    return (
      matched.find(
        (r) =>
          r.sender_channel === 'trade-ideas' ||
          r.strategy_id === CANONICAL_TRADE_IDEAS_STRATEGY_ID ||
          r.account_id === CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
      ) ?? matched[0]!
    )
  }

  return matched[0]!
}

export function strategyIdsFromRoutes(
  routes: ProviderRoute[],
  groups: Array<'premium' | 'trade_ideas'>,
): string[] {
  const ids: string[] = []
  const channelForGroup = (g: 'premium' | 'trade_ideas'): MtmcopyTelegramChannelKey =>
    g === 'premium' ? 'premium-signals' : 'trade-ideas'

  for (const g of groups) {
    const ch = channelForGroup(g)
    for (const r of routes) {
      if (r.enabled !== false && r.sender_channel === ch && r.strategy_id?.trim()) {
        ids.push(r.strategy_id.trim())
      }
    }
  }

  return [...new Set(ids)]
}

export function strategyOptionsFromRoutes(routes: ProviderRoute[]): Array<{
  id: string
  channelKey: MtmcopyTelegramChannelKey | null
  title: string
  description: string
  accountId?: string
}> {
  return routes
    .filter((r) => r.enabled !== false && r.strategy_id?.trim())
    .map((r) => ({
      id: r.strategy_id!.trim(),
      channelKey: r.sender_channel ?? null,
      accountId: r.account_id,
      title: r.label ?? r.tag ?? `Estratégia ${r.strategy_id!.slice(0, 8)}`,
      description:
        r.sender_channel === 'premium-signals'
          ? 'Premium · Ouro'
          : r.sender_channel === 'trade-ideas'
            ? 'Trade Ideas · Forex'
            : 'Rota CopyFactory personalizada',
    }))
}

export function executionForRoute(
  route: ProviderRoute,
  channel: MtmcopyChannelKey,
  fallback?: ProviderExecutionProfile,
): ProviderExecutionProfile | undefined {
  return route.execution ?? fallback
}

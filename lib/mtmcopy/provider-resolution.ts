import type { MtmcopyChannelKey } from './channel-context'
import {
  getMtmChannelProviders,
  type MtmChannelProvider,
} from './provider-accounts'
import { normalizeProviderRoutes, routeMatchesSignal } from './provider-routes'
import {
  getSignalSourcesConfig,
  type MtmcopyTelegramChannelKey,
} from './signal-sources-config'

/** Resolve conta provider MetaAPI: DB (admin) → env vars por canal. */
export async function resolveMtmProviderForChannel(
  channel: MtmcopyChannelKey,
): Promise<MtmChannelProvider | null> {
  const all = await resolveMtmProvidersForSignal(channel)
  return all[0] ?? null
}

/** Todas as rotas sender → mestre que correspondem ao canal/chat do sinal. */
export async function resolveMtmProvidersForSignal(
  channel: MtmcopyChannelKey,
  chatId?: string | number | null,
): Promise<MtmChannelProvider[]> {
  if (channel === 'unknown' && chatId == null) return []

  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const envProviders = getMtmChannelProviders()

  const matched = routes.filter((r) => routeMatchesSignal(r, channel, chatId))
  if (matched.length) {
    const seen = new Set<string>()
    const out: MtmChannelProvider[] = []
    for (const r of matched) {
      const accountId = r.account_id.trim()
      if (seen.has(accountId)) continue
      seen.add(accountId)
      const ch = (r.sender_channel ?? (channel !== 'unknown' ? channel : 'premium-signals')) as MtmcopyTelegramChannelKey
      const envDefault = envProviders[ch]
      out.push({
        channel: ch,
        accountId,
        tag: r.tag?.trim() || r.label?.trim() || envDefault?.tag || accountId.slice(0, 8),
        strategyId:
          r.strategy_id?.trim() ||
          config.provider_strategy_id ||
          envDefault?.strategyId ||
          null,
        routeId: r.id,
        execution: r.execution,
      })
    }
    return out
  }

  const single = await resolveLegacySingleProvider(channel, config, envProviders)
  return single ? [single] : []
}

async function resolveLegacySingleProvider(
  channel: MtmcopyChannelKey,
  config: Awaited<ReturnType<typeof getSignalSourcesConfig>>,
  envProviders: ReturnType<typeof getMtmChannelProviders>,
): Promise<MtmChannelProvider | null> {
  if (channel === 'unknown') return null

  const key = channel as MtmcopyTelegramChannelKey
  const envDefault = envProviders[key]

  const fromDb = config.channel_providers?.[key]
  if (fromDb?.account_id?.trim()) {
    return {
      channel: key,
      accountId: fromDb.account_id.trim(),
      tag: fromDb.tag?.trim() || envDefault?.tag || key,
      strategyId:
        fromDb.strategy_id?.trim() ||
        config.provider_strategy_id ||
        envDefault?.strategyId ||
        null,
      execution: fromDb.execution,
    }
  }

  if (config.provider_account_id?.trim()) {
    return {
      channel: key,
      accountId: config.provider_account_id.trim(),
      tag: envDefault?.tag || 'MTM Provider',
      strategyId:
        config.provider_strategy_id?.trim() || envDefault?.strategyId || null,
    }
  }

  return envDefault
}

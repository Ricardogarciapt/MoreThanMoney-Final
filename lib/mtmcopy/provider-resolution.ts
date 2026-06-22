import type { MtmcopyChannelKey } from './channel-context'
import {
  getMtmChannelProviders,
  type MtmChannelProvider,
} from './provider-accounts'
import { normalizeProviderRoutes, pickSingleProviderRoute } from './provider-routes'
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

/** Resolve provider por strategy ID CopyFactory (método «Estratégia MTM» / webhook). */
export async function resolveMtmProviderForStrategyId(
  strategyId: string,
): Promise<MtmChannelProvider | null> {
  const pick = strategyId?.trim()
  if (!pick) return null

  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const route =
    routes.find((r) => r.enabled !== false && r.strategy_id?.trim() === pick) ?? null
  if (!route) return null

  const ch = (route.sender_channel ?? 'trade-ideas') as MtmcopyTelegramChannelKey
  const envDefault = getMtmChannelProviders()[ch]
  return {
    channel: ch,
    accountId: route.account_id.trim(),
    tag: route.tag?.trim() || route.label?.trim() || envDefault?.tag || 'MTM Provider',
    strategyId: pick,
    routeId: route.id,
    execution: route.execution,
    aiStrategyPrompt: route.ai_strategy_prompt ?? null,
  }
}

/** Todas as rotas sender → mestre que correspondem ao canal/chat do sinal. */
export async function resolveMtmProvidersForSignal(
  channel: MtmcopyChannelKey,
  chatId?: string | number | null,
  opts?: { signalSource?: 'telegram' | 'webhook' },
): Promise<MtmChannelProvider[]> {
  if (channel === 'unknown' && chatId == null) return []

  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const envProviders = getMtmChannelProviders()

  const picked = pickSingleProviderRoute(routes, channel, chatId, opts)
  if (picked) {
    const ch = (picked.sender_channel ?? (channel !== 'unknown' ? channel : 'premium-signals')) as MtmcopyTelegramChannelKey
    const envDefault = envProviders[ch]
    return [
      {
        channel: ch,
        accountId: picked.account_id.trim(),
        tag: picked.tag?.trim() || picked.label?.trim() || envDefault?.tag || picked.account_id.slice(0, 8),
        strategyId:
          picked.strategy_id?.trim() ||
          config.provider_strategy_id ||
          envDefault?.strategyId ||
          null,
        routeId: picked.id,
        execution: picked.execution,
        aiStrategyPrompt: picked.ai_strategy_prompt ?? null,
      },
    ]
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

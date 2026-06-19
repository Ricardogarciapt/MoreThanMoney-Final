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

/** Todas as rotas sender → mestre que correspondem ao canal/chat do sinal. */
export async function resolveMtmProvidersForSignal(
  channel: MtmcopyChannelKey,
  chatId?: string | number | null,
): Promise<MtmChannelProvider[]> {
  if (channel === 'unknown' && chatId == null) return []

  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const envProviders = getMtmChannelProviders()

  const picked = pickSingleProviderRoute(routes, channel, chatId)
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

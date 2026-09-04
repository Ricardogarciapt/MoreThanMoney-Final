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

  /**
   * Sem rota, não se executa. Ponto.
   *
   * Aqui existia um caminho legado que, quando nenhuma rota servia o sinal, ia buscar a conta
   * mestre ao mapa antigo `channel_providers` ou ao global `provider_account_id`. Fazia duas
   * coisas más ao mesmo tempo:
   *
   *  · Furava a PAUSA. Uma rota desligada deixava de ser escolhida e o sinal encontrava a mesma
   *    conta pelo caminho de trás, sem interruptor nenhum. Foi assim que a 04/09, com o Premium
   *    pausado às 13:32, o sinal das 13:50 abriu na conta mestre 20 segundos depois.
   *  · Dava destino a quem não tem. O canal `trade-ideas` não tem rota própria e caía no global,
   *    que aponta para a conta mestre do PREMIUM — um sinal de ideias abria na conta do Premium.
   *
   * Não é preciso para nada: quando não há `provider_routes` guardadas, o próprio
   * `normalizeProviderRoutes` já constrói rotas a partir do `channel_providers` e do ambiente.
   * O que este atalho acrescentava era só a hipótese de saltar o `enabled`.
   */
  return []
}


import { getSignalSourcesConfig } from './signal-sources-config'
import type { ProviderRoute } from './signal-sources-config'
import { normalizeProviderRoutes } from './provider-routes'

/** Mapeia o sender_channel da rota provider → canais de chat onde os sinais aparecem. */
export const T2T_SENDER_TO_CHAT: Record<string, string[]> = {
  'premium-signals': ['premium-ideas'],
  // trade-ideas cobre Forex + MTM Scanner + Índices + Forex Swings + Cripto (PrimeVerse) +
  // Sensei VALIDADO (só as entradas activadas que caem no chat 'sensei-scanner').
  // O GoldKiller usa app_channel próprio ('sinais-goldkiller').
  // 2026-08-27: saiu daqui o 'trade-ideas-setup' (Ideias de Forex) — muito aviso, pouco toque.
  //
  // O 'sinais-scanner-mtm' esteve fora durante umas horas por engano meu: o slug lê-se como
  // "sinais scanner MTM", mas o canal chama-se **Sinais PrimeVerse** e é por ele que entram os
  // sinais dos traders de topo do PrimeVerse — que são para aceitar, não para esconder.
  'trade-ideas': ['sinais-scanner-mtm', 'trade-ideas', 'ideias-e-sinais', 'cripto-perps', 'sensei-scanner'],
}

/**
 * Âmbito T2T decidido: MTM Scanner + GoldKiller + Forex + Premium + Sensei (entradas
 * validadas — pedido Ricardo 2026-08-20: Sensei entra no monitor/gestão T2T completa).
 * Nota: a lista viva é calculada dinamicamente por tapToTradeEnabledChannels() a partir
 * das rotas com tap_to_trade=true; esta constante é o espelho canónico/documental.
 */
// 'cripto-perps' entra aqui para os perpétuos poderem ser SEGUIDOS no T2T (ver t2tMode:
// nos perpétuos o botão não abre ordem, marca o sinal como seguido). Sem isto o fallback
// rejeitava-os com 'provider_off' quando a configuração de rotas não estivesse disponível.
export const T2T_SIGNAL_CHANNELS = ['sinais-scanner-mtm', 'trade-ideas', 'ideias-e-sinais', 'sinais-goldkiller', 'premium-ideas', 'sensei-scanner', 'cripto-perps']

/** Slug do canal de chat DEDICADO de uma rota provider (estável, por id da rota). */
export function deriveProviderChannelSlug(r: ProviderRoute): string {
  return `t2t-${r.id}`
}

/**
 * Canal(is) de chat onde os sinais de uma rota provider aparecem:
 *  1) app_channel explícito na rota; senão
 *  2) mapa canónico por sender_channel (Premium/Sensei/Trade Ideas); senão (rota custom)
 *  3) canal DEDICADO da rota (t2t-<id>) — auto-criado no chat quando a rota está ativa.
 */
export function appChannelsForRoute(r: ProviderRoute): string[] {
  if (r.app_channel?.trim()) return [r.app_channel.trim()]
  const mapped = T2T_SENDER_TO_CHAT[r.sender_channel ?? '']
  if (mapped?.length) return mapped
  return [deriveProviderChannelSlug(r)]
}

/**
 * Canais de chat ATIVOS no Tap to Trade — qualquer rota com tap_to_trade + enabled,
 * incluindo rotas custom (sem sender_channel). Devolve null se a config falhar.
 */
export async function tapToTradeEnabledChannels(): Promise<Set<string> | null> {
  try {
    const config = await getSignalSourcesConfig()
    const routes = normalizeProviderRoutes(config)
    const set = new Set<string>()
    for (const r of routes) {
      if (r.tap_to_trade === true && r.enabled !== false) {
        for (const ch of appChannelsForRoute(r)) set.add(ch)
      }
    }
    // Fontes sem conta provedora (o cliente é quem abre) — ver t2t_extra_channels.
    for (const ch of config.t2t_extra_channels ?? []) {
      const slug = String(ch).trim()
      if (slug) set.add(slug)
    }
    return set
  } catch {
    return null
  }
}

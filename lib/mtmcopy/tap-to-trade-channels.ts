import { getSignalSourcesConfig } from './signal-sources-config'
import { normalizeProviderRoutes } from './provider-routes'

/** Mapeia o sender_channel da rota provider → canais de chat onde os sinais aparecem. */
export const T2T_SENDER_TO_CHAT: Record<string, string[]> = {
  'premium-signals': ['premium-ideas'],
  'trade-ideas': ['sensei-scanner', 'trade-ideas-setup', 'trade-ideas'],
}

/** Todos os canais de chat que podem ser sinais T2T. */
export const T2T_SIGNAL_CHANNELS = ['sensei-scanner', 'trade-ideas', 'premium-ideas', 'trade-ideas-setup']

/**
 * Canais de chat ativos no Tap to Trade — providers com tap_to_trade + enabled.
 * Devolve null se a config falhar (chamadores decidem como tratar).
 */
export async function tapToTradeEnabledChannels(): Promise<Set<string> | null> {
  try {
    const routes = normalizeProviderRoutes(await getSignalSourcesConfig())
    const set = new Set<string>()
    for (const r of routes) {
      if (r.tap_to_trade === true && r.enabled !== false) {
        for (const ch of T2T_SENDER_TO_CHAT[r.sender_channel ?? ''] ?? []) set.add(ch)
      }
    }
    return set
  } catch {
    return null
  }
}

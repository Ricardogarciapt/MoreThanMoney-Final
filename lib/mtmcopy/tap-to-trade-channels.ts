import { getSignalSourcesConfig } from './signal-sources-config'
import type { ProviderRoute } from './signal-sources-config'
import { normalizeProviderRoutes } from './provider-routes'

/** Mapeia o sender_channel da rota provider → canais de chat onde os sinais aparecem. */
export const T2T_SENDER_TO_CHAT: Record<string, string[]> = {
  'premium-signals': ['premium-ideas'],
  'trade-ideas': ['sensei-scanner', 'trade-ideas-setup', 'trade-ideas'],
}

/** Canais de sinais "base" (canónicos). */
export const T2T_SIGNAL_CHANNELS = ['sensei-scanner', 'trade-ideas', 'premium-ideas', 'trade-ideas-setup']

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
    const routes = normalizeProviderRoutes(await getSignalSourcesConfig())
    const set = new Set<string>()
    for (const r of routes) {
      if (r.tap_to_trade === true && r.enabled !== false) {
        for (const ch of appChannelsForRoute(r)) set.add(ch)
      }
    }
    return set
  } catch {
    return null
  }
}

/**
 * ALLOWLIST de FONTES do Tap to Trade — módulo PURO (sem imports de servidor) para ser partilhado
 * pelo cliente (chat-channels.tsx, tap-to-trade-feed.tsx) E pelo servidor (accept do T2T), sem
 * dessincronizar. Pedido do Ricardo (2026-08-06): SÓ Premium, Sensei, James (Forex Swings) e
 * PrimeVerse são negociáveis — senão o T2T fica poluído com ecos do master-poll de todos os
 * providers, alertas MTM Scanner, GoldKiller, etc. Como vários canais são PARTILHADOS, o filtro é
 * por FONTE (assinatura no conteúdo/canal), não só por canal.
 *  - Premium      → canal 'premium-ideas'
 *  - Sensei       → canal 'sensei-scanner' (com o gate próprio de entrada validada, à parte)
 *  - James/Swings → marcador '🌊 Forex Swings' (canal 'ideias-e-sinais')
 *  - PrimeVerse   → marcador '📡 PrimeVerse' (canais partilhados por classe de ativo)
 */
export function isAllowedT2TSource(channelSlug?: string | null, content?: string | null): boolean {
  if (!channelSlug) return false
  if (channelSlug === 'premium-ideas' || channelSlug === 'sensei-scanner') return true
  const c = content ?? ''
  if (channelSlug === 'ideias-e-sinais') return /forex\s*swings/i.test(c) // James
  if (
    channelSlug === 'sinais-scanner-mtm' ||
    channelSlug === 'cripto-perps' ||
    channelSlug === 'trade-ideas' ||
    channelSlug === 'trade-ideas-setup'
  ) {
    return /primeverse/i.test(c) // só PrimeVerse nos canais partilhados por classe de ativo
  }
  return false
}

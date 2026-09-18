/**
 * Cancel/close do trader (estratégias MTM Auto Edge / King / Wolf) → wrapper fino sobre o ciclo de
 * vida GENÉRICO do T2T (t2t-lifecycle). A entrada traz a etiqueta da estratégia («📌 MTM Auto Edge»,
 * formato único) — ou, nas mensagens antigas, o marcador da fonte; a acção (thread + fecho das
 * ordens T2T dos seguidores) é a mesma para todas as fontes. Ver [[t2t-lifecycle]].
 */
import { closeT2TFollowersForSignal } from './t2t-lifecycle'

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function handlePrimeverseCancelClose(opts: {
  kind: 'cancel' | 'close'
  chatSlug: string
  symbol: string
  direction: 'buy' | 'sell' | null
  /** «MTM Auto Edge» | «MTM Auto King» | «MTM Auto Wolf» — o texto nunca nomeia a fonte externa. */
  estrategia: string
}): Promise<{ threaded: boolean; followers: number; cancelled: number; closed: number }> {
  const { estrategia, ...resto } = opts
  return closeT2TFollowersForSignal({
    ...resto,
    label: estrategia,
    sourceMatch: new RegExp(`${escapar(estrategia)}|primeverse`, 'i'),
  })
}

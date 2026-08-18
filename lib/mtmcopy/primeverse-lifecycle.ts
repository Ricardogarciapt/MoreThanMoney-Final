/**
 * PrimeVerse cancel/close → wrapper fino sobre o ciclo de vida GENÉRICO do T2T (t2t-lifecycle).
 * A entrada PrimeVerse traz o marcador "📡 PrimeVerse"; a ação (thread + fecho das ordens T2T dos
 * seguidores) é a mesma para todas as fontes. Ver [[t2t-lifecycle]].
 */
import { closeT2TFollowersForSignal } from './t2t-lifecycle'

export async function handlePrimeverseCancelClose(opts: {
  kind: 'cancel' | 'close'
  chatSlug: string
  symbol: string
  direction: 'buy' | 'sell' | null
}): Promise<{ threaded: boolean; followers: number; cancelled: number; closed: number }> {
  return closeT2TFollowersForSignal({
    ...opts,
    label: 'PrimeVerse',
    sourceMatch: /primeverse/i,
  })
}

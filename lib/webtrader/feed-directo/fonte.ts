/**
 * A DECISÃO DA FONTE — pura, para a guarda provar o caso mau (um feed caído a deixar o ecrã sem preços).
 *
 *   'conta' enquanto o feed está ligado; quando cai, aguenta-se QUEDA_PARA_MTM_MS (reconexões do
 *   SDK, um 429 da TradeLocker) e só depois se passa ao feed MTM; mal volte a 'ligado', volta-se.
 *   Sem feed nenhum (sem conta, credencial recusada): sempre 'mtm'.
 */
import type { EstadoFeed } from './tipos'

export const QUEDA_PARA_MTM_MS = 10_000

export interface MemoriaFonte { caidoDesde: number | null }

export function decidirFonte(estado: EstadoFeed | null, m: MemoriaFonte, agora: number): 'conta' | 'mtm' {
  if (!estado) { m.caidoDesde = null; return 'mtm' }
  if (estado === 'ligado') { m.caidoDesde = null; return 'conta' }
  if (m.caidoDesde == null) m.caidoDesde = agora
  return agora - m.caidoDesde > QUEDA_PARA_MTM_MS ? 'mtm' : 'conta'
}

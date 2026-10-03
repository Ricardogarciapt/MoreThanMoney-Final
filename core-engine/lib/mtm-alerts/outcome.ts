/**
 * CLASSIFICADOR ÚNICO do desfecho de um sinal — módulo puro, partilhado pela lista de alertas,
 * pelo scorecard e pelo journaling, para os três contarem a mesma coisa da mesma maneira.
 *
 * A distinção que faltava era o GANHO PARCIAL: um sinal que tocou o TP1 e depois virou não é o
 * mesmo que um sinal que percorreu todos os alvos, mas ambos apareciam como "win". Sem essa
 * separação a taxa de acerto parece melhor do que é, e o R médio fica inexplicável.
 *
 * Regra: `exit_N` é ganho COMPLETO quando N é o último alvo do sinal; abaixo disso é PARCIAL.
 * Sem saber quantos alvos o sinal tinha, assume-se 3 (o formato mais comum nos nossos sinais).
 */

export type OutcomeCat = 'pending' | 'active' | 'win' | 'partial_win' | 'loss' | 'discarded'

const DEFAULT_TP_COUNT = 3

export function classifyOutcome(tradeStatus: string | null | undefined, tpCount?: number | null): OutcomeCat {
  const s = (tradeStatus ?? '').trim()
  if (!s || s === 'pending') return 'pending'
  // SL antes de ativar, ideia descartada ou expirada sem ativar — a trade nunca existiu.
  if (s === 'discarded' || s === 'expired') return 'discarded'
  if (s === 'loss') return 'loss'
  if (s === 'closed') return 'win'
  const m = s.match(/^exit_(\d+)$/)
  if (m) {
    const nivel = Number(m[1])
    const alvos = tpCount && tpCount > 0 ? tpCount : DEFAULT_TP_COUNT
    return nivel >= alvos ? 'win' : 'partial_win'
  }
  // active, be — a trade está viva.
  return 'active'
}

export interface OutcomeTally {
  pending: number
  active: number
  win: number
  partial_win: number
  loss: number
  discarded: number
}

export function emptyTally(): OutcomeTally {
  return { pending: 0, active: 0, win: 0, partial_win: 0, loss: 0, discarded: 0 }
}

/**
 * Taxa de acerto sobre o que FECHOU. O parcial conta como acerto — deu lucro — mas é contado à
 * parte para se ver a diferença entre "acertou" e "correu até ao fim".
 * Descartados e expirados NÃO entram: não houve trade.
 */
export function winRate(t: OutcomeTally): number | null {
  const fechadas = t.win + t.partial_win + t.loss
  if (!fechadas) return null
  return Math.round((100 * (t.win + t.partial_win)) / fechadas)
}

/** Percentagem dos acertos que correu até ao último alvo. */
export function fullWinShare(t: OutcomeTally): number | null {
  const ganhos = t.win + t.partial_win
  if (!ganhos) return null
  return Math.round((100 * t.win) / ganhos)
}

export const OUTCOME_LABEL: Record<OutcomeCat, string> = {
  pending: 'Pendentes',
  active: 'Ativas',
  win: 'Ganhos',
  partial_win: 'Ganhos parciais',
  loss: 'Perdas',
  discarded: 'Descartados',
}

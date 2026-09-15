/**
 * FEEDS DE PREÇO — comparar uma fonte secundária (TradeLocker) com a principal (MetaApi · PU Prime).
 *
 * Puro: o comparador do VPS (services/funded-motor/feed-tradelocker.ts) junta amostras e publica o
 * resumo no pulso. Serve para decidir, com números, se uma fonte que não é a MetaApi pode segurar
 * o motor (diferença de preço, spread, frescura e tempo de resposta).
 */
import { percentil } from './provider'

export interface Cotacao { bid: number; ask: number; em: number }

export interface AmostraFeed {
  /** (meio secundário − meio principal) em pips. */
  difMeioPips: number
  spreadPrincipalPips: number
  spreadSecundarioPips: number
  /** Idade do preço principal no instante da amostra (ms). */
  idadePrincipalMs: number
  /** Tempo de resposta do pedido à fonte secundária (ms). */
  rttMs: number
}

export function amostraFeed(principal: Cotacao | null, secundario: Cotacao | null, pip: number, rttMs: number, agora = Date.now()): AmostraFeed | null {
  if (!principal || !secundario || !(pip > 0)) return null
  if (!(principal.bid > 0 && principal.ask > 0 && secundario.bid > 0 && secundario.ask > 0)) return null
  const meio = (c: Cotacao) => (c.bid + c.ask) / 2
  const r1 = (x: number) => Math.round(x * 10) / 10
  return {
    difMeioPips: r1((meio(secundario) - meio(principal)) / pip),
    spreadPrincipalPips: r1((principal.ask - principal.bid) / pip),
    spreadSecundarioPips: r1((secundario.ask - secundario.bid) / pip),
    idadePrincipalMs: Math.max(0, agora - principal.em),
    rttMs: Math.max(0, Math.round(rttMs)),
  }
}

export interface ResumoFeed {
  n: number
  difMeioAbsP50: number | null
  difMeioAbsP95: number | null
  spreadPrincipalP50: number | null
  spreadSecundarioP50: number | null
  idadePrincipalP95: number | null
  rttP50: number | null
  rttP95: number | null
  falhas: number
}

export function resumirFeed(a: AmostraFeed[], falhas = 0): ResumoFeed {
  return {
    n: a.length,
    difMeioAbsP50: percentil(a.map((x) => Math.abs(x.difMeioPips)), 50),
    difMeioAbsP95: percentil(a.map((x) => Math.abs(x.difMeioPips)), 95),
    spreadPrincipalP50: percentil(a.map((x) => x.spreadPrincipalPips), 50),
    spreadSecundarioP50: percentil(a.map((x) => x.spreadSecundarioPips), 50),
    idadePrincipalP95: percentil(a.map((x) => x.idadePrincipalMs), 95),
    rttP50: percentil(a.map((x) => x.rttMs), 50),
    rttP95: percentil(a.map((x) => x.rttMs), 95),
    falhas,
  }
}

/** O recurso entra quando o principal está velho e o secundário é fresco. */
export function usarRecurso(idadePrincipalMs: number | null, secundarioFresco: boolean, limiteMs = 5000): boolean {
  return secundarioFresco && (idadePrincipalMs == null || idadePrincipalMs > limiteMs)
}

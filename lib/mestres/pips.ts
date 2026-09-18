/**
 * SL/TP EM PIPS A PARTIR DA ENTRADA REAL DA CONTA — nunca os preços da mestre.
 *
 * A mestre (conta simulada, feed PU Prime) e a conta do cliente (outra corretora, outro spread) nunca
 * enchem ao mesmo preço. Copiar o NÍVEL do stop dava a um cliente que entrou 30 pips pior um stop a
 * metade da distância. O motor mede o sinal em PIPS na mestre (entrada da mestre → SL/TP da mestre) e
 * aplica os mesmos pips à entrada REAL do cliente (o preço a que a corretora dele encheu). Um BE da
 * mestre (SL = entrada + 2 pips) chega ao cliente como SL = entrada DELE + 2 pips; um trailing a 15
 * pips do preço chega como 15 pips do preço dele — sempre relativo à entrada, sempre em pips.
 *
 * Pips pela convenção única da casa (lib/mtmcopy/trade-outcome.ts): ouro 0,1 · JPY 0,01 · forex
 * 0,0001 · índices e cripto em PONTOS (1). Puro e testado (__tests__/mestres.check.ts).
 */
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'
import { canonicoDe } from '../webtrader/corretoras/regras'
import type { Direcao } from '../copia-contas/tipos'

export function pipDe(symbol: string): number {
  return pipSizeForSymbol(canonicoDe(String(symbol ?? '').toUpperCase()))
}

/**
 * Casas decimais SEGURAS para um nível quando não se conhecem os dígitos da corretora: as do pip + 1
 * (ouro 2, JPY 3, forex 5, índices/cripto 1). Mais grosso do que a corretora nunca é recusado; mais
 * fino dá «Invalid stops».
 */
export function digitosSeguros(symbol: string): number {
  const pip = pipDe(symbol)
  const casas = pip >= 1 ? 0 : Math.round(-Math.log10(pip))
  return Math.min(8, casas + 1)
}

/** Pips com sinal a favor da posição: SL abaixo da entrada numa compra = pips NEGATIVOS (risco). */
export function pipsAFavor(direcao: Direcao, entrada: number, nivel: number, symbol: string): number {
  const d = direcao === 'buy' ? nivel - entrada : entrada - nivel
  return Number((d / pipDe(symbol)).toFixed(4))
}

export interface NiveisEmPips {
  /** pips do SL relativamente à entrada (negativo = abaixo do preço de entrada numa compra = risco; positivo = lucro trancado) */
  slPips: number | null
  /** pips do TP relativamente à entrada (positivo) */
  tpPips: number | null
}

/** O sinal da mestre em pips: SL e TP relativos à entrada DA MESTRE. */
export function niveisEmPips(p: { direcao: Direcao; entrada: number | null; sl: number | null; tp: number | null; symbol: string }): NiveisEmPips {
  if (!(p.entrada != null && p.entrada > 0)) return { slPips: null, tpPips: null }
  return {
    slPips: p.sl != null && p.sl > 0 ? pipsAFavor(p.direcao, p.entrada, p.sl, p.symbol) : null,
    tpPips: p.tp != null && p.tp > 0 ? pipsAFavor(p.direcao, p.entrada, p.tp, p.symbol) : null,
  }
}

/** Os mesmos pips aplicados à ENTRADA REAL da conta (arredondado aos dígitos da corretora). */
export function niveisNaConta(p: { direcao: Direcao; entradaReal: number; pips: NiveisEmPips; symbol: string; digits?: number | null }): { sl: number | null; tp: number | null } {
  if (!(p.entradaReal > 0)) return { sl: null, tp: null }
  const pip = pipDe(p.symbol)
  const s = p.direcao === 'buy' ? 1 : -1
  const r = (x: number) => (p.digits != null ? Number(x.toFixed(p.digits)) : Number(x.toFixed(8)))
  const nivel = (pips: number | null) => (pips == null ? null : r(p.entradaReal + s * pips * pip))
  const sl = nivel(p.pips.slPips)
  const tp = nivel(p.pips.tpPips)
  // um TP do lado errado (pips ≤ 0) não é um alvo: não se envia
  return { sl: sl != null && sl > 0 ? sl : null, tp: tp != null && tp > 0 && (p.pips.tpPips ?? 0) > 0 ? tp : null }
}

/**
 * Depois de abrir: os stops enviados (calculados sobre a COTAÇÃO antes da ordem) batem com os pips
 * sobre o preço REAL de enchimento? Devolve os níveis corrigidos quando a diferença passa de
 * `toleranciaPips` (por omissão meio pip), ou null quando não há nada a corrigir.
 */
export function reancorar(p: {
  direcao: Direcao
  symbol: string
  digits?: number | null
  entradaMestre: number | null
  slMestre: number | null
  tpMestre: number | null
  entradaReal: number | null
  slEnviado: number | null
  tpEnviado: number | null
  copiarSl: boolean
  copiarTp: boolean
  toleranciaPips?: number
}): { sl: number | null; tp: number | null; slPips: number | null; tpPips: number | null } | null {
  if (!(p.entradaReal != null && p.entradaReal > 0)) return null
  const pips = niveisEmPips({ direcao: p.direcao, entrada: p.entradaMestre, sl: p.copiarSl ? p.slMestre : null, tp: p.copiarTp ? p.tpMestre : null, symbol: p.symbol })
  if (pips.slPips == null && pips.tpPips == null) return null
  const alvo = niveisNaConta({ direcao: p.direcao, entradaReal: p.entradaReal, pips, symbol: p.symbol, digits: p.digits })
  const tol = (p.toleranciaPips ?? 0.5) * pipDe(p.symbol)
  const difere = (a: number | null, b: number | null) => (a == null ? false : b == null ? true : Math.abs(a - b) > tol)
  if (!difere(alvo.sl, p.slEnviado) && !difere(alvo.tp, p.tpEnviado)) return null
  return { sl: alvo.sl ?? p.slEnviado, tp: alvo.tp ?? p.tpEnviado, slPips: pips.slPips, tpPips: pips.tpPips }
}

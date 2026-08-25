import type { T2TSourceKey } from './t2t-source'
import { pipSizeForSymbol } from './trade-outcome'

/**
 * Regras de risco POR FONTE — o que o sinal escreve nem sempre é negociável como está.
 *
 * O MTM Scanner é o caso que obrigou a isto. Dos 73 sinais analisados a 2026-08-25, TODOS traziam
 * o stop a menos de 20 pips: mínimo 1,6, mediana 4,6, máximo 10,4. Num par de forex com 1 a 2 pips
 * de spread, um stop a 2 pips está dentro do próprio spread — a trade nasce praticamente no stop
 * e qualquer respiração normal do preço fecha-a. A conta-espelho, que abre todos os sinais T2T,
 * fechou o dia a −3,51 com as quatro trades a saírem no stop.
 *
 * Não se mexe no sinal do trader: alarga-se o stop ao mínimo negociável e deixa-se o alvo como
 * está. Uma trade com stop de 20 pips e alvo de 9 tem um rácio pior no papel — mas existe, em vez
 * de morrer no spread.
 */

/** Distância MÍNIMA ao stop, em pips, por fonte. 200 pontos = 20 pips (broker de 5 dígitos). */
const SL_MINIMO_PIPS: Partial<Record<T2TSourceKey, number>> = {
  mtmscanner: 20,
  forexideas: 20,
}

/** Lucro a partir do qual o trailing arranca, em pips, por fonte. */
const TRAILING_ARRANCA_PIPS: Partial<Record<T2TSourceKey, number>> = {
  mtmscanner: 10,
  forexideas: 10,
}

export function slMinimoPips(source?: string | null): number | null {
  if (!source) return null
  return SL_MINIMO_PIPS[source as T2TSourceKey] ?? null
}

export function trailingArrancaPips(source?: string | null): number | null {
  if (!source) return null
  return TRAILING_ARRANCA_PIPS[source as T2TSourceKey] ?? null
}

/**
 * Stop já alargado ao mínimo da fonte. Devolve o SL original quando já é largo o bastante,
 * ou quando a fonte não tem regra — nunca APERTA um stop que o trader escreveu.
 */
export function slComMinimo(
  source: string | null | undefined,
  symbol: string,
  direction: 'buy' | 'sell',
  entry: number | null | undefined,
  sl: number | null | undefined,
): number | null | undefined {
  const minimo = slMinimoPips(source)
  if (minimo == null || !entry || !(entry > 0) || !sl || !(sl > 0)) return sl
  const pip = pipSizeForSymbol(symbol)
  const distancia = Math.abs(entry - sl) / pip
  if (distancia >= minimo) return sl
  const novo = direction === 'buy' ? entry - minimo * pip : entry + minimo * pip
  return Number(novo.toFixed(6))
}

/**
 * STOP FIXO POR ESTRATÉGIA (pedido do dono, 26/10/2026):
 *   Sensei 200 pips (e só 15m) · GoldKiller 100 pips · MTM Scanner 100 pips · Trendshot 100 pips.
 *
 * O stop do alerta Pine é substituído por este, à mesma distância da entrada, em todo o lado: o
 * cartão do chat e do Telegram, a mestre e o T2T. Os alvos ficam os do Pine (o Trendshot calcula os
 * seus pelo stop — lib/sinais/trendshot).
 *
 * Só em instrumentos que se medem em PIPS (ouro 0,1 · JPY 0,01 · forex 0,0001). Em cripto e índices
 * o «pip» é 1 ponto: 200 pontos no Bitcoin são 0,25 % — fica o stop do Pine.
 *
 * Puro: sem base, sem rede.
 */
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'

export const SL_PIPS_POR_ESTRATEGIA: Record<string, number> = {
  sensei: 200,
  goldkiller: 100,
  'mtm-scanner': 100,
  trendshot: 100,
}

/** Timeframes aceites por estratégia (minutos, como o {{interval}} do TradingView). Ausente = todos. */
export const TIMEFRAMES_POR_ESTRATEGIA: Record<string, string[]> = {
  sensei: ['15'],
}

function chave(estrategia: string | null | undefined): string {
  const e = String(estrategia ?? '').toLowerCase().replace(/\s+/g, '')
  if (e.includes('trendshot')) return 'trendshot'
  if (e.includes('goldkiller')) return 'goldkiller'
  if (e.includes('sensei')) return 'sensei'
  if (e.includes('scanner')) return 'mtm-scanner'
  return e
}

/** O instrumento conta em pips (e não em pontos)? */
export function medeEmPips(simbolo: string): boolean {
  return pipSizeForSymbol(simbolo) < 1
}

/** Distância do stop fixo em preço, ou null quando a estratégia/instrumento não tem stop fixo. */
export function distanciaSlFixo(estrategia: string | null | undefined, simbolo: string | null | undefined): number | null {
  const pips = SL_PIPS_POR_ESTRATEGIA[chave(estrategia)]
  if (!pips || !simbolo || !medeEmPips(simbolo)) return null
  return pips * pipSizeForSymbol(simbolo)
}

function casas(simbolo: string): number {
  const p = pipSizeForSymbol(simbolo)
  return p === 0.1 ? 2 : p === 0.01 ? 3 : 5
}

/** O stop fixo para a entrada, arredondado ao instrumento; null = fica o do alerta. */
export function slFixo(
  estrategia: string | null | undefined,
  simbolo: string | null | undefined,
  direcao: string | null | undefined,
  entrada: number | null | undefined,
): number | null {
  const d = distanciaSlFixo(estrategia, simbolo)
  // O Sensei manda «SELL»/«BUY» em maiúsculas; os outros em minúsculas.
  const dir = String(direcao ?? '').toLowerCase()
  if (d == null || !simbolo || (dir !== 'buy' && dir !== 'sell') || entrada == null || !(entrada > 0)) return null
  const v = dir === 'buy' ? entrada - d : entrada + d
  return Number(v.toFixed(casas(simbolo)))
}

/** O timeframe do alerta é aceite pela estratégia? Sem timeframe no alerta, aceita-se. */
export function timeframeAceite(estrategia: string | null | undefined, timeframe: string | null | undefined): boolean {
  const lista = TIMEFRAMES_POR_ESTRATEGIA[chave(estrategia)]
  const tf = String(timeframe ?? '').trim()
  if (!lista || !tf) return true
  return lista.includes(tf)
}

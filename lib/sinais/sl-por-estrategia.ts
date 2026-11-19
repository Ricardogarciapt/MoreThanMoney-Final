/**
 * STOP FIXO POR ESTRATÉGIA (pedido do dono, 26/10/2026; MTM Scanner revisto a 19/11/2026):
 *   MTM Scanner 100 pips · Trendshot 100 pips. O Sensei só aceita 15m.
 *   Sensei (200) e GoldKiller (100) ficaram com o stop do Pine: no backtest de 30 dias pioravam
 *   (/mnt/project-files/sinais/backtest-sl-por-estrategia.md) — decisão do dono, 26/10.
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
  // 19/11/2026 (Ricardo): o stop de 100 pips das Ideias de Forex dava muitos ganhos pequenos e
  // poucas perdas enormes. Na mestre e8ad, em 30 dias, 9 stops de −100 pips custaram 7.317 $ e
  // todos os ganhos somaram 7.497 $. Quem seguia à letra (ex.: conta real da Maria) perdia muito.
  // Passa a 20 pips, com alvos fixos em R (ALVOS_R_POR_ESTRATEGIA).
  'mtm-scanner': 20,
  trendshot: 100,
}

/**
 * ALVOS FIXOS EM MÚLTIPLOS DO RISCO (19/11/2026). Substituem os alvos do Pine quando o stop também é
 * fixo. Os do MTM Scanner eram 2×/4×/6× um stop de 3–15 pips (TP3 entre 13 e 90 pips, mediana ~35),
 * e com o stop novo ficavam ao calhas, uns abaixo de 1R e outros a 4R. Agora: 1R (parcial + BE),
 * 2R (o alvo principal que vai na imagem: 20 de stop para 40 de alvo) e 3R.
 */
export const ALVOS_R_POR_ESTRATEGIA: Record<string, number[]> = {
  'mtm-scanner': [1, 2, 3],
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

/**
 * Os alvos fixos (1R, 2R, 3R…) para a entrada, arredondados ao instrumento; null = ficam os do alerta.
 * Só existem quando o stop também é fixo (mesma distância de risco).
 */
export function tpsFixos(
  estrategia: string | null | undefined,
  simbolo: string | null | undefined,
  direcao: string | null | undefined,
  entrada: number | null | undefined,
): number[] | null {
  const mult = ALVOS_R_POR_ESTRATEGIA[chave(estrategia)]
  const d = distanciaSlFixo(estrategia, simbolo)
  const dir = String(direcao ?? '').toLowerCase()
  if (!mult?.length || d == null || !simbolo || (dir !== 'buy' && dir !== 'sell') || entrada == null || !(entrada > 0)) return null
  const sentido = dir === 'buy' ? 1 : -1
  return mult.map((m) => Number((entrada + sentido * m * d).toFixed(casas(simbolo))))
}

/** O timeframe do alerta é aceite pela estratégia? Sem timeframe no alerta, aceita-se. */
export function timeframeAceite(estrategia: string | null | undefined, timeframe: string | null | undefined): boolean {
  const lista = TIMEFRAMES_POR_ESTRATEGIA[chave(estrategia)]
  const tf = String(timeframe ?? '').trim()
  if (!lista || !tf) return true
  return lista.includes(tf)
}

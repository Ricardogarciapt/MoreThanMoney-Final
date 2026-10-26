/**
 * MTM AUTO TRENDSHOT — os níveis do scanner «Trendshot by MTM», calculados do lado do servidor.
 *
 * O alerta do TradingView só diz «Trendshot: BUY signal» / «SELL signal» (cruzamento EMA20/EMA50,
 * sessão 08:00–21:00). Os níveis replicam o modo AUTO do Pine (pedido do dono, 23/10/2026):
 *
 *   stop:  ouro 2000 pontos (×0,01 = 20,00) · forex 100 pips · resto 10 000 pontos (×0,01 = 100)
 *   alvos: TP1 0,3×SL · TP2 0,5×SL (ouro 0,6×SL) · TP3 1,0×SL · TP4 1,5×SL
 *
 * O stop por estrutura do Pine (opcional, desligado por omissão) não se reproduz aqui: precisa das
 * velas. Se o alerta trouxer `sl`/`tp1..4` próprios, esses ganham — o Pine sabe mais do que nós.
 *
 * Puro: sem base, sem rede. Testes em __tests__/trendshot.check.ts.
 */
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'

export const ESTRATEGIA_TRENDSHOT = 'MTM Auto Trendshot'
export const CANAL_TRENDSHOT = 'sinais-trendshot'

export type ClasseTrendshot = 'ouro' | 'forex' | 'outro'

export function classeTrendshot(simbolo: string): ClasseTrendshot {
  const s = simbolo.toUpperCase()
  if (/XAU|GOLD/.test(s)) return 'ouro'
  const pip = pipSizeForSymbol(s)
  return pip === 0.0001 || (pip === 0.01 && /JPY/.test(s)) ? 'forex' : 'outro'
}

/** Distância do stop, em preço. */
export function distanciaStopTrendshot(simbolo: string): number {
  const c = classeTrendshot(simbolo)
  if (c === 'ouro') return 2000 * 0.01
  if (c === 'forex') return 100 * pipSizeForSymbol(simbolo)
  return 10000 * 0.01
}

/** Direcção do alerta («Trendshot: BUY signal», `action: sell`…). */
export function direcaoTrendshot(texto: string | null | undefined): 'buy' | 'sell' | null {
  const t = String(texto ?? '').toLowerCase()
  const buy = /\b(buy|long|compra)\b/.test(t)
  const sell = /\b(sell|short|venda)\b/.test(t)
  if (buy === sell) return null
  return buy ? 'buy' : 'sell'
}

function casas(simbolo: string): number {
  const c = classeTrendshot(simbolo)
  if (c === 'forex') return /JPY/i.test(simbolo) ? 3 : 5
  return 2
}

export interface NiveisTrendshot {
  sl: number
  tps: [number, number, number, number]
}

/** SL e TP1–TP4 do modo AUTO, arredondados às casas do instrumento. */
export function niveisTrendshot(simbolo: string, direcao: 'buy' | 'sell', entrada: number): NiveisTrendshot {
  const d = distanciaStopTrendshot(simbolo)
  const k = direcao === 'buy' ? 1 : -1
  const r = (n: number) => Number(n.toFixed(casas(simbolo)))
  const mult2 = classeTrendshot(simbolo) === 'ouro' ? 0.6 : 0.5
  return {
    sl: r(entrada - k * d),
    tps: [r(entrada + k * d * 0.3), r(entrada + k * d * mult2), r(entrada + k * d), r(entrada + k * d * 1.5)],
  }
}

/**
 * Este alerta é do Trendshot? `?strategy=Trendshot` decide; sem `strategy`, decide o texto do
 * próprio alerta («Trendshot: BUY signal», `alert_name` com Trendshot). Um `strategy` de outra
 * estratégia nunca é desviado para aqui.
 */
export function eAlertaTrendshot(
  strategy: string | null | undefined,
  payload: Record<string, unknown>,
  rawBody: string,
): boolean {
  const s = String(strategy ?? '').toLowerCase().trim()
  if (s) return s === 'trendshot'
  const campos = [payload.message, payload.alert_name, payload.name, payload.strategy, payload.comment, payload.text]
    .map((x) => String(x ?? '').trim())
  if (campos.some((c) => /^\s*(mtm\s*auto\s*)?trend\s*shot\b/i.test(c))) return true
  return /^\s*"?\s*trend\s*shot\s*:/i.test(rawBody)
}

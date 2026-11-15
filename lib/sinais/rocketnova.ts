/**
 * ROCKETNOVA by MTM — a parte pura do webhook (docs/pine/rocketnova.pine), 08/11/2026, pedido do dono.
 *
 * Princípios do TrendShot com código próprio: cruzamento EMA 20/50 confirmado por uma estrela de
 * lançamento e, opcionalmente, por uma Rocket Candle; Entry/SL/TP1–TP4 fixos na vela do sinal e
 * gestão da posição pelo próprio Pine (tp1..tp4, sl, be, exit). Os níveis vêm no alerta; quando
 * faltam, calculam-se aqui como no modo AUTO do Pine:
 *
 *   stop:  100 pips em tudo (ouro 10,00 · forex 100 pips · resto 100 pontos) — a regra de 26/10
 *   alvos: TP1 0,3×SL · TP2 0,5×SL (ouro 0,6×SL) · TP3 1,0×SL · TP4 1,5×SL
 *
 * Puro: sem base, sem rede. Testes em __tests__/rocketnova.check.ts.
 */
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'
import type { SignalEvent } from '@/lib/mtmcopy/signal-lifecycle'

export const ESTRATEGIA_ROCKETNOVA = 'rocketnova'
export const NOME_ROCKETNOVA = 'MTM Auto RocketNova'
export const CANAL_ROCKETNOVA = 'sinais-rocketnova'

type Json = Record<string, unknown>

export const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * `?strategy=rocketnova` no URL, ou `"strategy":"ROCKETNOVA"` / `"source":"rocketnova"` no JSON.
 * Sem `strategy`, também o texto «RocketNova: sinal de COMPRA…» dos alertas simples.
 */
export function eAlertaRocketnova(strategy: string | null | undefined, payload: Json, rawBody = ''): boolean {
  const s = norm(strategy)
  if (s) return s === 'rocketnova'
  if (norm(payload.strategy) === 'rocketnova' || norm(payload.source) === 'rocketnova') return true
  const campos = [payload.message, payload.alert_name, payload.name, payload.comment, payload.text].map((x) => String(x ?? '').trim())
  if (campos.some((c) => /^\s*(mtm\s*auto\s*)?rocket\s*nova\b/i.test(c))) return true
  return /^\s*"?\s*rocket\s*nova\s*:/i.test(rawBody)
}

/** Direcção do alerta («RocketNova: sinal de COMPRA», `action: sell`…). */
export function direcaoRocketnova(texto: string | null | undefined): 'buy' | 'sell' | null {
  const t = String(texto ?? '').toLowerCase()
  const buy = /\b(buy|long|compra)\b/.test(t)
  const sell = /\b(sell|short|venda)\b/.test(t)
  if (buy === sell) return null
  return buy ? 'buy' : 'sell'
}

export type ClasseRocketnova = 'ouro' | 'forex' | 'outro'

export function classeRocketnova(simbolo: string): ClasseRocketnova {
  const s = simbolo.toUpperCase()
  if (/XAU|GOLD/.test(s)) return 'ouro'
  const pip = pipSizeForSymbol(s)
  return pip === 0.0001 || (pip === 0.01 && /JPY/.test(s)) ? 'forex' : 'outro'
}

function casas(simbolo: string): number {
  const c = classeRocketnova(simbolo)
  if (c === 'forex') return /JPY/i.test(simbolo) ? 3 : 5
  return 2
}

/** Arredonda ao passo do instrumento (o Pine manda o float cru). */
export function arredondarRocketnova(v: number | null, simbolo: string): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null
  const f = 10 ** casas(simbolo)
  return Math.round(v * f) / f
}

export interface NiveisRocketnova {
  sl: number
  tps: [number, number, number, number]
}

/** SL e TP1–TP4 do modo AUTO quando o alerta não os traz. */
export function niveisRocketnova(simbolo: string, direcao: 'buy' | 'sell', entrada: number): NiveisRocketnova {
  const c = classeRocketnova(simbolo)
  const d = c === 'outro' ? 10000 * 0.01 : 100 * pipSizeForSymbol(simbolo)
  const k = direcao === 'buy' ? 1 : -1
  const r = (n: number) => Number(n.toFixed(casas(simbolo)))
  const mult2 = c === 'ouro' ? 0.6 : 0.5
  return {
    sl: r(entrada - k * d),
    tps: [r(entrada + k * d * 0.3), r(entrada + k * d * mult2), r(entrada + k * d), r(entrada + k * d * 1.5)],
  }
}

/** Chave da trade: o `id` do Pine é a hora da vela de sinal; o par evita colisões entre gráficos. */
export function chaveTradeRocketnova(par: string, payload: Json): string | null {
  const id = String(payload.id ?? '').trim()
  if (!id || !par) return null
  return `${par}:${id}`
}

export interface EventoRocketnova { evento: SignalEvent; nivel?: number }

/**
 * `event` do Pine → evento do ciclo de vida (puro).
 *   tp1..tp3 parcial · tp4 alvo final (tp3 é final quando o Pine não mostra o TP4: `hits` diz-nos)
 *   sl → stop (depois de um alvo, stop protegido) · be → stop na entrada · exit → fechada por sinal contrário
 */
export function eventoRocketnova(ev: string, hits: number, comTp4 = true): EventoRocketnova | null {
  switch (norm(ev)) {
    case 'tp1': return { evento: 'partial', nivel: 1 }
    case 'tp2': return { evento: 'partial', nivel: 2 }
    case 'tp3': return { evento: comTp4 ? 'partial' : 'target_final', nivel: 3 }
    case 'tp4': return { evento: 'target_final', nivel: 4 }
    case 'be': return { evento: 'stop_protegido' }
    case 'sl': return { evento: hits > 0 ? 'stop_protegido' : 'stop_loss' }
    case 'exit': return { evento: 'closed' }
    case 'cancel': return { evento: 'discarded' }
    default: return null
  }
}

/** Linhas extra do cartão: estrela de lançamento, Rocket Candle, pulso de volatilidade e volume. */
export function extrasRocketnova(payload: Json): string[] {
  const out: string[] = []
  const star = Number(payload.star_bars)
  if (Number.isFinite(star) && star >= 0) out.push(`✦ Estrela de lançamento há ${star} vela${star === 1 ? '' : 's'}`)
  if (payload.rocket === true || String(payload.rocket) === 'true') out.push('🚀 Rocket Candle no sinal')
  const vol = norm(payload.volatility)
  if (vol === 'high' || vol === 'low' || vol === 'normal') {
    out.push(`📈 Volatilidade ${vol === 'high' ? 'alta' : vol === 'low' ? 'baixa' : 'normal'}`)
  }
  if (norm(payload.volume) === 'low') out.push('⚠️ Volume baixo na vela do sinal')
  return out
}

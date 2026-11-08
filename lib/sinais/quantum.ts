/**
 * QUANTUM by MTM — a parte pura do webhook (docs/pine/mtm-quantum.pine), 08/11/2026, pedido do dono.
 *
 * Seguidor de tendência com entradas em recuo: a linha primária (269) e a fase dão a direcção, o
 * painel de força a pontuação (0–100, M1…W1), e a entrada nasce no recuo à fita (triângulo) ou na
 * saída do oscilador da zona (ponto). O Pine só manda a ENTRADA (`event: entry`) com os níveis da
 * regra MTM: stop no extremo das últimas N velas e alvo a 2R. Quem segue a trade é o tracker de
 * preço da casa (o canal entra no Tap to Trade por `t2t_extra_channels`, migração 240), por isso os
 * seguimentos do Pine são aceites mas não esperados.
 *
 * Quando um alerta simples não traz os níveis, calculam-se como no RocketNova (100 pips) e o alvo a 2R.
 *
 * Puro: sem base, sem rede. Testes em __tests__/quantum.check.ts.
 */
import type { SignalEvent } from '@/lib/mtmcopy/signal-lifecycle'
import { arredondarRocketnova, classeRocketnova, niveisRocketnova, norm } from '@/lib/sinais/rocketnova'

export const ESTRATEGIA_QUANTUM = 'quantum'
export const NOME_QUANTUM = 'MTM Auto Quantum'
export const CANAL_QUANTUM = 'sinais-quantum'

type Json = Record<string, unknown>

/**
 * `?strategy=quantum` no URL, ou `"strategy":"QUANTUM"` / `"source":"quantum"` no JSON.
 * Sem `strategy`, também o texto «Quantum: sinal de COMPRA…» dos alertas simples.
 */
export function eAlertaQuantum(strategy: string | null | undefined, payload: Json, rawBody = ''): boolean {
  const s = norm(strategy)
  if (s) return s === 'quantum'
  if (norm(payload.strategy) === 'quantum' || norm(payload.source) === 'quantum') return true
  const campos = [payload.message, payload.alert_name, payload.name, payload.comment, payload.text].map((x) => String(x ?? '').trim())
  if (campos.some((c) => /^\s*(mtm\s*auto\s*)?quantum\b/i.test(c))) return true
  return /^\s*"?\s*quantum\s*:/i.test(rawBody)
}

/** Direcção do alerta («Quantum: sinal de COMPRA», `action: sell`…). */
export function direcaoQuantum(texto: string | null | undefined): 'buy' | 'sell' | null {
  const t = String(texto ?? '').toLowerCase()
  const buy = /\b(buy|long|compra)\b/.test(t)
  const sell = /\b(sell|short|venda)\b/.test(t)
  if (buy === sell) return null
  return buy ? 'buy' : 'sell'
}

/** Arredonda ao passo do instrumento (o Pine manda o float cru). Mesma régua do RocketNova. */
export const arredondarQuantum = arredondarRocketnova
export const classeQuantum = classeRocketnova

/** Razão risco/retorno do alvo quando o alerta não o traz (o `rrAlvo` do Pine, por omissão 2). */
export const RR_ALVO_QUANTUM = 2

export interface NiveisQuantum {
  sl: number
  tp: number
}

/**
 * Stop e alvo quando o alerta não os traz: stop da regra de 100 pips e alvo a `RR_ALVO_QUANTUM`×R.
 * Se só faltar o alvo, o stop do Pine manda e o alvo sai a 2R dele.
 */
export function niveisQuantum(simbolo: string, direcao: 'buy' | 'sell', entrada: number, slPine?: number | null): NiveisQuantum {
  const sl = slPine != null && Number.isFinite(slPine) && slPine > 0 ? slPine : niveisRocketnova(simbolo, direcao, entrada).sl
  const r = Math.abs(entrada - sl)
  const k = direcao === 'buy' ? 1 : -1
  const tp = arredondarQuantum(entrada + k * r * RR_ALVO_QUANTUM, simbolo) ?? entrada + k * r * RR_ALVO_QUANTUM
  return { sl: arredondarQuantum(sl, simbolo) ?? sl, tp }
}

/** Chave da trade: o `id` do Pine é a hora da vela de sinal; o par evita colisões entre gráficos. */
export function chaveTradeQuantum(par: string, payload: Json): string | null {
  const id = String(payload.id ?? '').trim()
  if (!id || !par) return null
  return `${par}:${id}`
}

export interface EventoQuantum { evento: SignalEvent; nivel?: number }

/**
 * `event` do Pine → evento do ciclo de vida (puro). O Pine de hoje só manda `entry`; estes ficam
 * prontos para uma versão que siga a trade: tp1 é o alvo final (um só alvo), sl/be/exit/cancel.
 */
export function eventoQuantum(ev: string, hits: number): EventoQuantum | null {
  switch (norm(ev)) {
    case 'tp1': return { evento: 'target_final', nivel: 1 }
    case 'be': return { evento: 'stop_protegido' }
    case 'sl': return { evento: hits > 0 ? 'stop_protegido' : 'stop_loss' }
    case 'exit': return { evento: 'closed' }
    case 'cancel': return { evento: 'discarded' }
    default: return null
  }
}

/** Linhas extra do cartão: pontuação do painel de força e o tipo de sinal (recuo, onda ou os dois). */
export function extrasQuantum(payload: Json): string[] {
  const out: string[] = []
  const score = Number(payload.score)
  if (Number.isFinite(score) && score >= 0 && score <= 100) out.push(`💪 Força ${Math.round(score)}/100`)
  const sinal = norm(payload.signal)
  if (sinal === 'pullbackwave') out.push('🔺 Recuo à fita + onda do oscilador')
  else if (sinal === 'pullback') out.push('🔺 Recuo à fita')
  else if (sinal === 'wave') out.push('🌊 Onda do oscilador')
  return out
}

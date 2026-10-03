/**
 * ⚠️ MOTOR LEGADO (gestão por ALERTA). Consolidação MTM Auto: quando a rota tem `price_monitor` ON,
 * as saídas são geridas por PREÇO no premium-price-monitor (realtime, sobre a posição REAL) e ESTE
 * é SALTADO (ver processor: `usesPriceMonitor`). Mantido só para rotas SEM price_monitor (ex.:
 * GoldKiller). Não expandir — a direção é tudo por preço. Ver o mapa de execução.
 *
 * MTM Auto Sensei — gestão automática da posição na conta Sensei (a5a1dddd).
 *
 * A entrada Sensei abre SEM TP único (ver processor: fork por conta), para os
 * parciais serem geridos pelos alertas TP1-4. Regras (do spec Sensei):
 *   TP1 → fecha 25% + BE (SL=entrada) + inicia trailing
 *   TP2 → fecha 25% (do original) + mantém BE + trailing
 *   TP3 → fecha 25% + mantém BE + trailing
 *   TP4 / HIT ALL → fecha a posição
 *   Breakeven (SL@BE atingido) → fecha a posição
 *   SL → fecha a posição
 *
 * CopyFactory replica estas ações para os subscritores.
 */

import {
  closePositionById,
  getSymbolSpecification,
  listOpenPositions,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import { inferPipSize, type TrailingDistance } from './pip-points'
import type { SenseiAlertType } from './signal-parser'

export type SenseiAction =
  | { kind: 'close_fraction'; fraction: number; setBE: boolean; trailing: boolean; label: string }
  | { kind: 'close_all'; label: string }

export interface SenseiExecOutcome {
  updated: number
  closed: number
  errors: string[]
  actions: string[]
}

/**
 * Modo runner: no TP final, em vez de fechar tudo, fecha metade do restante e
 * deixa o resto correr com trailing (server-side). Backtest (14.933 sinais, 90d):
 * exit_3/exit_4 batem MAIS que exit_1 — quando o sistema acerta, o preço viaja
 * longe, por isso fechar no último TP labelado deixa a cauda em cima da mesa.
 * Flag env `MTMCOPY_RUNNER_MODE` (off por defeito, reversível). Ver task F1 #55.
 */
export function runnerModeEnabled(): boolean {
  return String(process.env.MTMCOPY_RUNNER_MODE ?? '').toLowerCase().trim() === 'on'
}

/**
 * Decide a ação (PURA — testável). `fraction` é a fração do volume ATUAL a fechar,
 * calibrada para dar 25% do ORIGINAL em cada TP (75%→0.25, 50%→0.3333, ...).
 * `runner` (default false): no TP final deixa uma porção a correr com trailing.
 */
export function decideSenseiAction(
  alertType: SenseiAlertType,
  tpLevel: number | null,
  runner = false,
): SenseiAction | null {
  if (alertType === 'tp_hit') {
    const lvl = tpLevel ?? 1
    if (lvl >= 4) {
      // Runner: fecha 50% do que resta (≈12,5% do original) e mantém BE+trailing
      // para a porção final "deixar correr" para lá do TP4. Sem runner: fecha tudo.
      // setBE:false — no TP4 o stop já trailou fundo no lucro; repor a entrada
      // devolveria o ganho. Mantém o SL já avançado e continua o trailing.
      if (runner) {
        return { kind: 'close_fraction', fraction: 0.5, setBE: false, trailing: true, label: 'TP4/HIT ALL → runner: fecha 50% + deixa correr (trailing)' }
      }
      return { kind: 'close_all', label: 'TP4/HIT ALL → fecha tudo' }
    }
    // 25% do original: TP1=25% de 100%, TP2=25%/75%, TP3=25%/50%
    const fraction = lvl === 1 ? 0.25 : lvl === 2 ? 1 / 3 : 0.5
    return { kind: 'close_fraction', fraction, setBE: true, trailing: true, label: `TP${lvl} → fecha 25% + BE + trailing` }
  }
  if (alertType === 'breakeven') return { kind: 'close_all', label: 'Breakeven → fecha' }
  if (alertType === 'sl_hit') return { kind: 'close_all', label: 'SL → fecha' }
  if (alertType === 'exit') return { kind: 'close_all', label: 'Exit → fecha' }
  return null
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

function isMtmSenseiPosition(pos: MetaApiPosition): boolean {
  const c = (pos.comment ?? '').toLowerCase()
  return c.includes('sensei') || c.includes('mtm auto') || c.includes('mtmcopier') || c.includes('mtm-ti')
}

function symbolMatches(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return x === y || x.includes(y) || y.includes(x)
}

function directionMatches(pos: MetaApiPosition, direction: 'buy' | 'sell' | null): boolean {
  if (!direction) return true
  const isBuy = /buy|long/i.test(pos.type)
  return isBuy === (direction === 'buy')
}

function riskAnchoredTrailing(
  openPrice: number,
  sl: number | null,
  spec: { point?: number; pipSize?: number; digits?: number } | null,
  symbol: string,
): TrailingDistance {
  const pipSize = inferPipSize({ point: spec?.point ?? 0.01, pipSize: spec?.pipSize, digits: spec?.digits }, symbol)
  if (sl != null && Number.isFinite(sl) && pipSize > 0) {
    const riskPips = Math.max(10, Math.round(Math.abs(openPrice - sl) / pipSize))
    return { mode: 'threshold_pips', activationPips: 1, trailPips: riskPips }
  }
  return { mode: 'threshold_pips', activationPips: 1, trailPips: 25 }
}

/**
 * Aplica a gestão Sensei a UMA conta (mestre Sensei; subscritores via CopyFactory).
 */
export async function applySenseiManagement(opts: {
  accountId: string
  symbol: string
  direction: 'buy' | 'sell' | null
  alertType: SenseiAlertType
  tpLevel: number | null
  entry: number | null
}): Promise<SenseiExecOutcome> {
  const out: SenseiExecOutcome = { updated: 0, closed: 0, errors: [], actions: [] }

  const action = decideSenseiAction(opts.alertType, opts.tpLevel, runnerModeEnabled())
  if (!action) {
    out.actions.push(`${opts.alertType}: sem ação`)
    return out
  }

  const positions = await listOpenPositions(opts.accountId)
  const matches = positions.filter(
    (p) => isMtmSenseiPosition(p) && symbolMatches(p.symbol, opts.symbol) && directionMatches(p, opts.direction),
  )
  // Escolhe a posição pela ENTRADA (openPrice mais próximo do entry do sinal),
  // para o BE/SL/TP cair na trade certa quando há várias no mesmo símbolo.
  let pos: MetaApiPosition | null = null
  if (opts.entry != null && Number.isFinite(opts.entry) && matches.length) {
    const tol = Math.max(Math.abs(opts.entry) * 0.003, 0.01)
    let bestDiff = Infinity
    for (const p of matches) {
      const diff = Math.abs((p.openPrice ?? 0) - opts.entry)
      if (diff < bestDiff) { bestDiff = diff; pos = p }
    }
    if (bestDiff > tol) pos = matches[matches.length - 1]! // fallback: mais recente
  } else {
    pos = matches.length ? matches[matches.length - 1]! : null
  }
  if (!pos) {
    // Sem posição correspondente = a trade já foi fechada (SL/TP/parcial anterior ou pelo
    // price-monitor) ou nunca chegou a abrir. Uma atualização de gestão sem posição é um
    // no-op benigno, NÃO um erro — evita dezenas de falsos 'error' no log por mensagens de
    // gestão tardias/redundantes. (Falhas reais de ENTRADA aparecem no log de entrada.)
    out.actions.push(`Sem posição ativa em ${opts.symbol} — gestão ignorada (trade já fechada)`)
    return out
  }

  if (action.kind === 'close_all') {
    const r = await closePositionById(opts.accountId, pos.id)
    if (r.success) { out.closed++; out.actions.push(action.label) }
    else if (r.error) out.errors.push(r.error)
    return out
  }

  // close_fraction (+ BE + trailing)
  const current = pos.volume ?? 0
  const vol = roundLot(current * action.fraction)
  if (current > 0) {
    if (vol >= current) {
      const r = await closePositionById(opts.accountId, pos.id)
      if (r.success) { out.closed++; out.actions.push(`${action.label} (fecha tudo: ${current})`) }
      else if (r.error) out.errors.push(r.error)
      return out
    }
    if (vol >= 0.01) {
      const r = await closePositionById(opts.accountId, pos.id, vol)
      if (r.success) { out.closed++; out.actions.push(`${action.label} (${vol})`) }
      else if (r.error) out.errors.push(r.error)
    }
  }

  if (action.setBE || action.trailing) {
    const spec = await getSymbolSpecification(opts.accountId, opts.symbol)
    const be = opts.entry ?? pos.openPrice
    const trailing = action.trailing ? riskAnchoredTrailing(pos.openPrice, be, spec, opts.symbol) : undefined
    const mod = await modifyPositionSlTp(opts.accountId, pos.id, action.setBE ? be : pos.stopLoss, pos.takeProfit, trailing, pos.symbol)
    if (mod.success) { out.updated++; out.actions.push(`BE@${be}${action.trailing ? ' + trailing' : ''}`) }
    else if (mod.error) out.errors.push(mod.error)
  }

  return out
}

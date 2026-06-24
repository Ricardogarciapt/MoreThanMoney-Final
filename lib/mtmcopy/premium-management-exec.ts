/**
 * MTM Auto Premium — EXECUTOR da gestão na conta MetaApi.
 *
 * Aplica as acções decididas por `decidePremiumActions` (premium-management-plan,
 * 100% puro/testado). Este módulo só faz I/O MetaApi — nenhuma regra de negócio
 * vive aqui. Substitui as heurísticas antigas (applyPremiumMaximizeZones /
 * HalfOrTrail / SingleExitHit) para o canal premium-signals.
 */

import {
  closePositionById,
  getSymbolSpecification,
  listOpenPositions,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import { findPremiumSinglePosition, parsePremiumSingleComment } from './premium-single'
import { inferPipSize, type TrailingDistance } from './pip-points'
import { isPremiumHoldRemainderAtBE } from './channel-context'
import { parseSignal } from './signal-parser'
import {
  decidePremiumActions,
  type PremiumMessageCtx,
  type PremiumPositionCtx,
  type PremiumSignalCtx,
} from './premium-management-plan'

export interface PremiumExecOutcome {
  updated: number
  closed: number
  cancelled: number
  errors: string[]
  actions: string[]
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

/**
 * Classifica a mensagem de gestão Premium (PURA — testável).
 * Devolve null se a mensagem não for gestão Premium reconhecida.
 */
export function classifyPremiumMessage(text: string): PremiumMessageCtx | null {
  if (!text?.trim()) return null
  const setBE = isPremiumHoldRemainderAtBE(text)

  if (/\bhit\s+all\s+tp\b/i.test(text)) return { kind: 'hit_all', setBE }

  const hit = text.match(/\bhit\s+tp\s*([1-4])\b/i)
  if (hit) {
    const lvl = parseInt(hit[1], 10)
    if (lvl === 1) return { kind: 'hit_tp1', setBE }
    if (lvl === 2) return { kind: 'hit_tp2', setBE }
    return { kind: 'hit_tp3', setBE } // TP3 e TP4 → fecha
  }

  if (/\btrade\s+active\s+and\s+running\b/i.test(text)) {
    if (/\bclose\s+half\b/i.test(text)) return { kind: 'trade_active_close_half', setBE }
    return { kind: 'trade_active_close_all', setBE }
  }

  if (/\b(?:hit\s?sl|sl\s?hit|stop\s?loss\s+hit)\b/i.test(text)) return { kind: 'sl_hit', setBE }

  if (/\b(?:breakeven|break\s?even|set\s+be)\b/i.test(text)) return { kind: 'breakeven', setBE }

  return null
}

function positionDirection(pos: MetaApiPosition): 'buy' | 'sell' {
  return /buy|long/i.test(pos.type) ? 'buy' : 'sell'
}

/** Trailing ancorado ao risco original (por PREÇO → pips): ativa em ≥ risco, segue ≈ risco. */
function riskAnchoredTrailing(
  openPrice: number,
  sl: number | null,
  spec: { point?: number; pipSize?: number; digits?: number } | null,
  symbol: string,
): TrailingDistance {
  const pipSize = inferPipSize(
    { point: spec?.point ?? 0.01, pipSize: spec?.pipSize, digits: spec?.digits },
    symbol,
  )
  if (sl != null && Number.isFinite(sl) && pipSize > 0) {
    const riskPips = Math.max(10, Math.round(Math.abs(openPrice - sl) / pipSize))
    return { mode: 'threshold_pips', activationPips: riskPips, trailPips: riskPips }
  }
  // Fallback conservador (ouro ~50 pips) — nunca arma a 1 pip.
  return { mode: 'threshold_pips', activationPips: 50, trailPips: 50 }
}

/** Volume a fechar para uma % do lote ORIGINAL; se ≥ atual, fecha tudo. */
function closeVolumeForPct(originalLot: number, current: number, pct: number): number {
  if (current <= 0) return 0
  const v = roundLot(originalLot * (pct / 100))
  if (v >= current) return current // fecha o remanescente
  return v
}

/**
 * Aplica a gestão Premium a UMA conta (mestre/provider ou subscritor direto).
 * Reconstrói o contexto do sinal a partir da mensagem original (parentText).
 */
export async function applyPremiumManagement(
  accountId: string,
  rawText: string,
  parentText: string | null,
  symbolHint: string | null,
): Promise<PremiumExecOutcome> {
  const out: PremiumExecOutcome = { updated: 0, closed: 0, cancelled: 0, errors: [], actions: [] }

  const msg = classifyPremiumMessage(rawText)
  if (!msg) {
    out.errors.push('Mensagem de gestão Premium não classificada')
    return out
  }

  const parent = parentText ? parseSignal(parentText) : null
  const symbol = parent?.symbol ?? symbolHint ?? 'XAUUSD'

  const positions = await listOpenPositions(accountId)
  const pos = findPremiumSinglePosition(positions, symbol)
  if (!pos) {
    out.errors.push(`Sem posição Premium ativa em ${symbol}`)
    return out
  }

  const meta = parsePremiumSingleComment(pos.comment)
  const posCtx: PremiumPositionCtx = {
    openPrice: pos.openPrice,
    volume: pos.volume ?? 0,
    stopLoss: pos.stopLoss ?? null,
    direction: positionDirection(pos),
  }
  const signalCtx: PremiumSignalCtx = {
    zone: parent?.zone ?? null,
    sl: parent?.sl ?? pos.stopLoss ?? null,
    tp: parent?.tp ?? [],
  }

  const actions = decidePremiumActions(msg, posCtx, signalCtx)
  if (!actions.length) {
    out.actions.push(`${msg.kind}: sem acções`)
    return out
  }

  const spec = await getSymbolSpecification(accountId, symbol)
  const trailing = riskAnchoredTrailing(pos.openPrice, signalCtx.sl, spec, symbol)
  const originalLot = meta?.originalLot && meta.originalLot > 0 ? meta.originalLot : pos.volume ?? 0

  // SL corrente ao longo das acções — start_trailing preserva o SL já definido
  // (ex.: HIT TP2 põe SL no Exit1 e depois ativa trailing sem o anular).
  let currentSl: number | null = pos.stopLoss ?? null

  for (const a of actions) {
    try {
      if (a.type === 'set_be') {
        currentSl = pos.openPrice
        const mod = await modifyPositionSlTp(accountId, pos.id, currentSl, pos.takeProfit, undefined, pos.symbol)
        if (mod.success) { out.updated++; out.actions.push(`BE @ ${pos.openPrice}`) }
        else if (mod.error) out.errors.push(mod.error)
      } else if (a.type === 'set_sl_price' && a.slPrice != null) {
        currentSl = a.slPrice
        const mod = await modifyPositionSlTp(accountId, pos.id, currentSl, pos.takeProfit, undefined, pos.symbol)
        if (mod.success) { out.updated++; out.actions.push(`SL @ ${a.slPrice}`) }
        else if (mod.error) out.errors.push(mod.error)
      } else if (a.type === 'start_trailing') {
        const mod = await modifyPositionSlTp(accountId, pos.id, currentSl, pos.takeProfit, trailing, pos.symbol)
        if (mod.success) { out.updated++; out.actions.push(`trailing ${trailing.mode === 'threshold_pips' ? `${trailing.activationPips}/${trailing.trailPips}p` : ''}`) }
        else if (mod.error) out.errors.push(mod.error)
      } else if (a.type === 'close_pct' && a.pct != null) {
        // Reler volume atual (acções anteriores podem tê-lo reduzido).
        const fresh = (await listOpenPositions(accountId)).find((p) => p.id === pos.id)
        const current = fresh?.volume ?? pos.volume ?? 0
        const vol = closeVolumeForPct(originalLot, current, a.pct)
        if (vol >= current && current > 0) {
          const r = await closePositionById(accountId, pos.id)
          if (r.success) { out.closed++; out.actions.push(`fecha ${a.pct}% (tudo: ${current})`) }
          else if (r.error) out.errors.push(r.error)
        } else if (vol >= 0.01) {
          const r = await closePositionById(accountId, pos.id, vol)
          if (r.success) { out.closed++; out.actions.push(`fecha ${a.pct}% (${vol})`) }
          else if (r.error) out.errors.push(r.error)
        }
      } else if (a.type === 'close_all') {
        const r = await closePositionById(accountId, pos.id)
        if (r.success) { out.closed++; out.actions.push('fecha tudo') }
        else if (r.error) out.errors.push(r.error)
      }
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return out
}

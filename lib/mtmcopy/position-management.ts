import type { TrailingDistance } from './pip-points'
import { normalizeTrailingDistance } from './pip-points'
import { resolveBrokerSymbol } from './symbol-resolver'
import {
  cancelPendingOrdersForSymbol,
  closePositionById,
  closePositionsForSymbol,
  getSymbolSpecification,
  listOpenPositions,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import { matchesPremiumLegComment } from './premium-exits'
import {
  PREMIUM_TIGHT_SL_PIPS,
  PREMIUM_WIDE_SL_PIPS,
  premiumTrailingForTradeActive,
  riskPipsFromPosition,
  type PremiumTradeActiveVariant,
} from './premium-trade-active'
import type { ParsedManagement } from './signal-parser'
import type { MTMcopierConnection } from './types'

const MTM_COMMENTS = ['mtmcopier', 'mtmcopier-master']

function normalizeComment(comment?: string): string {
  return (comment ?? '').toLowerCase()
}

function isMtmcopierPosition(pos: MetaApiPosition): boolean {
  const c = normalizeComment(pos.comment)
  return MTM_COMMENTS.some((m) => c.includes(m))
}

function symbolMatches(posSymbol: string, signalSymbol: string): boolean {
  const a = posSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const b = signalSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return a === b || a.includes(b) || b.includes(a)
}

function filterPositions(positions: MetaApiPosition[], symbol: string | null): MetaApiPosition[] {
  const mtm = positions.filter(isMtmcopierPosition)
  if (!symbol) return mtm
  return mtm.filter((p) => symbolMatches(p.symbol, symbol))
}

export function trailingDistanceForConnection(
  conn: Pick<MTMcopierConnection, 'auto_trailing_stop' | 'trailing_stop_points'>,
): TrailingDistance | null {
  if (!conn.auto_trailing_stop) return null
  const pts = Number(conn.trailing_stop_points)
  if (!Number.isFinite(pts) || pts <= 0) return { mode: 'points', points: 200 }
  return { mode: 'points', points: Math.round(pts) }
}

/** @deprecated usar trailingDistanceForConnection */
export function trailingPointsForConnection(
  conn: Pick<MTMcopierConnection, 'auto_trailing_stop' | 'trailing_stop_points'>,
): number | null {
  const d = trailingDistanceForConnection(conn)
  return d?.mode === 'points' ? d.points : null
}

export function trailingDistanceForManagement(
  management: Pick<ParsedManagement, 'trailing' | 'trailingPips'>,
  connTrailing?: TrailingDistance | null,
): TrailingDistance | null {
  if (management.trailing) {
    return normalizeTrailingDistance(management.trailing)
  }
  if (management.trailingPips != null && management.trailingPips > 0) {
    return { mode: 'pips', pips: management.trailingPips }
  }
  return normalizeTrailingDistance(connTrailing ?? null)
}

function slFromPointsOffset(
  pos: MetaApiPosition,
  slPoints: number,
  point: number,
): number | null {
  if (!Number.isFinite(slPoints) || slPoints <= 0 || !Number.isFinite(point) || point <= 0) return null
  const offset = slPoints * point
  const isBuy = /buy|long/i.test(pos.type)
  return isBuy ? pos.openPrice + offset : pos.openPrice - offset
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

function positionInProfit(pos: MetaApiPosition): boolean {
  const px = pos.currentPrice
  if (px == null || !Number.isFinite(px)) return true
  const isBuy = /buy|long/i.test(pos.type)
  return isBuy ? px > pos.openPrice : px < pos.openPrice
}

async function applyPremiumMaximizeZones(
  accountId: string,
  positions: MetaApiPosition[],
  symbol: string,
): Promise<{ updated: number; closed: number; errors: string[] }> {
  const result = { updated: 0, closed: 0, errors: [] as string[] }
  const trailing = premiumTrailingForTradeActive()
  const spec = await getSymbolSpecification(accountId, symbol)
  if (!spec) {
    result.errors.push('Spec do símbolo indisponível')
    return result
  }

  const leg1 = positions.filter((p) => matchesPremiumLegComment(p.comment, 1))
  const leg2 = positions.filter((p) => matchesPremiumLegComment(p.comment, 2))
  const leg3 = positions.filter((p) => matchesPremiumLegComment(p.comment, 3))

  for (const pos of leg1) {
    if (!positionInProfit(pos)) continue
    const r = await closePositionById(accountId, pos.id)
    if (r.success) result.closed++
    else if (r.error) result.errors.push(r.error)
  }

  for (const pos of leg2) {
    const vol = pos.volume ?? 0
    const closeVol = vol > 0 ? roundLot(vol * 0.33) : 0
    if (closeVol >= 0.01 && closeVol < vol) {
      const r = await closePositionById(accountId, pos.id, closeVol)
      if (r.success) result.closed++
      else if (r.error) result.errors.push(r.error)
    }
  }

  const tp3Targets = leg3.length ? leg3 : positions.filter((p) => !leg1.includes(p) && !leg2.includes(p))
  for (const pos of tp3Targets) {
    const mod = await modifyPositionSlTp(
      accountId,
      pos.id,
      pos.openPrice,
      pos.takeProfit,
      trailing,
      pos.symbol,
    )
    if (mod.success) result.updated++
    else if (mod.error) result.errors.push(mod.error)
  }

  return result
}

async function applyPremiumHalfOrTrail(
  accountId: string,
  positions: MetaApiPosition[],
  symbol: string,
): Promise<{ updated: number; closed: number; errors: string[] }> {
  const result = { updated: 0, closed: 0, errors: [] as string[] }
  const spec = await getSymbolSpecification(accountId, symbol)
  if (!spec) {
    result.errors.push('Spec do símbolo indisponível')
    return result
  }

  const sample = positions[0]
  const riskPips = sample ? riskPipsFromPosition(sample, spec, symbol) : null

  if (riskPips != null && riskPips > PREMIUM_WIDE_SL_PIPS) {
    for (const pos of positions) {
      const vol = pos.volume ?? 0
      const half = vol > 0 ? roundLot(vol * 0.5) : 0
      if (half >= 0.01 && half < vol) {
        const r = await closePositionById(accountId, pos.id, half)
        if (r.success) result.closed++
        else if (r.error) result.errors.push(r.error)
      }
    }
    return result
  }

  if (riskPips != null && riskPips <= PREMIUM_TIGHT_SL_PIPS) {
    const trailing = premiumTrailingForTradeActive()
    const targets = positions.filter(
      (p) => matchesPremiumLegComment(p.comment, 2) || matchesPremiumLegComment(p.comment, 3),
    )
    const list = targets.length ? targets : positions
    for (const pos of list) {
      const mod = await modifyPositionSlTp(
        accountId,
        pos.id,
        pos.stopLoss,
        pos.takeProfit,
        trailing,
        pos.symbol,
      )
      if (mod.success) result.updated++
      else if (mod.error) result.errors.push(mod.error)
    }
    return result
  }

  for (const pos of positions) {
    const vol = pos.volume ?? 0
    const half = vol > 0 ? roundLot(vol * 0.5) : 0
    if (half >= 0.01 && half < vol) {
      const r = await closePositionById(accountId, pos.id, half)
      if (r.success) result.closed++
      else if (r.error) result.errors.push(r.error)
    }
  }

  return result
}

async function applyPremiumTradeActive(
  accountId: string,
  symbol: string,
  variant: PremiumTradeActiveVariant,
): Promise<{ updated: number; closed: number; cancelled: number; errors: string[] }> {
  const positions = filterPositions(await listOpenPositions(accountId), symbol)
  if (!positions.length) {
    return { updated: 0, closed: 0, cancelled: 0, errors: ['Sem posições MTMcopier abertas'] }
  }

  if (variant === 'maximize_zones') {
    const r = await applyPremiumMaximizeZones(accountId, positions, symbol)
    return { ...r, cancelled: 0 }
  }

  const r = await applyPremiumHalfOrTrail(accountId, positions, symbol)
  return { ...r, cancelled: 0 }
}

export async function applyManagementToAccount(
  accountId: string,
  management: ParsedManagement,
  trailing?: TrailingDistance | number | null,
): Promise<{ updated: number; closed: number; cancelled: number; errors: string[] }> {
  const result = { updated: 0, closed: 0, cancelled: 0, errors: [] as string[] }

  if (management.type === 'premium_trade_active' && management.symbol && management.premiumVariant) {
    return applyPremiumTradeActive(accountId, management.symbol, management.premiumVariant)
  }

  if (management.type === 'cancel_orders') {
    if (!management.symbol) {
      result.errors.push('Símbolo em falta para cancelar ordens')
      return result
    }
    const pending = await cancelPendingOrdersForSymbol(accountId, management.symbol)
    result.cancelled = pending.cancelled
    result.errors.push(...pending.errors)

    if (pending.cancelled === 0) {
      const positions = filterPositions(await listOpenPositions(accountId), management.symbol)
      for (const pos of positions) {
        const closed = await closePositionsForSymbol(accountId, pos.symbol)
        if (closed.success) result.closed++
        else if (closed.error) result.errors.push(closed.error)
      }
    }
    return result
  }

  if (management.type === 'close_all') {
    const positions = filterPositions(await listOpenPositions(accountId), management.symbol)
    for (const pos of positions) {
      const closed = await closePositionsForSymbol(accountId, pos.symbol)
      if (closed.success) result.closed++
      else if (closed.error) result.errors.push(closed.error)
    }
    return result
  }

  const positions = filterPositions(await listOpenPositions(accountId), management.symbol)
  if (!positions.length) return result

  for (const pos of positions) {
    if (management.type === 'close') {
      const closed = await closePositionsForSymbol(accountId, pos.symbol)
      if (closed.success) result.closed++
      else if (closed.error) result.errors.push(closed.error)
      continue
    }

    let newSl: number | null = null
    if (management.type === 'breakeven') {
      newSl = pos.openPrice
    } else if (management.type === 'move_sl' && management.slPoints != null) {
      const spec = await getSymbolSpecification(accountId, pos.symbol)
      const point = spec?.point ?? 0.01
      newSl = slFromPointsOffset(pos, management.slPoints, point)
    } else if (management.type === 'move_sl' && management.sl != null) {
      newSl = management.sl
    } else if (management.type === 'enable_trailing' && trailing) {
      const mod = await modifyPositionSlTp(accountId, pos.id, pos.stopLoss, pos.takeProfit, trailing, pos.symbol)
      if (mod.success) result.updated++
      else if (mod.error) result.errors.push(mod.error)
      continue
    } else {
      continue
    }

    const mod = await modifyPositionSlTp(accountId, pos.id, newSl, pos.takeProfit)
    if (mod.success) result.updated++
    else if (mod.error) result.errors.push(mod.error)
  }

  if (
    management.type === 'breakeven' &&
    management.trailingLeg != null &&
    management.trailingLeg > 0 &&
    trailing
  ) {
    const legPositions = positions.filter((p) =>
      matchesPremiumLegComment(p.comment, management.trailingLeg!),
    )
    const targets = legPositions.length ? legPositions : positions
    for (const pos of targets) {
      const mod = await modifyPositionSlTp(
        accountId,
        pos.id,
        pos.openPrice,
        pos.takeProfit,
        trailing,
        pos.symbol,
      )
      if (mod.success) result.updated++
      else if (mod.error) result.errors.push(mod.error)
    }
  }

  return result
}

export async function applyTrailingToLatestPosition(
  accountId: string,
  signalSymbol: string,
  trailing: TrailingDistance | number,
): Promise<{ success: boolean; error?: string }> {
  const positions = filterPositions(await listOpenPositions(accountId), signalSymbol)
  if (!positions.length) return { success: false, error: 'Sem posição aberta para trailing' }

  const latest = positions[positions.length - 1]
  const brokerSymbol = resolveBrokerSymbol(signalSymbol, [latest.symbol])
  if (!symbolMatches(latest.symbol, brokerSymbol)) {
    /* usar posição encontrada */
  }

  return modifyPositionSlTp(accountId, latest.id, latest.stopLoss, latest.takeProfit, trailing, latest.symbol)
}

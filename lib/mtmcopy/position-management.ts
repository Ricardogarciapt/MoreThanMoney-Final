import type { TrailingDistance } from './pip-points'
import { normalizeTrailingDistance } from './pip-points'
import { resolveBrokerSymbol } from './symbol-resolver'
import {
  cancelPendingOrdersForSymbol,
  closePositionsForSymbol,
  getSymbolSpecification,
  listOpenPositions,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
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

export async function applyManagementToAccount(
  accountId: string,
  management: ParsedManagement,
  trailing?: TrailingDistance | number | null,
): Promise<{ updated: number; closed: number; cancelled: number; errors: string[] }> {
  const result = { updated: 0, closed: 0, cancelled: 0, errors: [] as string[] }

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

/**
 * Gestão automática das 3 pernas Premium na conta provider (estratégia 9gsL).
 * The Trading Master: 1000 points = 1$ = 10 pips ouro (pip 0.10).
 */

import type { TrailingDistance } from './pip-points'
import { premiumTrailingAfterTp1Hit } from './premium-trade-active'
import { matchesPremiumLegComment } from './premium-exits'
import {
  getSymbolSpecification,
  listOpenPositions,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import { inferPipSize } from './pip-points'
import { riskPipsFromPosition } from './premium-trade-active'
import { findPremiumSinglePosition } from './premium-single'

/** 40 pips = 4000 points — BE todas as pernas. */
export const PROVIDER_BE_ALL_PIPS = 40
/** 50 pips = 5000 points — BE perna 2 + trailing até Exit 2. */
export const PROVIDER_LEG2_TRAIL_PIPS = 50

function profitPips(pos: MetaApiPosition, spec: { point: number; pipSize?: number; digits?: number }, symbol: string): number | null {
  const px = pos.currentPrice
  if (px == null || !Number.isFinite(px)) return null
  const pipSize = inferPipSize(spec, symbol)
  if (!pipSize || pipSize <= 0) return null
  const isBuy = /buy|long/i.test(pos.type)
  const diff = isBuy ? px - pos.openPrice : pos.openPrice - px
  return Math.round(diff / pipSize)
}

function isProviderLegPosition(pos: MetaApiPosition): boolean {
  const c = (pos.comment ?? '').toLowerCase()
  return c.includes('mtmcopier-tp') || c.includes('mtmcopier')
}

/** Ignorar «Trade active and running» — lifecycle automático activo. */
export function shouldIgnorePremiumTradeActiveForProvider(): boolean {
  return true
}

export async function runPremiumProviderLifecycle(
  accountId: string,
  symbol?: string | null,
): Promise<{ updated: number; errors: string[] }> {
  const result = { updated: 0, errors: [] as string[] }
  const all = await listOpenPositions(accountId)
  let positions = all.filter(isProviderLegPosition)
  if (symbol) {
    const sym = symbol.toUpperCase()
    positions = positions.filter((p) => p.symbol.toUpperCase().includes(sym) || sym.includes(p.symbol.toUpperCase()))
  }
  if (!positions.length) return result

  if (findPremiumSinglePosition(positions, symbol ?? positions[0]!.symbol)) {
    return result
  }

  const leg1 = positions.filter((p) => matchesPremiumLegComment(p.comment, 1))
  const leg2 = positions.filter((p) => matchesPremiumLegComment(p.comment, 2))
  const leg3 = positions.filter((p) => matchesPremiumLegComment(p.comment, 3))
  const runners = [...leg2, ...leg3]
  if (!runners.length) return result

  const sample = runners[0]!
  const spec = await getSymbolSpecification(accountId, sample.symbol)
  if (!spec) {
    result.errors.push('Spec indisponível')
    return result
  }

  const riskPips = riskPipsFromPosition(sample, spec, sample.symbol)
  const trailing: TrailingDistance = premiumTrailingAfterTp1Hit(riskPips)

  for (const pos of positions) {
    const pips = profitPips(pos, spec, pos.symbol)
    if (pips == null) continue

    if (pips >= PROVIDER_BE_ALL_PIPS) {
      const mod = await modifyPositionSlTp(accountId, pos.id, pos.openPrice, pos.takeProfit, null, pos.symbol)
      if (mod.success) result.updated++
      else if (mod.error) result.errors.push(mod.error)
    }
  }

  for (const pos of leg2) {
    const pips = profitPips(pos, spec, pos.symbol)
    if (pips == null || pips < PROVIDER_LEG2_TRAIL_PIPS) continue
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

/** SL das pernas 2/3 → preço Exit 1 (TP1) após HIT TP1. */
export function exit1SlPrice(leg1: MetaApiPosition | undefined, signalTp1?: number | null): number | null {
  const tp = leg1?.takeProfit
  if (tp != null && tp > 0) return tp
  if (signalTp1 != null && signalTp1 > 0) return signalTp1
  return leg1?.openPrice ?? null
}

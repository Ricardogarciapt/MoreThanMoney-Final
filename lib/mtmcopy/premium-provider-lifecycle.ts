/**
 * Gestão automática das 3 pernas Premium na conta provider (estratégia 9gsL).
 * Pernas com TP no broker — nunca fechar manualmente; trailing só após TP real.
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
import { CANONICAL_PREMIUM_ACCOUNT_ID } from './provider-constants'
import { getLatestProviderSignalTp } from './db'

/** 40 pips = 4000 points — BE pernas 2/3 (após TP1 no broker). */
export const PROVIDER_BE_ALL_PIPS = 40
/** 50 pips = 5000 points — BE perna 2 + trailing até Exit 2. */
export const PROVIDER_LEG2_TRAIL_PIPS = 50

function profitPips(
  pos: MetaApiPosition,
  spec: { point: number; pipSize?: number; digits?: number },
  symbol: string,
): number | null {
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

export function isPremiumProviderBrokerLegAccount(accountId: string): boolean {
  return accountId === CANONICAL_PREMIUM_ACCOUNT_ID
}

export function hasPremiumProviderBrokerLegs(positions: MetaApiPosition[]): boolean {
  return positions.some(
    (p) =>
      matchesPremiumLegComment(p.comment, 1) ||
      matchesPremiumLegComment(p.comment, 2) ||
      matchesPremiumLegComment(p.comment, 3),
  )
}

/** Ignorar «Trade active and running» — lifecycle automático activo. */
export function shouldIgnorePremiumTradeActiveForProvider(): boolean {
  return true
}

/** SL das pernas 2/3 → preço Exit 1 (TP1) após HIT TP1 no broker. */
export function exit1SlPrice(leg1: MetaApiPosition | undefined, signalTp1?: number | null): number | null {
  const tp = leg1?.takeProfit
  if (tp != null && tp > 0) return tp
  if (signalTp1 != null && signalTp1 > 0) return signalTp1
  return leg1?.openPrice ?? null
}

function splitProviderLegs(positions: MetaApiPosition[]) {
  return {
    leg1: positions.filter((p) => matchesPremiumLegComment(p.comment, 1)),
    leg2: positions.filter((p) => matchesPremiumLegComment(p.comment, 2)),
    leg3: positions.filter((p) => matchesPremiumLegComment(p.comment, 3)),
  }
}

/**
 * Lifecycle provider: só actua quando leg1 já fechou no broker (TP1 real).
 * Leg1 aberta → no-op. Leg3 sem trailing até leg2 fechar.
 */
export async function runPremiumProviderLifecycle(
  accountId: string,
  symbol?: string | null,
): Promise<{ updated: number; errors: string[] }> {
  const result = { updated: 0, errors: [] as string[] }
  const all = await listOpenPositions(accountId)
  let positions = all.filter(isProviderLegPosition)
  if (symbol) {
    const sym = symbol.toUpperCase()
    positions = positions.filter(
      (p) => p.symbol.toUpperCase().includes(sym) || sym.includes(p.symbol.toUpperCase()),
    )
  }
  if (!positions.length) return result

  if (findPremiumSinglePosition(positions, symbol ?? positions[0]!.symbol)) {
    return result
  }

  const { leg1, leg2, leg3 } = splitProviderLegs(positions)

  // TP1 ainda aberto no broker — não mover SL/trailing (evita fecho prematuro)
  if (leg1.length > 0) return result

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

  for (const pos of runners) {
    const pips = profitPips(pos, spec, pos.symbol)
    if (pips == null || pips < PROVIDER_BE_ALL_PIPS) continue
    const mod = await modifyPositionSlTp(accountId, pos.id, pos.openPrice, pos.takeProfit, null, pos.symbol)
    if (mod.success) result.updated++
    else if (mod.error) result.errors.push(mod.error)
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

  // Leg3: trailing só depois de leg2 fechada no broker (runner final)
  if (leg2.length === 0 && leg3.length > 0) {
    for (const pos of leg3) {
      const pips = profitPips(pos, spec, pos.symbol)
      if (pips == null || pips < PROVIDER_LEG2_TRAIL_PIPS) continue
      const mod = await modifyPositionSlTp(
        accountId,
        pos.id,
        pos.stopLoss ?? pos.openPrice,
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

/**
 * HIT TP1 Telegram na conta provider (3 pernas + TP broker):
 * — Nunca fecha leg1 manualmente
 * — Se leg1 ainda aberta: no-op (aguarda broker)
 * — Se leg1 já fechada: SL leg2/3 → Exit1; trailing só na leg2
 */
export async function applyProviderBrokerHitTp1(
  accountId: string,
  positions: MetaApiPosition[],
  symbol: string,
): Promise<{ updated: number; closed: number; cancelled: number; errors: string[] }> {
  const result = { updated: 0, closed: 0, cancelled: 0, errors: [] as string[] }
  const { leg1, leg2, leg3 } = splitProviderLegs(positions)

  if (leg1.length > 0) {
    console.log('[mtmcopy] provider HIT TP1: leg1 aberta — aguarda TP no broker (sem fecho manual)')
    return result
  }

  if (!leg2.length && !leg3.length) return result

  const spec = await getSymbolSpecification(accountId, symbol)
  if (!spec) {
    result.errors.push('Spec do símbolo indisponível')
    return result
  }

  const riskSample = leg2[0] ?? leg3[0]
  const riskPips = riskSample ? riskPipsFromPosition(riskSample, spec, symbol) : null
  const trailingLeg2 = premiumTrailingAfterTp1Hit(riskPips)

  const exit1 =
    exit1SlPrice(undefined, await getLatestProviderSignalTp(accountId, symbol, 1)) ??
    leg2[0]?.openPrice ??
    leg3[0]?.openPrice ??
    null

  if (exit1 == null) {
    result.errors.push('Preço Exit 1 indisponível')
    return result
  }

  for (const pos of leg2) {
    const mod = await modifyPositionSlTp(
      accountId,
      pos.id,
      exit1,
      pos.takeProfit,
      trailingLeg2,
      pos.symbol,
    )
    if (mod.success) result.updated++
    else if (mod.error) result.errors.push(mod.error)
  }

  for (const pos of leg3) {
    const mod = await modifyPositionSlTp(
      accountId,
      pos.id,
      exit1,
      pos.takeProfit,
      null,
      pos.symbol,
    )
    if (mod.success) result.updated++
    else if (mod.error) result.errors.push(mod.error)
  }

  return result
}

/**
 * HIT TP2 Telegram — provider: não fecha leg2; quando leg2 já fechou no broker, SL leg3 → Exit2.
 */
export async function applyProviderBrokerHitTp2(
  accountId: string,
  positions: MetaApiPosition[],
  symbol: string,
): Promise<{ updated: number; closed: number; cancelled: number; errors: string[] }> {
  const result = { updated: 0, closed: 0, cancelled: 0, errors: [] as string[] }
  const { leg2, leg3 } = splitProviderLegs(positions)

  if (leg2.length > 0) {
    console.log('[mtmcopy] provider HIT TP2: leg2 aberta — aguarda TP no broker')
    return result
  }

  if (!leg3.length) return result

  const exit2 =
    (await getLatestProviderSignalTp(accountId, symbol, 2)) ??
    leg3[0]?.takeProfit ??
    null

  if (exit2 == null) return result

  const spec = await getSymbolSpecification(accountId, symbol)
  const riskPips = spec && leg3[0] ? riskPipsFromPosition(leg3[0], spec, symbol) : null
  const trailing = premiumTrailingAfterTp1Hit(riskPips)

  for (const pos of leg3) {
    const mod = await modifyPositionSlTp(
      accountId,
      pos.id,
      exit2,
      pos.takeProfit,
      trailing,
      pos.symbol,
    )
    if (mod.success) result.updated++
    else if (mod.error) result.errors.push(mod.error)
  }

  return result
}

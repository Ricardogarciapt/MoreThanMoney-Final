import { inferPipSize, premiumTrailingWithActivation, type SymbolPointSpec, type TrailingDistance } from './pip-points'
import type { MetaApiPosition } from './metaapi'

/** SL ≤ 60 pips — mensagem «half/BE» activa trailing ~50 pips (não BE). */
export const PREMIUM_TIGHT_SL_PIPS = 60
/** SL > 75 pips — não BE; fechar metade ou aguardar. */
export const PREMIUM_WIDE_SL_PIPS = 75

export type PremiumTradeActiveVariant = 'half_or_trail' | 'maximize_zones'

export function isPremiumTradeActiveMessage(text: string): boolean {
  return /\btrade\s+active\s+and\s+running\b/i.test(text)
}

/** «Close all now» sem «close half» — maximizar zonas (TP1 lucro, TP2 -33%, TP3 BE+trail). */
export function isPremiumMaximizeZonesMessage(text: string): boolean {
  if (!isPremiumTradeActiveMessage(text)) return false
  if (/\bclose\s+half\b/i.test(text)) return false
  return /\bclose\s+all\s+now\b/i.test(text)
}

/** «Close half or close all» — gestão contextual por distância ao SL. */
export function isPremiumHalfOrTrailMessage(text: string): boolean {
  return isPremiumTradeActiveMessage(text) && /\bclose\s+half\b/i.test(text)
}

export function resolvePremiumTradeActiveVariant(text: string): PremiumTradeActiveVariant | null {
  if (!isPremiumTradeActiveMessage(text)) return null
  if (isPremiumMaximizeZonesMessage(text)) return 'maximize_zones'
  if (isPremiumHalfOrTrailMessage(text)) return 'half_or_trail'
  if (/\bclose\s+all\s+now\b/i.test(text)) return 'maximize_zones'
  return 'half_or_trail'
}

export function riskPipsFromPosition(
  pos: MetaApiPosition,
  spec: SymbolPointSpec,
  symbol?: string,
): number | null {
  const sl = pos.stopLoss
  if (sl == null || !Number.isFinite(sl) || sl <= 0) return null
  const pipSize = inferPipSize(spec, symbol ?? pos.symbol)
  if (!pipSize || pipSize <= 0) return null
  const riskPrice = Math.abs(pos.openPrice - sl)
  return Math.round(riskPrice / pipSize)
}

/** SL inicial ~50 pips — seguimento mais apertado após TP1. */
export const PREMIUM_INTELIGENT_RISK_MAX_PIPS = 55
/** SL inicial ~100 pips — trailing standard do runner. */
export const PREMIUM_STANDARD_RISK_PIPS = 85

export function premiumTrailingForTradeActive(): TrailingDistance {
  return premiumTrailingWithActivation()
}

/** Trailing após HIT TP1 — activa de imediato e segue o preço (runner). */
export function premiumTrailingAfterTp1Hit(riskPips: number | null): TrailingDistance {
  // Trailing pós-TP1 ALARGADO (2026-07-27) — com o runner maior (50%), dá mais espaço para o
  // preço correr antes de o stop apertar (segue movimentos maiores em vez de o cortar cedo).
  const trail =
    riskPips != null && riskPips <= PREMIUM_INTELIGENT_RISK_MAX_PIPS
      ? 30
      : riskPips != null && riskPips >= PREMIUM_STANDARD_RISK_PIPS
        ? 75
        : 45
  return { mode: 'threshold_pips', activationPips: 1, trailPips: trail }
}

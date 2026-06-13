import { inferPipSize, premiumTrailingWithActivation, type SymbolPointSpec } from './pip-points'
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

export function premiumTrailingForTradeActive(): ReturnType<typeof premiumTrailingWithActivation> {
  return premiumTrailingWithActivation()
}

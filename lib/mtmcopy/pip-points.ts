/** Premium — activação do trailing após 50 pips (500 points no ouro XAUUSD). */
export const PREMIUM_TRAILING_ACTIVATION_PIPS = 50
export const PREMIUM_TRAILING_ACTIVATION_POINTS = 500
/** Distância do trailing após activação (Premium). */
export const PREMIUM_TRAILING_DISTANCE_PIPS = 50

/** @deprecated usar PREMIUM_TRAILING_DISTANCE_PIPS — já não activa na abertura */
export const PREMIUM_TP1_TRAILING_PIPS = PREMIUM_TRAILING_DISTANCE_PIPS
/** @deprecated usar premiumTrailingWithActivation() */
export const PREMIUM_TP_HIT_TRAILING_PIPS = PREMIUM_TRAILING_DISTANCE_PIPS
/** Trailing na Exit 3 (Premium). */
export const PREMIUM_TP3_TRAILING_PIPS = PREMIUM_TRAILING_DISTANCE_PIPS
/** Trade Ideas — trailing para acompanhar SL ~20 / TP ~50 pips. */
export const TRADE_IDEAS_TRAILING_PIPS = 20

/** @deprecated usar PREMIUM_TP1_TRAILING_PIPS */
export const PREMIUM_TP_HIT_TRAILING_PIPS_LEGACY = PREMIUM_TP_HIT_TRAILING_PIPS

export interface SymbolPointSpec {
  point: number
  pipSize?: number
  digits?: number
}

/**
 * Converte pips → RELATIVE_POINTS para MetaAPI.
 * Fórmula: points = pips × (pipSize / point)
 *
 * Exemplos (100 pips de referência do utilizador):
 * - 100 pips = 1000 points → pipSize/point = 10 (ex. The Trading Master, forex 5 dígitos)
 * - 100 pips = 10000 points → pipSize/point = 100 (ex. alguns índices / JPY)
 */
export function pipsToRelativePoints(pips: number, spec: SymbolPointSpec): number {
  const point = spec.point > 0 ? spec.point : 0.00001
  const pipSize = spec.pipSize && spec.pipSize > 0 ? spec.pipSize : inferPipSize(spec)
  const ratio = pipSize / point
  return Math.max(1, Math.round(pips * ratio))
}

function inferPipSize(spec: SymbolPointSpec): number {
  const digits = spec.digits ?? 5
  const point = spec.point > 0 ? spec.point : 0.00001
  // Forex 5 dígitos: pip = 10× point; 3 dígitos (JPY): pip = 100× point; 2 dígitos (ouro): pip = 10× point
  if (digits === 3 || digits === 2) return point * 10
  if (digits === 5 || digits === 4) return point * 10
  return point * 10
}

export type TrailingDistance =
  | { mode: 'pips'; pips: number }
  | { mode: 'points'; points: number }
  | { mode: 'threshold_pips'; activationPips: number; trailPips: number }
  | { mode: 'threshold_points'; activationPoints: number; trailPoints: number }

/** Trailing Premium com activação aos 50 pips / 500 points. */
export function premiumTrailingWithActivation(): TrailingDistance {
  return {
    mode: 'threshold_pips',
    activationPips: PREMIUM_TRAILING_ACTIVATION_PIPS,
    trailPips: PREMIUM_TRAILING_DISTANCE_PIPS,
  }
}

export function formatTrailingDistance(d: TrailingDistance): string {
  if (d.mode === 'pips') return `${d.pips} pips`
  if (d.mode === 'points') return `${d.points} pts`
  if (d.mode === 'threshold_pips') {
    return `activação ${d.activationPips} pips · trail ${d.trailPips} pips`
  }
  return `activação ${d.activationPoints} pts · trail ${d.trailPoints} pts`
}

export function normalizeTrailingDistance(
  input: number | TrailingDistance | null | undefined,
  defaultPips = PREMIUM_TRAILING_DISTANCE_PIPS,
): TrailingDistance | null {
  if (input == null) return null
  if (typeof input === 'number') {
    if (input <= 0) return null
    return { mode: 'points', points: Math.round(input) }
  }
  if (input.mode === 'pips' && input.pips > 0) return input
  if (input.mode === 'points' && input.points > 0) return input
  if (input.mode === 'threshold_pips' && input.activationPips > 0 && input.trailPips > 0) return input
  if (input.mode === 'threshold_points' && input.activationPoints > 0 && input.trailPoints > 0) {
    return input
  }
  return { mode: 'pips', pips: defaultPips }
}

/** Distância padrão de trailing após HIT TP no canal Premium (pips). */
export const PREMIUM_TP_HIT_TRAILING_PIPS = 10

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

export function normalizeTrailingDistance(
  input: number | TrailingDistance | null | undefined,
  defaultPips = PREMIUM_TP_HIT_TRAILING_PIPS,
): TrailingDistance | null {
  if (input == null) return null
  if (typeof input === 'number') {
    if (input <= 0) return null
    return { mode: 'points', points: Math.round(input) }
  }
  if (input.mode === 'pips' && input.pips > 0) return input
  if (input.mode === 'points' && input.points > 0) return input
  return { mode: 'pips', pips: defaultPips }
}

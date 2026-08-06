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
/** Trade Ideas — trailing 100 points (The Trading Master). */
export const TRADE_IDEAS_TRAILING_POINTS = 100
/** @deprecated usar TRADE_IDEAS_TRAILING_POINTS */
export const TRADE_IDEAS_TRAILING_PIPS = 20

export function tradeIdeasTrailingDistance(): TrailingDistance {
  return { mode: 'points', points: TRADE_IDEAS_TRAILING_POINTS }
}

/** Auto Forex caminho de referência (50 pips) — BE a 50% do caminho. */
export const TRADE_IDEAS_TARGET_PIPS = 50
export const TRADE_IDEAS_BREAKEVEN_PIPS = TRADE_IDEAS_TARGET_PIPS / 2 // 25

/**
 * Trade Ideas / Sensei (Auto Forex) — trailing dinâmico MELHORADO (2026-08-06).
 *
 * Base = RISCO da trade (distância entrada→SL, "1R"); só se não houver risco é que usa metade do alvo.
 *  - Activa a **1R** de lucro (antes: metade do alvo — tarde em alvos largos).
 *  - Segue a **0.6R** (antes: seguia a distância inteira, só bloqueava breakeven). Como trail < activação,
 *    no instante da activação o SL já bloqueia (activação − trail) ≈ 0.4R de LUCRO, e depois acompanha.
 * Resultado: bloqueia lucro mais cedo e mais apertado, dá menos devolução, sem sufocar a trade.
 * Tunável por opts (activationR/trailR/minPips) sem redeploy quando ligado a config.
 */
export function tradeIdeasDynamicTrailing(
  riskPips: number | null,
  targetPips?: number | null,
  opts?: { activationR?: number; trailR?: number; minPips?: number },
): TrailingDistance {
  const activationR = opts?.activationR ?? 1.0
  const trailR = opts?.trailR ?? 0.6
  const minPips = opts?.minPips ?? 5
  const base =
    riskPips != null && riskPips > 0
      ? riskPips
      : targetPips != null && targetPips > 0
        ? Math.round(targetPips / 2)
        : TRADE_IDEAS_BREAKEVEN_PIPS
  const activationPips = Math.max(minPips, Math.round(base * activationR))
  // trail < activation → bloqueia lucro já na activação; nunca acima da activação (senão nunca dispara).
  const trailPips = Math.max(minPips, Math.min(activationPips, Math.round(base * trailR)))
  return { mode: 'threshold_pips', activationPips, trailPips }
}

export function riskPipsFromEntrySl(
  entry: number | null | undefined,
  sl: number | null | undefined,
  spec: SymbolPointSpec,
  symbol?: string,
): number | null {
  if (entry == null || sl == null || !Number.isFinite(entry) || !Number.isFinite(sl)) return null
  const pipSize = inferPipSize(spec, symbol)
  if (!pipSize || pipSize <= 0) return null
  return Math.max(1, Math.round(Math.abs(entry - sl) / pipSize))
}

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
  const pipSize = inferPipSize(spec)
  const ratio = pipSize / point
  return Math.max(1, Math.round(pips * ratio))
}

export function inferPipSize(spec: SymbolPointSpec, symbol?: string): number {
  const sym = (symbol ?? '').toUpperCase()
  const point = spec.point > 0 ? spec.point : 0.00001
  // Ouro/prata: forçar 1 pip = $0.10 — brokers MT5 reportam pipSize errado (ex. 0.01 → trailing 10× cedo)
  if (/XAU|GOLD|XAG|SILVER/.test(sym)) return 0.1
  if (spec.pipSize && spec.pipSize > 0) return spec.pipSize
  const digits = spec.digits ?? 5
  // Forex 5 dígitos: pip = 10× point; JPY 3 dígitos: pip = 100× point
  if (digits === 3) return point * 100
  if (digits === 2 || digits === 4 || digits === 5) return point * 10
  return point * 10
}

/** Converte pips → RELATIVE_POINTS conforme spec do broker (XAU: 50 pips = 5000 pts se point=0.001). */
export function convertTrailingToRelativePoints(
  trailing: TrailingDistance | number,
  spec: SymbolPointSpec,
  symbol?: string,
): TrailingDistance {
  const pipSpec: SymbolPointSpec = {
    ...spec,
    pipSize: inferPipSize(spec, symbol),
  }

  if (typeof trailing === 'number') {
    return { mode: 'points', points: Math.max(1, Math.round(trailing)) }
  }

  if (trailing.mode === 'pips') {
    return { mode: 'points', points: pipsToRelativePoints(trailing.pips, pipSpec) }
  }

  if (trailing.mode === 'threshold_pips') {
    return {
      mode: 'threshold_points',
      activationPoints: pipsToRelativePoints(trailing.activationPips, pipSpec),
      trailPoints: pipsToRelativePoints(trailing.trailPips, pipSpec),
    }
  }

  return trailing
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

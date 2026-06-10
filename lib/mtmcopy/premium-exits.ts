import { normalizeExitPcts } from './copy-methods'
import type { ParsedSignal } from './signal-parser'
import { PREMIUM_TP1_TRAILING_PIPS, PREMIUM_TP3_TRAILING_PIPS } from './pip-points'
import type { TrailingDistance } from './pip-points'

export interface PremiumExitLeg {
  legIndex: number
  tpPrice: number
  lot: number
  lotFraction: number
  trailing: TrailingDistance | null
  label: string
}

/** Ignora TP4 / Hold — máximo 3 exits. */
export function premiumTakeProfits(signal: ParsedSignal): number[] {
  return (signal.tp ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 3)
}

/** Plano de execução Premium: uma ordem por exit. */
export function buildPremiumExitLegs(
  signal: ParsedSignal,
  totalLot: number,
  exitPcts?: { tp1?: number | null; tp2?: number | null; tp3?: number | null },
): PremiumExitLeg[] {
  const tps = premiumTakeProfits(signal)
  if (!tps.length) return []

  const pcts = normalizeExitPcts(exitPcts?.tp1, exitPcts?.tp2, exitPcts?.tp3)
  const pctList = [pcts.tp1, pcts.tp2, pcts.tp3]

  const legs: PremiumExitLeg[] = []
  let allocated = 0

  for (let i = 0; i < tps.length; i++) {
    const pct = pctList[i] ?? 0
    const fraction = pct / 100
    let lot = roundLot(totalLot * fraction)
    if (i === tps.length - 1) {
      lot = roundLot(Math.max(0.01, totalLot - allocated))
    }
    allocated += lot

    const isFirst = i === 0
    const isLast = i === tps.length - 1

    legs.push({
      legIndex: i + 1,
      tpPrice: tps[i],
      lot,
      lotFraction: fraction,
      trailing: isFirst
        ? { mode: 'pips', pips: PREMIUM_TP1_TRAILING_PIPS }
        : isLast
          ? { mode: 'pips', pips: PREMIUM_TP3_TRAILING_PIPS }
          : null,
      label: `TP${i + 1} · ${pct}%`,
    })
  }

  return legs.filter((l) => l.lot > 0)
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

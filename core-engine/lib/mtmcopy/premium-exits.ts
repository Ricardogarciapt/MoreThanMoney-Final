import { normalizeExitPcts } from './copy-methods'
import type { ParsedSignal } from './signal-parser'
import type { TrailingDistance } from './pip-points'

export interface PremiumExitLeg {
  legIndex: number
  tpPrice: number
  lot: number
  lotFraction: number
  trailing: TrailingDistance | null
  label: string
}

/** Até 5 exits (5 é típico na sessão asiática); nº de pernas = nº de TPs do sinal. */
export function premiumTakeProfits(signal: ParsedSignal): number[] {
  return (signal.tp ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 5)
}

const MIN_LOT = 0.01

/**
 * Split de lotes por Exit, com PRIORIDADE >70% no Exit 1.
 * 3 exits: 75/15/10 · 5 exits: 72/12/8/5/3 (fallbacks para 1/2/4).
 */
export const PREMIUM_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [80, 20],
  3: [75, 15, 10],
  4: [74, 12, 8, 6],
  5: [72, 12, 8, 5, 3],
}

/** Plano de execução Premium: uma ordem por exit, >70% no Exit 1. */
export function buildPremiumExitLegs(
  signal: ParsedSignal,
  totalLot: number,
  exitPcts?: { tp1?: number | null; tp2?: number | null; tp3?: number | null },
): PremiumExitLeg[] {
  const tps = premiumTakeProfits(signal)
  if (!tps.length || totalLot < MIN_LOT) return []

  // Contas pequenas: se o lote não dá para dividir em pernas de ≥0.01, fecha tudo no Exit 1.
  const maxLegs = Math.max(1, Math.floor((totalLot + 1e-9) / MIN_LOT))
  const legCount = Math.min(tps.length, maxLegs)
  if (legCount <= 1) {
    return [
      {
        legIndex: 1,
        tpPrice: tps[0],
        lot: roundLot(totalLot),
        lotFraction: 1,
        trailing: null,
        label: `TP1 · 100%`,
      },
    ]
  }

  // Split por nº de pernas efetivas (>70% no Exit 1). exitPcts (config antiga) só é
  // respeitado quando existe e tem exatamente 3 níveis, para não quebrar setups manuais.
  const legacy =
    legCount === 3 && (exitPcts?.tp1 != null || exitPcts?.tp2 != null || exitPcts?.tp3 != null)
      ? (() => {
          const p = normalizeExitPcts(exitPcts?.tp1, exitPcts?.tp2, exitPcts?.tp3)
          return [p.tp1, p.tp2, p.tp3]
        })()
      : null
  const splits = legacy ?? PREMIUM_SPLITS[legCount] ?? PREMIUM_SPLITS[3]

  const legs: PremiumExitLeg[] = []
  let allocated = 0
  for (let i = 0; i < legCount; i++) {
    const pct = splits[i] ?? 0
    let lot = i === legCount - 1 ? roundLot(Math.max(MIN_LOT, totalLot - allocated)) : roundLot(totalLot * (pct / 100))
    // garante ≥ min por perna sem estourar o total
    if (lot < MIN_LOT) lot = MIN_LOT
    allocated += lot
    legs.push({
      legIndex: i + 1,
      tpPrice: tps[i],
      lot,
      lotFraction: pct / 100,
      trailing: null,
      label: `TP${i + 1} · ${pct}%`,
    })
  }

  return legs.filter((l) => l.lot > 0)
}

/** Identifica perna Premium pelo comment MT5 (ex. «mtmcopier-TP2 · 33%»). */
export function matchesPremiumLegComment(comment: string | undefined, legIndex: number): boolean {
  const c = (comment ?? '').toLowerCase()
  return (
    c.includes(`tp${legIndex} ·`) ||
    new RegExp(`[-_]tp${legIndex}(?:\\s|·|%|$)`).test(c)
  )
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

/**
 * Premium — subscritores directos (método 1) e conta provider (método 2):
 * 1 posição por sinal + parciais em HIT TP1/2/3 (Telegram).
 */

import { normalizeExitPcts } from './copy-methods'
import { listOpenPositions, type MetaApiPosition } from './metaapi'
import { matchesPremiumLegComment } from './premium-exits'
import type { ParsedSignal } from './signal-parser'

export const PREMIUM_SINGLE_TAG = 'PREM'
export const SMALL_CAPITAL_THRESHOLD = 1000

export interface PremiumExitPcts {
  tp1: number
  tp2: number
  tp3: number
}

export interface PremiumSingleOrderPlan {
  lot: number
  comment: string
  exitPcts: PremiumExitPcts
  smallAccount: boolean
  /** Sem TP fixo à abertura — parciais via mensagens Telegram. */
  takeProfit: null
}

export interface ParsedPremiumSingleMeta {
  originalLot: number
  exitPcts: PremiumExitPcts
  smallAccount: boolean
  exitsDone: number
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

export function isSmallCapitalAccount(equityOrBalance: number | null | undefined): boolean {
  if (equityOrBalance == null || !Number.isFinite(equityOrBalance)) return false
  return equityOrBalance < SMALL_CAPITAL_THRESHOLD
}

/** Volume mínimo para fechar parcial (2× mínimo broker). */
export function canPartializeVolume(volume: number, pct: number): boolean {
  const partial = roundLot(volume * (pct / 100))
  return partial >= 0.01 && partial < volume
}

export function buildPremiumSingleOrderComment(
  originalLot: number,
  exitPcts: PremiumExitPcts,
  opts?: { smallAccount?: boolean; exitsDone?: number; manual?: boolean },
): string {
  // Compact format — MT5 comment field limit is 31 chars
  // Max possible: "PREM-99.99-33/33/34-sa-ex3" = 26 chars ✓
  const sa = opts?.smallAccount ? '-sa' : ''
  const ex = opts?.exitsDone != null && opts.exitsDone > 0 ? `-ex${opts.exitsDone}` : ''
  const core = `PREM-${roundLot(originalLot)}-${exitPcts.tp1}/${exitPcts.tp2}/${exitPcts.tp3}${sa}${ex}`
  if (opts?.manual) return `MTM-M-${core}`.slice(0, 31)
  return core
}

export function parsePremiumSingleComment(comment: string | undefined): ParsedPremiumSingleMeta | null {
  const c = comment ?? ''

  // New compact format: "PREM-2.00-33/33/34[-sa][-ex1]"
  const newMatch = c.match(/^PREM-([\d.]+)-(\d+)\/(\d+)\/(\d+)(?:-sa)?(?:-ex(\d+))?/i)
  if (newMatch) {
    return {
      originalLot: parseFloat(newMatch[1]),
      exitPcts: {
        tp1: Number(newMatch[2]),
        tp2: Number(newMatch[3]),
        tp3: Number(newMatch[4]),
      },
      smallAccount: /-sa/i.test(c),
      exitsDone: newMatch[5] ? Number(newMatch[5]) : 0,
    }
  }

  // Legacy format: "mtmcopier-PREM · o2.00 · p33/33/34"
  if (!c.toLowerCase().includes(`mtmcopier-${PREMIUM_SINGLE_TAG.toLowerCase()}`)) return null

  const origMatch = c.match(/·\s*o([\d.]+)/i)
  const pctMatch = c.match(/·\s*p(\d+)\/(\d+)\/(\d+)/i)
  const exMatch = c.match(/·\s*ex(\d)/i)

  if (!origMatch || !pctMatch) return null

  return {
    originalLot: parseFloat(origMatch[1]),
    exitPcts: {
      tp1: Number(pctMatch[1]),
      tp2: Number(pctMatch[2]),
      tp3: Number(pctMatch[3]),
    },
    smallAccount: /·\s*sa1/i.test(c),
    exitsDone: exMatch ? Number(exMatch[1]) : 0,
  }
}

export function isPremiumSinglePosition(comment: string | undefined): boolean {
  return parsePremiumSingleComment(comment) != null
}

/** Plano: uma ordem market/limit com lote total — exits via gestão Telegram. */
export function buildPremiumSingleOrder(
  signal: ParsedSignal,
  totalLot: number,
  exitPcts?: { tp1?: number | null; tp2?: number | null; tp3?: number | null },
  equityOrBalance?: number | null,
  opts?: { manual?: boolean },
): PremiumSingleOrderPlan | null {
  const tps = (signal.tp ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 3)
  if (!tps.length) return null

  const pcts = normalizeExitPcts(exitPcts?.tp1, exitPcts?.tp2, exitPcts?.tp3)
  const exit: PremiumExitPcts = { tp1: pcts.tp1, tp2: pcts.tp2, tp3: pcts.tp3 }
  const lot = roundLot(totalLot)
  const smallAccount = isSmallCapitalAccount(equityOrBalance)

  return {
    lot,
    comment: buildPremiumSingleOrderComment(lot, exit, { smallAccount, manual: opts?.manual }),
    exitPcts: exit,
    smallAccount,
    takeProfit: null,
  }
}

function symbolMatches(posSymbol: string, signalSymbol: string): boolean {
  const a = posSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const b = signalSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return a === b || a.includes(b) || b.includes(a)
}

function isMtmcopierPosition(pos: MetaApiPosition): boolean {
  const c = (pos.comment ?? '').toLowerCase()
  return c.includes('mtmcopier') || c.startsWith('prem-') || c.startsWith('mtm-m-')
}

function directionMatches(pos: MetaApiPosition, direction: string): boolean {
  const isBuy = /buy|long/i.test(pos.type)
  const wantBuy = direction === 'buy'
  return isBuy === wantBuy
}

/** Posição Premium single activa no símbolo (mais recente). */
export function findPremiumSinglePosition(
  positions: MetaApiPosition[],
  symbol: string,
): MetaApiPosition | null {
  const matches = positions.filter(
    (p) =>
      isMtmcopierPosition(p) &&
      isPremiumSinglePosition(p.comment) &&
      symbolMatches(p.symbol, symbol),
  )
  return matches.length ? matches[matches.length - 1]! : null
}

/** Legacy: pernas TP2/TP3 ainda abertas — preferir gestão em vez de nova entrada. */
export function hasOpenPremiumRunnerLegs(
  positions: MetaApiPosition[],
  symbol: string,
  direction?: string,
): boolean {
  const filtered = positions.filter(
    (p) =>
      isMtmcopierPosition(p) &&
      symbolMatches(p.symbol, symbol) &&
      (!direction || directionMatches(p, direction)),
  )

  if (findPremiumSinglePosition(filtered, symbol)) return true

  return filtered.some(
    (p) =>
      matchesPremiumLegComment(p.comment, 2) || matchesPremiumLegComment(p.comment, 3),
  )
}

/**
 * Se já existe exposição Premium no par (single ou pernas 2/3), não abrir trade duplicada.
 */
export async function shouldSkipDuplicatePremiumEntry(
  accountId: string,
  symbol: string,
  direction: string,
): Promise<{ skip: boolean; reason?: string }> {
  const positions = await listOpenPositions(accountId)
  const mtm = positions.filter(isMtmcopierPosition)

  if (hasOpenPremiumRunnerLegs(mtm, symbol, direction)) {
    return {
      skip: true,
      reason:
        'Exposição Premium activa (perna 2/3 ou posição única) — preferir gestão da trade existente',
    }
  }

  return { skip: false }
}

/** Lote efectivo para parcial: % do volume original (fallback volume actual). */
export function partialVolumeForExit(
  pos: MetaApiPosition,
  exitLevel: 1 | 2 | 3,
  meta: ParsedPremiumSingleMeta | null,
): number {
  const current = pos.volume ?? 0
  if (current <= 0) return 0

  const pcts = meta?.exitPcts ?? { tp1: 75, tp2: 15, tp3: 10 }
  const pct = exitLevel === 1 ? pcts.tp1 : exitLevel === 2 ? pcts.tp2 : pcts.tp3
  const base = meta?.originalLot && meta.originalLot > 0 ? meta.originalLot : current
  let vol = roundLot(base * (pct / 100))

  if (exitLevel === 3) {
    vol = roundLot(current)
  } else if (vol >= current) {
    vol = roundLot(Math.max(0.01, current * (pct / 100)))
  }

  if (vol >= current) vol = roundLot(Math.max(0.01, current - 0.01))
  return vol >= 0.01 ? vol : 0
}

/** Reduz lote em contas com capital < 1000 (protecção margem). */
export function scaleLotForSmallCapital(totalLot: number, equityOrBalance: number | null): number {
  if (!isSmallCapitalAccount(equityOrBalance)) return totalLot
  const scale =
    equityOrBalance! < 300 ? 0.35 : equityOrBalance! < 600 ? 0.5 : 0.65
  return roundLot(Math.max(0.01, totalLot * scale))
}

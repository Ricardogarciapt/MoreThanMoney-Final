import type { MTMcopierConnection } from './types'
import type { ParsedSignal } from './signal-parser'

export function computeLotSize(
  conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value' | 'max_risk_percent'>,
  signal: ParsedSignal,
  accountBalance?: number | null,
): number {
  const value = Number(conn.lot_value) || 0.01

  switch (conn.lot_mode) {
    case 'multiplier':
      return round(1.0 * value)
    case 'risk_percent': {
      if (!accountBalance || !signal.sl) return 0.01
      const entry = signal.entry ?? signal.sl
      const riskAmount = accountBalance * (value / 100)
      const slDistance = Math.abs(entry - signal.sl)
      if (slDistance <= 0) return 0.01
      const sym = (signal.symbol ?? '').toUpperCase()
      const contractSize =
        sym.includes('XAU') || sym === 'GOLD'
          ? 100
          : sym.includes('BTC')
            ? 1
            : /^(US30|NAS100|GER40|US500)/.test(sym)
              ? 1
              : 100_000
      const lot = riskAmount / (slDistance * contractSize)
      const cap = conn.max_risk_percent != null ? Math.min(50, value * 2) : 50
      return clamp(round(lot), 0.01, cap)
    }
    case 'fixed':
    default:
      return clamp(round(value), 0.01, 50)
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

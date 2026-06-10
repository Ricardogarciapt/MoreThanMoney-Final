import type { MTMcopierConnection } from './types'
import type { ParsedSignal } from './signal-parser'

export type LotSizingConn = Pick<MTMcopierConnection, 'lot_mode' | 'lot_value' | 'max_risk_percent'>

/** Devolve mensagem de skip se o lote não puder ser calculado com segurança. */
export function getLotSizingSkipReason(
  conn: LotSizingConn,
  signal: ParsedSignal,
  accountBalance?: number | null,
  computedLot?: number,
): string | null {
  const lot = computedLot ?? computeLotSize(conn, signal, accountBalance)

  if (conn.lot_mode !== 'risk_percent') {
    return lot < 0.01 ? 'Lote calculado inválido (< 0.01)' : null
  }

  if (!accountBalance || accountBalance <= 0) {
    return 'Saldo da conta provider indisponível — impossível calcular % risco'
  }
  if (!signal.sl || signal.sl <= 0) {
    return 'Sinal sem Stop Loss — impossível calcular % risco'
  }
  const entry = signal.entry ?? signal.sl
  if (Math.abs(entry - signal.sl) <= 0) {
    return 'Distância SL inválida — impossível calcular % risco'
  }
  if (lot < 0.01) {
    return 'Lote calculado inválido (< 0.01) com % risco configurado'
  }
  return null
}

export function computeLotSize(
  conn: LotSizingConn,
  signal: ParsedSignal,
  accountBalance?: number | null,
): number {
  const value = Number(conn.lot_value) || 0.01

  switch (conn.lot_mode) {
    case 'multiplier':
      return round(1.0 * value)
    case 'risk_percent': {
      if (!accountBalance || accountBalance <= 0 || !signal.sl || signal.sl <= 0) return 0
      const entry = signal.entry ?? signal.sl
      const riskAmount = accountBalance * (value / 100)
      const slDistance = Math.abs(entry - signal.sl)
      if (slDistance <= 0) return 0
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
      const maxLotCap =
        conn.max_risk_percent != null && conn.max_risk_percent > 0
          ? Math.min(50, conn.max_risk_percent)
          : 50
      return clamp(round(lot), 0.01, maxLotCap)
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

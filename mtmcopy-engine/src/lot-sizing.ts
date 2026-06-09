import type { MTMcopierConnection } from './supabase-client'
import type { ParsedSignal } from './signal-parser'

/**
 * Calcula o lote a usar para um sinal, de acordo com as regras de cópia
 * configuradas pelo utilizador em /mtmcopy (lot_mode + lot_value).
 *
 *  - fixed:        usa sempre o valor configurado (ex: 0.01 lotes)
 *  - multiplier:   multiplica um lote-base de referência (1.0) pelo valor
 *                  configurado — útil para escalar o sinal original
 *  - risk_percent: calcula o lote a partir da % de risco e da distância ao SL
 *                  (requer accountBalance e que o sinal tenha SL definido)
 */
export function computeLotSize(
  conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value'>,
  signal: ParsedSignal,
  accountBalance?: number | null
): number {
  const value = Number(conn.lot_value) || 0.01

  switch (conn.lot_mode) {
    case 'multiplier': {
      const BASE_LOT = 1.0
      return round(BASE_LOT * value)
    }
    case 'risk_percent': {
      if (!accountBalance || !signal.entry || !signal.sl) {
        // Sem dados suficientes para calcular risco — recua para lote mínimo seguro
        return 0.01
      }
      const riskAmount = accountBalance * (value / 100)
      const slDistance = Math.abs(signal.entry - signal.sl)
      if (slDistance <= 0) return 0.01
      // Aproximação genérica (1 lote ≈ 100k unidades / valor de pip varia por par
      // e corretora — em produção, ajustar com os dados reais do símbolo via MetaApi)
      const lot = riskAmount / (slDistance * 100000)
      return clamp(round(lot), 0.01, 50)
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

import type { MTMcopierConnection } from './types'
import type { ParsedSignal } from './signal-parser'

export type LotSizingConn = Pick<MTMcopierConnection, 'lot_mode' | 'lot_value' | 'max_risk_percent'>

/** Lote mínimo aceite pelos brokers MT5. */
export const MIN_LOT = 0.01

/**
 * Risco efectivo (% do saldo) de um lote, para quando o piso de 0,01 sobe o risco acima do
 * configurado. Serve para REGISTAR o que aconteceu, não para decidir.
 */
export function riscoEfetivoPct(
  lot: number,
  signal: ParsedSignal,
  accountBalance?: number | null,
  marketPrice?: number | null,
): number | null {
  if (!accountBalance || accountBalance <= 0 || !signal.sl || signal.sl <= 0) return null
  const entry = resolveEntryForRisk(signal, marketPrice)
  if (entry == null || entry <= 0) return null
  const distancia = Math.abs(entry - signal.sl)
  if (!(distancia > 0)) return null
  // Aproximação por contrato de 100 unidades (ouro/CFD) — a mesma base do cálculo do lote.
  const risco = distancia * lot * 100
  return Math.round((risco / accountBalance) * 10000) / 100
}

/** Preço de referência para calcular distância ao SL em ordens market. */
export function resolveEntryForRisk(
  signal: ParsedSignal,
  marketPrice?: number | null,
): number | null {
  if (signal.entry != null && signal.entry > 0) return signal.entry
  if (marketPrice != null && marketPrice > 0) return marketPrice
  if (signal.sl != null && signal.sl > 0 && signal.tp[0] != null && signal.tp[0] > 0) {
    return (signal.sl + signal.tp[0]) / 2
  }
  return null
}

export function signalForRiskSizing(
  signal: ParsedSignal,
  marketPrice?: number | null,
): ParsedSignal {
  // Ordens a mercado dimensionam pelo PREÇO DE MERCADO (fill real), não pela entry
  // nominal do sinal. Sinais de "zona" enchem no extremo da zona; usar a entry
  // nominal subestima a distância ao SL e duplica o risco (ex.: 0.5% → 1%+).
  const isMarket = signal.orderType !== 'limit'
  const entry =
    isMarket && marketPrice != null && marketPrice > 0
      ? marketPrice
      : resolveEntryForRisk(signal, marketPrice)
  if (entry == null || entry === signal.entry) return signal
  return { ...signal, entry }
}

/** Devolve mensagem de skip se o lote não puder ser calculado com segurança. */
export function getLotSizingSkipReason(
  conn: LotSizingConn,
  signal: ParsedSignal,
  accountBalance?: number | null,
  computedLot?: number,
  marketPrice?: number | null,
): string | null {
  const riskSignal = signalForRiskSizing(signal, marketPrice)
  const lot = computedLot ?? computeLotSize(conn, riskSignal, accountBalance)

  if (conn.lot_mode !== 'risk_percent') {
    return lot < MIN_LOT ? 'Lote calculado inválido (< 0.01)' : null
  }

  if (!accountBalance || accountBalance <= 0) {
    return 'Saldo da conta indisponível — não foi possível consultar MetaAPI para calcular % risco'
  }
  if (!riskSignal.sl || riskSignal.sl <= 0) {
    return 'Sinal sem Stop Loss — impossível calcular % risco'
  }
  const entry = resolveEntryForRisk(riskSignal, marketPrice)
  if (entry == null || entry <= 0) {
    return 'Preço de entrada indisponível — impossível calcular % risco'
  }
  if (Math.abs(entry - riskSignal.sl) <= 0) {
    return 'Distância SL inválida — impossível calcular % risco'
  }
  if (lot < MIN_LOT) {
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
    case 'multiplier': {
      // O multiplicador existe para copiar o lote do MESTRE vezes N. Só que multiplicava por um
      // 1.0 fixo no código — sem mestre nenhum à vista. Com lot_value=1 isso dava UM LOTE INTEIRO:
      // em ouro, ~449.000 USD de exposição, 30x o saldo de uma conta de 15.000. Duas ligações
      // estavam assim e só não dispararam porque o broker tinha o trading desativado.
      //
      // Na execução semi-automática não existe mestre, logo não há lote de referência e o
      // multiplicador não tem significado. Cai para o risco configurado na conta (o caminho
      // seguro) e, se nem isso estiver definido, recusa dimensionar.
      const risco = Number(conn.max_risk_percent)
      if (risco > 0 && accountBalance && accountBalance > 0) {
        return computeLotSize({ ...conn, lot_mode: 'risk_percent', lot_value: risco }, signal, accountBalance)
      }
      return 0 // sem referência e sem risco definido → não abre (getLotSizingSkipReason explica)
    }
    case 'risk_percent': {
      if (!accountBalance || accountBalance <= 0 || !signal.sl || signal.sl <= 0) return 0
      const entry = resolveEntryForRisk(signal)
      if (entry == null || entry <= 0) return 0
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
      // CONTAS PEQUENAS: quando a percentagem dá menos do que o mínimo do broker, o clamp
      // abaixo abre a 0,01 — e isso arrisca MAIS do que o configurado. É deliberado (mais vale
      // entrar no mínimo do que não entrar), mas tem de ser visível: usar riscoEfetivoPct() para
      // registar o risco real sempre que o piso entra em acção.
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

// Métricas de performance reais a partir das trades FECHADAS (pnl) — curva de equity,
// drawdown, profit factor, expectancy, por conta/símbolo/mês e deteção de red-flags.
// Partilhado entre a métrica do utilizador (/api/mtmcopy/metrics) e a visão global de
// admin (/api/admin/mtmcopy/global-performance).

import { computeOutcome } from './trade-outcome'

export type ClosedTradeRow = {
  pnl: number | null
  lot_size: number | null
  symbol: string | null
  direction: string | null
  opened_at: string | null
  closed_at: string | null
  trade_source: string | null
  risk_amount: number | null
  mtmcopy_connection_id: string | null
  /** Preços de entrada/saída (quando disponíveis) → pips e % de flutuação por trade. */
  entry_price?: number | null
  exit_price?: number | null
}

// O tamanho do pip vive em trade-outcome.ts — fonte única partilhada com os motores.
// A cópia que estava aqui tratava BTCUSD como par forex (6 letras) e multiplicava os pips
// de cripto por dez mil.
export { pipSizeForSymbol } from './trade-outcome' 

/** Pips ASSINADOS e % de flutuação de uma trade fechada (null sem preços). */
export function tradePipsPct(t: Pick<ClosedTradeRow, 'symbol' | 'direction' | 'entry_price' | 'exit_price'>): { pips: number; pct: number } | null {
  const o = computeOutcome({ symbol: t.symbol, direction: t.direction, entry: t.entry_price, exit: t.exit_price })
  return o ? { pips: o.pips, pct: o.pct } : null
}

export interface PerformanceData {
  totalPnl: number
  tradeCount: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number | null
  avgWin: number
  avgLoss: number
  expectancy: number
  maxDrawdown: number
  maxDrawdownPct: number
  returnOverMaxDD: number | null
  bestTrade: number
  worstTrade: number
  /** Pips ASSINADOS acumulados e % média de flutuação por trade (trades com preços). */
  totalPips: number | null
  avgFluctuationPct: number | null
  equityCurve: { date: string; pnl: number; cumulative: number }[]
  byAccount: { label: string; pnl: number; trades: number; winRate: number }[]
  bySymbol: { symbol: string; pnl: number; trades: number }[]
  monthly: { month: string; pnl: number; trades: number }[]
  redFlags: string[]
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computePerformance(
  rawTrades: ClosedTradeRow[],
  labelById: Map<string, string>,
): PerformanceData | null {
  const trades = rawTrades
    .filter((t) => t.pnl != null)
    .map((t) => ({ ...t, pnl: Number(t.pnl), ts: t.closed_at ?? t.opened_at ?? '' }))
    .filter((t) => Number.isFinite(t.pnl) && t.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts))

  if (!trades.length) return null

  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0
  const equityCurve: { date: string; pnl: number; cumulative: number }[] = []
  let grossProfit = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let bestTrade = -Infinity
  let worstTrade = Infinity

  let totalPips = 0
  let pctSum = 0
  let pipsTrades = 0
  for (const t of trades) {
    cumulative += t.pnl
    peak = Math.max(peak, cumulative)
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative)
    equityCurve.push({ date: t.ts.slice(0, 10), pnl: round2(t.pnl), cumulative: round2(cumulative) })
    if (t.pnl >= 0) { wins++; grossProfit += t.pnl } else { losses++; grossLoss += Math.abs(t.pnl) }
    const pp = tradePipsPct(t)
    if (pp) { totalPips += pp.pips; pctSum += Math.abs(pp.pct); pipsTrades++ }
    bestTrade = Math.max(bestTrade, t.pnl)
    worstTrade = Math.min(worstTrade, t.pnl)
  }

  const totalPnl = cumulative
  const count = trades.length
  const winRate = count ? Math.round((wins / count) * 100) : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const avgWin = wins ? grossProfit / wins : 0
  const avgLoss = losses ? grossLoss / losses : 0
  const expectancy = count ? totalPnl / count : 0
  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0
  const returnOverMaxDD = maxDrawdown > 0 ? totalPnl / maxDrawdown : null

  // por conta
  const perAccount = new Map<string, { pnl: number; trades: number; wins: number }>()
  for (const t of trades) {
    const key = t.mtmcopy_connection_id ?? 'manual'
    const a = perAccount.get(key) ?? { pnl: 0, trades: 0, wins: 0 }
    a.pnl += t.pnl; a.trades++; if (t.pnl >= 0) a.wins++
    perAccount.set(key, a)
  }
  const byAccount = [...perAccount.entries()]
    .map(([id, a]) => ({
      label: id === 'manual' ? 'Manual' : (labelById.get(id) ?? 'Conta'),
      pnl: round2(a.pnl), trades: a.trades,
      winRate: a.trades ? Math.round((a.wins / a.trades) * 100) : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)

  // por símbolo (top por |pnl|)
  const perSymbol = new Map<string, { pnl: number; trades: number }>()
  for (const t of trades) {
    if (!t.symbol) continue
    const s = perSymbol.get(t.symbol) ?? { pnl: 0, trades: 0 }
    s.pnl += t.pnl; s.trades++
    perSymbol.set(t.symbol, s)
  }
  const bySymbol = [...perSymbol.entries()]
    .map(([symbol, s]) => ({ symbol, pnl: round2(s.pnl), trades: s.trades }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 8)

  // mensal
  const perMonth = new Map<string, { pnl: number; trades: number }>()
  for (const t of trades) {
    const m = t.ts.slice(0, 7)
    const mm = perMonth.get(m) ?? { pnl: 0, trades: 0 }
    mm.pnl += t.pnl; mm.trades++
    perMonth.set(m, mm)
  }
  const monthly = [...perMonth.entries()]
    .map(([month, m]) => ({ month, pnl: round2(m.pnl), trades: m.trades }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)

  // red-flags: aumento de lote após perdas consecutivas (martingale) por conta
  const redFlags: string[] = []
  const byAcctChrono = new Map<string, typeof trades>()
  for (const t of trades) {
    const key = t.mtmcopy_connection_id ?? 'manual'
    if (!byAcctChrono.has(key)) byAcctChrono.set(key, [])
    byAcctChrono.get(key)!.push(t)
  }
  for (const [id, list] of byAcctChrono) {
    let consecLosses = 0
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].pnl < 0) consecLosses++; else consecLosses = 0
      const prevLot = Number(list[i - 1].lot_size) || 0
      const curLot = Number(list[i].lot_size) || 0
      if (consecLosses >= 2 && prevLot > 0 && curLot >= prevLot * 1.8) {
        const label = id === 'manual' ? 'Manual' : (labelById.get(id) ?? 'Conta')
        redFlags.push(`⚠️ ${label}: lote aumentado (${prevLot}→${curLot}) após ${consecLosses} perdas seguidas — possível martingale.`)
        break
      }
    }
  }

  return {
    totalPnl: round2(totalPnl),
    tradeCount: count,
    totalPips: pipsTrades ? Math.round(totalPips * 10) / 10 : null,
    avgFluctuationPct: pipsTrades ? Math.round((pctSum / pipsTrades) * 100) / 100 : null,
    wins, losses, winRate,
    profitFactor: profitFactor === Infinity ? null : round2(profitFactor),
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    expectancy: round2(expectancy),
    maxDrawdown: round2(maxDrawdown),
    maxDrawdownPct: round2(maxDrawdownPct),
    returnOverMaxDD: returnOverMaxDD == null ? null : round2(returnOverMaxDD),
    bestTrade: round2(bestTrade),
    worstTrade: round2(worstTrade),
    equityCurve,
    byAccount,
    bySymbol,
    monthly,
    redFlags,
  }
}

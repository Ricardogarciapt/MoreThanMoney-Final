import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getAccountBalance, isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'

const supabaseAdmin = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

type SignalRow = {
  id: string
  symbol: string | null
  direction: string | null
  status: string
  created_at: string
  connection_id: string
}

type ClosedTradeRow = {
  pnl: number | null
  lot_size: number | null
  symbol: string | null
  direction: string | null
  opened_at: string | null
  closed_at: string | null
  trade_source: string | null
  risk_amount: number | null
  mtmcopy_connection_id: string | null
}

/** Métricas de performance reais a partir das trades FECHADAS (pnl) — curva de equity,
 *  drawdown, profit factor, expectancy, por conta/símbolo/mês e deteção de red-flags. */
function computePerformance(
  rawTrades: ClosedTradeRow[],
  labelById: Map<string, string>,
) {
  // ordenar cronologicamente pelo fecho (fallback abertura) e só com pnl
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

  for (const t of trades) {
    cumulative += t.pnl
    peak = Math.max(peak, cumulative)
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative)
    equityCurve.push({ date: t.ts.slice(0, 10), pnl: round2(t.pnl), cumulative: round2(cumulative) })
    if (t.pnl >= 0) { wins++; grossProfit += t.pnl } else { losses++; grossLoss += Math.abs(t.pnl) }
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function connectionDisplayLabel(c: {
  account_label?: string | null
  mt5_login?: string | null
  mt5_login_last4?: string | null
  audit_label?: string | null
  is_audited?: boolean | null
}): string {
  if (c.is_audited && c.audit_label?.trim()) return c.audit_label.trim()
  const rawLabel = c.account_label?.trim()
  if (rawLabel && rawLabel.toLowerCase() !== 'null') return rawLabel
  if (c.mt5_login?.trim()) return c.mt5_login.trim()
  if (c.mt5_login_last4) return `****${c.mt5_login_last4}`
  return 'Conta MT5'
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const startDate = startOfMonth.toISOString().slice(0, 10)
  const endDate = new Date().toISOString().slice(0, 10)

  const [{ data: connections }, { data: signals }, { data: tradingPlan }, journalMetricsRes, { data: journalTrades }, { data: closedTrades }] =
    await Promise.all([
      supabaseAdmin
        .from('mtmcopy_connections')
        .select(
          'id, account_role, account_label, mt5_status, is_active, metaapi_account_id, mt5_login, mt5_login_last4, last_signal_at, is_audited, audit_label',
        )
        .eq('user_id', user.id)
        .neq('mt5_status', 'disconnected'),
      supabaseAdmin
        .from('mtmcopy_signal_log')
        .select('id, symbol, direction, status, created_at, connection_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabaseAdmin
        .from('trading_plans')
        .select('id, plan_name, trader_name, max_risk_per_trade, max_daily_loss, daily_profit_target, monthly_profit_target, is_trading')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabaseAdmin.rpc('get_trading_metrics', {
        user_uuid: user.id,
        start_date: startDate,
        end_date: endDate,
      }),
      supabaseAdmin
        .from('trading_plan_trades')
        .select('id, execution_mode, trade_source, status, pnl, opened_at')
        .eq('user_id', user.id)
        .order('opened_at', { ascending: false })
        .limit(200),
      supabaseAdmin
        .from('trading_plan_trades')
        .select('pnl, lot_size, symbol, direction, opened_at, closed_at, trade_source, risk_amount, mtmcopy_connection_id')
        .eq('user_id', user.id)
        .eq('execution_mode', 'executed')
        .eq('status', 'closed')
        .not('pnl', 'is', null)
        .order('closed_at', { ascending: true, nullsFirst: false })
        .limit(2000),
    ])

  const rows = (signals ?? []) as SignalRow[]
  const conns = connections ?? []
  const copyConnectionIds = new Set(
    conns.filter((c) => !c.is_audited && (c.account_role ?? 'slave') !== 'master').map((c) => c.id),
  )
  const copySignals = rows.filter((r) => copyConnectionIds.has(r.connection_id))

  const now = Date.now()
  const dayMs = 86400000
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const startWeek = new Date(now - 7 * dayMs)

  const tradeSignals = copySignals.filter((r) => r.direction && r.symbol)
  const executed = tradeSignals.filter((r) => r.status === 'executed').length
  const errors = tradeSignals.filter((r) => r.status === 'error').length
  const skipped = tradeSignals.filter((r) => r.status === 'skipped').length
  const received = tradeSignals.filter((r) => r.status === 'received').length
  const attempted = executed + errors
  const successRate = attempted > 0 ? Math.round((executed / attempted) * 100) : null

  const todayCount = tradeSignals.filter(
    (r) => new Date(r.created_at).getTime() >= startToday.getTime(),
  ).length
  const weekCount = tradeSignals.filter(
    (r) => new Date(r.created_at).getTime() >= startWeek.getTime(),
  ).length

  const buys = tradeSignals.filter((r) => r.direction?.toLowerCase() === 'buy').length
  const sells = tradeSignals.filter((r) => r.direction?.toLowerCase() === 'sell').length

  const symbolCounts = new Map<string, number>()
  for (const r of tradeSignals) {
    if (!r.symbol) continue
    symbolCounts.set(r.symbol, (symbolCounts.get(r.symbol) ?? 0) + 1)
  }
  const topSymbols = [...symbolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol, count]) => ({ symbol, count }))

  const dailyActivity: { date: string; executed: number; total: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * dayMs)
    const key = d.toISOString().slice(0, 10)
    const dayRows = tradeSignals.filter((r) => r.created_at.slice(0, 10) === key)
    dailyActivity.push({
      date: key,
      executed: dayRows.filter((r) => r.status === 'executed').length,
      total: dayRows.length,
    })
  }

  const activeConnections = conns.filter((c) => c.is_active && !c.is_audited).length
  const connectedMt5 = conns.filter((c) => c.mt5_status === 'connected').length
  const lastSignalAt = copySignals[0]?.created_at ?? null

  let totalBalance: number | null = null
  const accountBalances: { connectionId: string; label: string; balance: number | null; isAudited?: boolean }[] = []

  if (isMetaApiConfigured()) {
    const balanceTargets = conns.filter(
      (c) => c.metaapi_account_id && c.mt5_status === 'connected' && (c.account_role ?? 'slave') !== 'master',
    )
    const balances = await Promise.all(
      balanceTargets.slice(0, 5).map(async (c) => {
        const balance = await getAccountBalance(c.metaapi_account_id!)
        return {
          connectionId: c.id,
          label: connectionDisplayLabel(c),
          balance,
          isAudited: Boolean(c.is_audited),
        }
      }),
    )
    accountBalances.push(...balances)
    const copyBalances = balances.filter((b) => !b.isAudited).map((b) => b.balance)
    const valid = copyBalances.filter((b): b is number => b != null)
    if (valid.length) totalBalance = valid.reduce((a, b) => a + b, 0)
  }

  const trades = journalTrades ?? []
  const journalExecuted = trades.filter((t) => t.execution_mode === 'executed')
  const journalAnalysis = trades.filter((t) => t.execution_mode === 'analysis')

  const labelById = new Map(conns.map((c) => [c.id, connectionDisplayLabel(c)]))
  const performance = computePerformance((closedTrades ?? []) as ClosedTradeRow[], labelById)

  return NextResponse.json({
    summary: {
      totalSignals: tradeSignals.length,
      executed,
      errors,
      skipped,
      received,
      successRate,
      todayCount,
      weekCount,
      buys,
      sells,
      activeConnections,
      connectedMt5,
      lastSignalAt,
      totalBalance,
    },
    topSymbols,
    dailyActivity,
    accountBalances,
    connectionCount: conns.length,
    journal: {
      metrics: journalMetricsRes.data ?? null,
      executedCount: journalExecuted.length,
      analysisCount: journalAnalysis.length,
      bySource: {
        manual: trades.filter((t) => t.trade_source === 'manual').length,
        copy: trades.filter((t) => t.trade_source === 'copy').length,
        audited: trades.filter((t) => t.trade_source === 'audited').length,
      },
    },
    performance,
    tradingPlan: tradingPlan ?? null,
    auditedAccounts: conns
      .filter((c) => c.is_audited)
      .map((c) => ({
        id: c.id,
        label: connectionDisplayLabel(c),
        mt5_status: c.mt5_status,
      })),
  })
}

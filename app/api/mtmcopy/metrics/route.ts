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

  const [{ data: connections }, { data: signals }, { data: tradingPlan }, journalMetricsRes, { data: journalTrades }] =
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

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

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const [{ data: connections }, { data: signals }] = await Promise.all([
    supabaseAdmin
      .from('mtmcopy_connections')
      .select(
        'id, account_role, account_label, mt5_status, is_active, metaapi_account_id, mt5_login_last4, last_signal_at',
      )
      .eq('user_id', user.id)
      .neq('mt5_status', 'disconnected'),
    supabaseAdmin
      .from('mtmcopy_signal_log')
      .select('id, symbol, direction, status, created_at, connection_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const rows = (signals ?? []) as SignalRow[]
  const conns = connections ?? []

  const now = Date.now()
  const dayMs = 86400000
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const startWeek = new Date(now - 7 * dayMs)

  const tradeSignals = rows.filter((r) => r.direction && r.symbol)
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

  const activeConnections = conns.filter((c) => c.is_active).length
  const connectedMt5 = conns.filter((c) => c.mt5_status === 'connected').length
  const lastSignalAt = rows[0]?.created_at ?? null

  let totalBalance: number | null = null
  const accountBalances: { connectionId: string; label: string; balance: number | null }[] = []

  if (isMetaApiConfigured()) {
    const slaves = conns.filter(
      (c) => c.account_role !== 'master' && c.metaapi_account_id && c.mt5_status === 'connected',
    )
    const balances = await Promise.all(
      slaves.slice(0, 3).map(async (c) => {
        const balance = await getAccountBalance(c.metaapi_account_id!)
        const label = c.account_label?.trim() || (c.mt5_login_last4 ? `****${c.mt5_login_last4}` : 'Conta')
        return { connectionId: c.id, label, balance }
      }),
    )
    accountBalances.push(...balances)
    const valid = balances.map((b) => b.balance).filter((b): b is number => b != null)
    if (valid.length) totalBalance = valid.reduce((a, b) => a + b, 0)
  }

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
  })
}

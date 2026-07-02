import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { enrichConnectionsWithMetrics } from '@/lib/mtmcopy/subscriber-metrics'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const supabase = getSupabaseAdmin()

const PROFILE_FIELDS =
  'id, email, full_name, username, user_type, member_category, is_active, is_verified, subscription_plan, subscription_platform, subscription_expires_at, created_at'

const CONNECTION_FIELDS = `
  id, user_id, account_label, telegram_channel, telegram_status, mt5_login, mt5_login_last4,
  mt5_platform, mt5_server, mt5_status, lot_mode, lot_value, max_risk_percent,
  symbols_whitelist, copy_sl, copy_tp, auto_trailing_stop, trailing_stop_points,
  reverse_signals, is_active, last_signal_at,
  last_error, created_at, updated_at, metaapi_account_id, copyfactory_subscribed,
  copy_method, copyfactory_strategy_pick, exit_pct_tp1, exit_pct_tp2, exit_pct_tp3,
  prop_firm_type, copy_as_manual, baseline_balance, is_audited, audit_label
`

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim().replace(/[%_]/g, '') || ''
  const filter = searchParams.get('filter') || 'all'
  const userId = searchParams.get('user_id')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const includeBalances = searchParams.get('include_balances') !== '0'

  if (userId) {
    const [{ data: profile, error: pErr }, { data: connections }] = await Promise.all([
      supabase.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle(),
      supabase.from('mtmcopy_connections').select(CONNECTION_FIELDS).eq('user_id', userId).order('created_at', { ascending: true }),
    ])
    if (pErr || !profile) {
      return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })
    }
    const connList = connections ?? []
    const statsMap = await loadStatsMap(connList.map((c) => c.id))
    const enrichedList = includeBalances
      ? await enrichConnectionsWithMetrics(connList)
      : connList
    if (includeBalances) persistDiscoveredBaselines(connList, enrichedList as never[])
    const connection = enrichedList.find((c) => c.is_active) ?? enrichedList[0] ?? null
    const stats = connection ? statsMap.get(connection.id) ?? null : null
    const metrics = connection ? pickMetrics(connection) : null
    return NextResponse.json({
      users: [{ profile, connection, connections: enrichedList, stats, metrics }],
      total: 1,
      limit: 1,
      offset: 0,
    })
  }

  let profileQuery = supabase
    .from('profiles')
    .select(PROFILE_FIELDS, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (q.length >= 2) {
    const pattern = `%${q}%`
    profileQuery = profileQuery.or(
      `email.ilike.${pattern},username.ilike.${pattern},full_name.ilike.${pattern}`,
    )
  }

  if (filter === 'members') {
    profileQuery = profileQuery.in('user_type', ['member', 'vip', 'affiliate'])
  }

  const { data: profiles, error: profilesError, count } = await profileQuery.range(
    offset,
    offset + limit - 1,
  )

  if (profilesError) {
    console.error('[admin/mtmcopy/users] GET profiles:', profilesError)
    return NextResponse.json({ error: 'Erro ao carregar utilizadores' }, { status: 500 })
  }

  const userIds = (profiles ?? []).map((p) => p.id)
  if (!userIds.length) {
    return NextResponse.json({ users: [], total: count ?? 0, limit, offset })
  }

  const { data: connections } = await supabase
    .from('mtmcopy_connections')
    .select(CONNECTION_FIELDS)
    .in('user_id', userIds)

  const connByUser = new Map<string, (typeof connections)[0][]>()
  for (const c of connections ?? []) {
    const list = connByUser.get(c.user_id) ?? []
    list.push(c)
    connByUser.set(c.user_id, list)
  }
  const connectionIds = (connections ?? []).map((c) => c.id)
  const statsMap = await loadStatsMap(connectionIds)

  const balanceTargets = includeBalances
    ? (connections ?? []).filter((c) => c.metaapi_account_id && c.mt5_status === 'connected').slice(0, 80)
    : []
  const metricsById = new Map<string, ReturnType<typeof pickMetrics>>()
  if (balanceTargets.length) {
    const enriched = await enrichConnectionsWithMetrics(balanceTargets)
    persistDiscoveredBaselines(balanceTargets as never[], enriched as never[])
    for (const c of enriched) {
      metricsById.set(c.id as string, pickMetrics(c))
    }
  }

  let rows = (profiles ?? []).map((profile) => {
    const connList = connByUser.get(profile.id) ?? []
    const connection = connList.find((c) => c.is_active) ?? connList[0] ?? null
    const connectionMetrics = connection ? metricsById.get(connection.id) ?? null : null
    const connectionsWithMetrics = connList.map((c) => ({
      ...c,
      ...(metricsById.get(c.id) ?? {}),
    }))
    return {
      profile,
      connection: connection
        ? { ...connection, ...(metricsById.get(connection.id) ?? {}) }
        : null,
      connections: connectionsWithMetrics,
      stats: connection ? statsMap.get(connection.id) ?? null : null,
      metrics: connectionMetrics,
    }
  })

  if (filter === 'with_connection') {
    rows = rows.filter((r) => r.connection)
  } else if (filter === 'without_connection') {
    rows = rows.filter((r) => !r.connection)
  } else if (filter === 'active_copy') {
    rows = rows.filter((r) => r.connection?.is_active)
  } else if (filter === 'pending') {
    rows = rows.filter(
      (r) =>
        r.connection &&
        (r.connection.telegram_status === 'pending' || r.connection.mt5_status === 'pending'),
    )
  } else if (filter === 'error') {
    rows = rows.filter(
      (r) =>
        r.connection &&
        (r.connection.telegram_status === 'error' || r.connection.mt5_status === 'error'),
    )
  }

  return NextResponse.json({
    users: rows,
    total: count ?? rows.length,
    limit,
    offset,
  })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const { user_id } = body as { user_id?: string }

  if (!user_id) {
    return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', user_id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })
  }

  const { data: existing } = await supabase
    .from('mtmcopy_connections')
    .select('id')
    .eq('user_id', user_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Utilizador já tem ligação MTMcopier', connection_id: existing.id }, { status: 409 })
  }

  const defaults = {
    user_id,
    telegram_status: 'pending' as const,
    mt5_status: 'pending' as const,
    lot_mode: 'fixed',
    lot_value: 0.01,
    copy_sl: true,
    copy_tp: true,
    auto_trailing_stop: false,
    trailing_stop_points: 200,
    reverse_signals: false,
    is_active: false,
    updated_at: new Date().toISOString(),
  }

  const { data: connection, error } = await supabase
    .from('mtmcopy_connections')
    .insert(defaults)
    .select(CONNECTION_FIELDS)
    .single()

  if (error) {
    console.error('[admin/mtmcopy/users] POST:', error)
    return NextResponse.json({ error: 'Erro ao criar ligação' }, { status: 500 })
  }

  return NextResponse.json({ success: true, connection, profile })
}

// Auto-preenche baseline_balance quando é null mas já temos saldo live — assim a % de
// crescimento passa a aparecer para contas reconectadas (o baseline nunca foi gravado).
// Fire-and-forget (não bloqueia a resposta).
function persistDiscoveredBaselines(
  originals: Array<{ id?: string; baseline_balance?: number | null }>,
  enriched: Array<{ id?: string; account_balance?: number | null }>,
) {
  const balById = new Map(enriched.map((e) => [e.id, e.account_balance]))
  for (const c of originals) {
    if (!c.id || c.baseline_balance != null) continue
    const bal = Number(balById.get(c.id))
    if (Number.isFinite(bal) && bal > 0) {
      void supabase
        .from('mtmcopy_connections')
        .update({ baseline_balance: bal, updated_at: new Date().toISOString() })
        .eq('id', c.id)
    }
  }
}

async function loadConnectionStats(connectionId: string) {
  const map = await loadStatsMap([connectionId])
  return map.get(connectionId) ?? null
}

async function loadStatsMap(connectionIds: string[]) {
  const map = new Map<string, { executed_total: number; executed_today: number; last_status: string | null }>()
  if (!connectionIds.length) return map

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('mtmcopy_signal_log')
    .select('connection_id, status, created_at')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: false })
    .limit(500)

  for (const id of connectionIds) {
    const logs = (data ?? []).filter((l) => l.connection_id === id)
    map.set(id, {
      executed_total: logs.filter((l) => l.status === 'executed').length,
      executed_today: logs.filter(
        (l) => l.status === 'executed' && l.created_at >= start.toISOString(),
      ).length,
      last_status: logs[0]?.status ?? null,
    })
  }
  return map
}

function pickMetrics(conn: {
  account_balance?: number | null
  account_equity?: number | null
  baseline_balance?: number | null
  pnl_amount?: number | null
  pnl_percent?: number | null
}) {
  return {
    account_balance: conn.account_balance ?? null,
    account_equity: conn.account_equity ?? null,
    baseline_balance: conn.baseline_balance ?? null,
    pnl_amount: conn.pnl_amount ?? null,
    pnl_percent: conn.pnl_percent ?? null,
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { attachConnectionBalances } from '@/lib/mtmcopy/connection-balances'
import { computeConnectionMetrics } from '@/lib/mtmcopy/subscriber-metrics'
import { syncConnectionCopyFactory } from '@/lib/mtmcopy/connection-sync'
import { connectionCopyMethod } from '@/lib/mtmcopy/copy-limits'
import { getSubscriberConfiguration } from '@/lib/mtmcopy/copyfactory'
import { getPropFirmPreset, applyPropFirmToConnectionPatch } from '@/lib/mtmcopy/prop-firm-presets'
import type { PropFirmType } from '@/lib/mtmcopy/prop-firm-presets'
import { listOpenPositions, isMetaApiConfigured, getAccountSnapshot } from '@/lib/mtmcopy/metaapi'

const supabase = getSupabaseAdmin()

const CONNECTION_SELECT = '*'

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connection_id')
  const userId = searchParams.get('user_id')

  if (!connectionId && !userId) {
    return NextResponse.json({ error: 'connection_id ou user_id obrigatório' }, { status: 400 })
  }

  let query = supabase.from('mtmcopy_connections').select(CONNECTION_SELECT)
  if (connectionId) query = query.eq('id', connectionId)
  else query = query.eq('user_id', userId!)

  const { data: connections, error } = await connectionId
    ? query.maybeSingle().then((r) => ({ data: r.data ? [r.data] : [], error: r.error }))
    : query.order('created_at', { ascending: true })

  if (error) {
    console.error('[admin/mtmcopy/subscriber] GET:', error)
    return NextResponse.json({ error: 'Erro ao carregar ligação' }, { status: 500 })
  }

  if (!connections?.length) {
    return NextResponse.json({ error: 'Ligação não encontrada' }, { status: 404 })
  }

  const userIds = [...new Set(connections.map((c) => c.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, user_type, member_category, subscription_plan')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const enriched = await attachConnectionBalances(connections)

  const detail = await Promise.all(
    enriched.map(async (conn) => {
      const profile = profileMap.get(conn.user_id)
      const method = connectionCopyMethod(conn)

      let positions: Array<{
        id: string
        symbol: string
        type: string
        volume?: number
        profit?: number
        comment?: string
      }> = []
      let copyFactory: Record<string, unknown> | null = null

      if (isMetaApiConfigured() && conn.metaapi_account_id && conn.mt5_status === 'connected') {
        try {
          const pos = await listOpenPositions(conn.metaapi_account_id)
          positions = pos.map((p) => ({
            id: p.id,
            symbol: p.symbol,
            type: p.type,
            volume: p.volume,
            profit: p.profit,
            comment: p.comment,
          }))
        } catch {
          /* ignore */
        }

        if (conn.copyfactory_subscribed) {
          const cf = await getSubscriberConfiguration(conn.metaapi_account_id)
          if (cf.ok) copyFactory = cf.data ?? null
        }
      }

      const balance = conn.account_balance ?? null
      const equity = conn.account_equity ?? null
      const metrics = computeConnectionMetrics(conn)
      const { pnl_amount: pnlAmount, pnl_percent: pnlPercent, baseline_balance: baseline } = metrics

      const { data: signals } = await supabase
        .from('mtmcopy_signal_log')
        .select('id, symbol, direction, lot, status, detail, created_at')
        .eq('connection_id', conn.id)
        .order('created_at', { ascending: false })
        .limit(20)

      const preset = getPropFirmPreset(conn.prop_firm_type)

      const cfSubs = (copyFactory?.subscriptions as unknown[]) ?? []
      const subscribedStrategyIds = cfSubs
        .map((s) => (s as { strategyId?: string })?.strategyId)
        .filter(Boolean)

      const copyingActive =
        conn.is_active &&
        conn.mt5_status === 'connected' &&
        (method === 'telegram_group' ||
          (method === 'strategy' &&
            conn.copyfactory_subscribed &&
            (!conn.copyfactory_strategy_pick ||
              subscribedStrategyIds.includes(conn.copyfactory_strategy_pick))))

      return {
        connection: conn,
        profile: profile ?? null,
        method,
        preset,
        balance,
        equity,
        baseline_balance: baseline,
        pnl_amount: pnlAmount,
        pnl_percent: pnlPercent,
        positions,
        positions_count: positions.length,
        copyfactory: copyFactory,
        subscribed_strategy_ids: subscribedStrategyIds,
        copying_active: copyingActive,
        recent_signals: signals ?? [],
      }
    }),
  )

  return NextResponse.json({
    subscribers: detail,
    subscriber: detail[0] ?? null,
  })
}

/** PATCH — actualizar parâmetros + opcional re-sync CopyFactory */
export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const {
    connection_id,
    prop_firm_type,
    apply_prop_preset,
    resync_copyfactory,
    baseline_balance,
    copy_as_manual,
    lot_mode,
    lot_value,
    max_risk_percent,
    exit_pct_tp1,
    exit_pct_tp2,
    exit_pct_tp3,
    copy_sl,
    copy_tp,
    copyfactory_strategy_pick,
    is_active,
    auto_trailing_stop,
    trailing_stop_points,
  } = body as Record<string, unknown>

  if (!connection_id || typeof connection_id !== 'string') {
    return NextResponse.json({ error: 'connection_id obrigatório' }, { status: 400 })
  }

  const { data: existing, error: loadErr } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .eq('id', connection_id)
    .single()

  if (loadErr || !existing) {
    return NextResponse.json({ error: 'Ligação não encontrada' }, { status: 404 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (apply_prop_preset === true && prop_firm_type) {
    const type = prop_firm_type as PropFirmType
    if (type !== 'ftmo' && type !== 'fundednext') {
      return NextResponse.json({ error: 'prop_firm_type inválido' }, { status: 400 })
    }
    Object.assign(update, applyPropFirmToConnectionPatch(type))
  } else if (prop_firm_type !== undefined) {
    update.prop_firm_type = prop_firm_type || null
  }

  if (typeof copy_as_manual === 'boolean') update.copy_as_manual = copy_as_manual
  if (baseline_balance !== undefined) {
    update.baseline_balance = baseline_balance != null ? Number(baseline_balance) : null
  }
  if (lot_mode !== undefined) update.lot_mode = lot_mode
  if (lot_value !== undefined) update.lot_value = lot_value
  if (max_risk_percent !== undefined) update.max_risk_percent = max_risk_percent
  // Trailing (lido pelo motor de execução; não precisa de resync CopyFactory)
  if (typeof auto_trailing_stop === 'boolean') update.auto_trailing_stop = auto_trailing_stop
  if (trailing_stop_points !== undefined && trailing_stop_points !== null) {
    const tp = Number(trailing_stop_points)
    if (Number.isFinite(tp) && tp >= 0) update.trailing_stop_points = tp
  }
  if (exit_pct_tp1 != null) update.exit_pct_tp1 = exit_pct_tp1
  if (exit_pct_tp2 != null) update.exit_pct_tp2 = exit_pct_tp2
  if (exit_pct_tp3 != null) update.exit_pct_tp3 = exit_pct_tp3
  if (typeof copy_sl === 'boolean') update.copy_sl = copy_sl
  if (typeof copy_tp === 'boolean') update.copy_tp = copy_tp
  if (copyfactory_strategy_pick !== undefined) {
    update.copyfactory_strategy_pick = String(copyfactory_strategy_pick).trim() || null
  }
  if (typeof is_active === 'boolean') update.is_active = is_active

  const { data: connection, error } = await supabase
    .from('mtmcopy_connections')
    .update(update)
    .eq('id', connection_id)
    .select('*')
    .single()

  if (error) {
    console.error('[admin/mtmcopy/subscriber] PATCH:', error)
    return NextResponse.json({ error: 'Erro ao actualizar' }, { status: 500 })
  }

  let cfSync: { ok: boolean; error?: string } | null = null
  if (resync_copyfactory === true && connection.metaapi_account_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, email')
      .eq('id', connection.user_id)
      .maybeSingle()
    const userLabel =
      profile?.full_name || profile?.username || profile?.email || `MTM-${connection.user_id.slice(0, 8)}`

    cfSync = await syncConnectionCopyFactory(connection, userLabel)
    const patchAfter: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (cfSync.ok) {
      patchAfter.copyfactory_subscribed = true
      patchAfter.last_error = null
      if (connection.baseline_balance == null) {
        const snap = await getAccountSnapshot(connection.metaapi_account_id)
        if (snap?.balance != null) patchAfter.baseline_balance = snap.balance
      }
    } else {
      patchAfter.copyfactory_subscribed = false
      patchAfter.last_error = cfSync.error ?? 'Falha CopyFactory'
    }
    await supabase.from('mtmcopy_connections').update(patchAfter).eq('id', connection_id)
    Object.assign(connection, patchAfter)
  }

  return NextResponse.json({
    success: true,
    connection,
    copyfactory_sync: cfSync,
  })
}

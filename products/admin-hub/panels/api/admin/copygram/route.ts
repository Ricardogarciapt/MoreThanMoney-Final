// /api/admin/copygram — gestão de todas as ligações Copygram (admin only)
// GET  → lista todas as ligações com info do utilizador
// PATCH → atualiza campos de status de uma ligação (telegram_status, mt5_status, last_error, is_active)

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'

const supabaseAdmin = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''
  const status = searchParams.get('status') ?? ''   // 'active' | 'pending' | 'error' | ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabaseAdmin
    .from('mtmcopy_connections')
    .select(`
      id, user_id, telegram_channel, telegram_status, mt5_login, mt5_login_last4,
      mt5_platform, mt5_server, mt5_status, lot_mode, lot_value, max_risk_percent,
      symbols_whitelist, copy_sl, copy_tp, auto_trailing_stop, trailing_stop_points,
      reverse_signals, is_active, last_signal_at,
      last_error, created_at, updated_at, metaapi_account_id, copyfactory_subscribed,
      profiles:user_id ( email, full_name, username )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === 'active') {
    query = query.eq('is_active', true)
  } else if (status === 'pending') {
    query = query.or('telegram_status.eq.pending,mt5_status.eq.pending')
  } else if (status === 'error') {
    query = query.or('telegram_status.eq.error,mt5_status.eq.error')
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[admin/copygram] GET error:', error)
    return NextResponse.json({ error: 'Erro ao carregar ligações' }, { status: 500 })
  }

  // Filtro de texto (email/canal) após fetch se search fornecido
  let filtered = data ?? []
  if (search) {
    const lower = search.toLowerCase()
    filtered = filtered.filter((row: any) =>
      row.profiles?.email?.toLowerCase().includes(lower) ||
      row.profiles?.full_name?.toLowerCase().includes(lower) ||
      row.telegram_channel?.toLowerCase().includes(lower) ||
      row.mt5_server?.toLowerCase().includes(lower)
    )
  }

  return NextResponse.json({ connections: filtered, total: count ?? 0 })
}

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const {
    id,
    telegram_status,
    mt5_status,
    is_active,
    last_error,
    metaapi_account_id,
    telegram_channel,
    mt5_login_last4,
    mt5_server,
    lot_mode,
    lot_value,
    max_risk_percent,
    symbols_whitelist,
    copy_sl,
    copy_tp,
    auto_trailing_stop,
    trailing_stop_points,
    reverse_signals,
    prop_firm_type,
    copy_as_manual,
    baseline_balance,
    exit_pct_tp1,
    exit_pct_tp2,
    exit_pct_tp3,
    copyfactory_strategy_pick,
    copy_method,
  } = body

  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const VALID_STATUS = new Set(['pending', 'connected', 'error', 'disconnected'])
  const update: Record<string, any> = { updated_at: new Date().toISOString() }

  if (telegram_status !== undefined) {
    if (!VALID_STATUS.has(telegram_status)) return NextResponse.json({ error: 'telegram_status inválido' }, { status: 400 })
    update.telegram_status = telegram_status
  }
  if (mt5_status !== undefined) {
    if (!VALID_STATUS.has(mt5_status)) return NextResponse.json({ error: 'mt5_status inválido' }, { status: 400 })
    update.mt5_status = mt5_status
  }
  if (typeof is_active === 'boolean') update.is_active = is_active
  if (last_error !== undefined) update.last_error = last_error || null
  if (metaapi_account_id !== undefined) {
    update.metaapi_account_id = metaapi_account_id || null
    if (metaapi_account_id) {
      try {
        const { checkAccountHealth } = await import('@/lib/mtmcopy/metaapi')
        const health = await checkAccountHealth(metaapi_account_id)
        update.mt5_status = health.ok ? 'connected' : 'error'
        update.last_error = health.ok ? null : health.error ?? 'MetaAPI inacessível'
      } catch {
        update.mt5_status = 'error'
        update.last_error = 'Falha ao verificar MetaAPI'
      }
    }
  }
  if (telegram_channel !== undefined) update.telegram_channel = telegram_channel || null
  if (mt5_login_last4 !== undefined) update.mt5_login_last4 = mt5_login_last4 || null
  if (mt5_server !== undefined) update.mt5_server = mt5_server || null
  if (lot_mode !== undefined) {
    if (!['fixed', 'risk_percent', 'multiplier'].includes(lot_mode)) {
      return NextResponse.json({ error: 'lot_mode inválido' }, { status: 400 })
    }
    update.lot_mode = lot_mode
  }
  if (lot_value !== undefined) update.lot_value = Number(lot_value) || 0.01
  if (max_risk_percent !== undefined) update.max_risk_percent = max_risk_percent ?? null
  if (symbols_whitelist !== undefined) {
    update.symbols_whitelist = Array.isArray(symbols_whitelist) ? symbols_whitelist : null
  }
  if (typeof copy_sl === 'boolean') update.copy_sl = copy_sl
  if (typeof copy_tp === 'boolean') update.copy_tp = copy_tp
  if (typeof auto_trailing_stop === 'boolean') update.auto_trailing_stop = auto_trailing_stop
  if (trailing_stop_points !== undefined) {
    const pts = parseInt(String(trailing_stop_points), 10)
    if (Number.isFinite(pts) && pts > 0) update.trailing_stop_points = pts
  }
  if (typeof reverse_signals === 'boolean') update.reverse_signals = reverse_signals
  if (prop_firm_type !== undefined) {
    update.prop_firm_type =
      prop_firm_type === 'ftmo' || prop_firm_type === 'fundednext' ? prop_firm_type : null
  }
  if (typeof copy_as_manual === 'boolean') update.copy_as_manual = copy_as_manual
  if (baseline_balance !== undefined) {
    update.baseline_balance = baseline_balance != null ? Number(baseline_balance) : null
  }
  if (exit_pct_tp1 != null) update.exit_pct_tp1 = exit_pct_tp1
  if (exit_pct_tp2 != null) update.exit_pct_tp2 = exit_pct_tp2
  if (exit_pct_tp3 != null) update.exit_pct_tp3 = exit_pct_tp3
  if (copyfactory_strategy_pick !== undefined) {
    update.copyfactory_strategy_pick = copyfactory_strategy_pick?.trim() || null
  }
  if (copy_method === 'telegram_group' || copy_method === 'strategy' || copy_method === 'master_slave') {
    update.copy_method = copy_method
  }

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update(update)
    .eq('id', id)
    .select(`
      id, user_id, telegram_channel, telegram_status, mt5_login, mt5_login_last4,
      mt5_platform, mt5_server, mt5_status, lot_mode, lot_value, max_risk_percent,
      symbols_whitelist, copy_sl, copy_tp, auto_trailing_stop, trailing_stop_points,
      reverse_signals, is_active, last_signal_at,
      last_error, created_at, updated_at, metaapi_account_id, copyfactory_subscribed,
      profiles:user_id ( email, full_name, username )
    `)
    .single()

  if (error) {
    console.error('[admin/copygram] PATCH error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar ligação' }, { status: 500 })
  }

  return NextResponse.json({ success: true, connection: data })
}

// /api/admin/copygram — gestão de todas as ligações Copygram (admin only)
// GET  → lista todas as ligações com info do utilizador
// PATCH → atualiza campos de status de uma ligação (telegram_status, mt5_status, last_error, is_active)

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabaseAdmin = getSupabaseAdmin()

async function checkAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single()
  return profile?.user_type === 'admin' ? user : null
}

export async function GET(request: NextRequest) {
  const admin = await checkAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''
  const status = searchParams.get('status') ?? ''   // 'active' | 'pending' | 'error' | ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabaseAdmin
    .from('mtmcopy_connections')
    .select(`
      id, user_id, telegram_channel, telegram_status, mt5_login_last4, mt5_server,
      mt5_status, lot_mode, lot_value, max_risk_percent, symbols_whitelist,
      copy_sl, copy_tp, reverse_signals, is_active, last_signal_at, last_error,
      created_at, updated_at, metaapi_account_id,
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
  const admin = await checkAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { id, telegram_status, mt5_status, is_active, last_error, metaapi_account_id } = body

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
  if (metaapi_account_id !== undefined) update.metaapi_account_id = metaapi_account_id || null

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[admin/copygram] PATCH error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar ligação' }, { status: 500 })
  }

  return NextResponse.json({ success: true, connection: data })
}

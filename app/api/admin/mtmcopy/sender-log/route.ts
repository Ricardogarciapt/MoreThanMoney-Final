import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

const CHANNEL_LABELS: Record<string, string> = {
  'trade-ideas': 'Trade Ideas',
  'premium-signals': 'Premium Signals',
  unknown: 'Desconhecido',
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '80', 10), 200)
  const channel = searchParams.get('channel')
  const status = searchParams.get('status')

  let query = supabase
    .from('mtmcopy_signal_log')
    .select(
      `
      id,
      user_id,
      connection_id,
      channel_key,
      telegram_message_id,
      symbol,
      direction,
      entry,
      sl,
      tp,
      lot,
      status,
      detail,
      raw_message,
      created_at,
      profile:profiles!mtmcopy_signal_log_user_id_fkey(full_name, email),
      connection:mtmcopy_connections!mtmcopy_signal_log_connection_id_fkey(account_role, sender_mode, mt5_login_last4)
    `,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (channel && channel !== 'all') {
    query = query.eq('channel_key', channel)
  }
  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[admin/mtmcopy/sender-log]', error.message)
    return NextResponse.json({ error: 'Erro ao carregar log' }, { status: 500 })
  }

  const entries = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const connection = Array.isArray(row.connection) ? row.connection[0] : row.connection
    const channelKey = row.channel_key as string | null
    return {
      id: row.id,
      channel_key: channelKey,
      channel_label: channelKey ? (CHANNEL_LABELS[channelKey] ?? channelKey) : '—',
      telegram_message_id: row.telegram_message_id,
      symbol: row.symbol,
      direction: row.direction,
      entry: row.entry,
      sl: row.sl,
      tp: row.tp,
      lot: row.lot,
      status: row.status,
      detail: row.detail,
      raw_message: row.raw_message,
      created_at: row.created_at,
      is_provider_log: !row.connection_id,
      user_label: profile?.full_name || profile?.email || (row.connection_id ? 'Membro' : 'Provider MTM'),
      connection_label: connection
        ? `${connection.account_role ?? 'slave'} · ${connection.sender_mode ?? 'telegram'}${connection.mt5_login_last4 ? ` ····${connection.mt5_login_last4}` : ''}`
        : null,
    }
  })

  // Os estados do CICLO DE VIDA (open/closed/discarded) faltavam aqui: as linhas apareciam na
  // lista mas não eram contadas em lado nenhum, e no ecrã saíam sem cor nem ícone.
  const conta = (st: string) => entries.filter((e) => e.status === st).length
  const stats = {
    total: entries.length,
    executed: conta('executed'),
    error: conta('error'),
    skipped: conta('skipped'),
    received: conta('received'),
    open: conta('open'),
    closed: conta('closed'),
    discarded: conta('discarded'),
  }

  return NextResponse.json({ entries, stats })
}

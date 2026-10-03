import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { syncConnectionCopyFactory } from '@/lib/mtmcopy/connection-sync'
import { getAccountSnapshot } from '@/lib/mtmcopy/metaapi'

/**
 * Ajusta o SIZING de uma ligação MTM Copy e RE-SINCRONIZA a subscrição CopyFactory (mesmo fluxo
 * do PATCH /api/admin/mtmcopy/subscriber, mas autenticado por Bearer CRON_SECRET p/ uso operacional).
 * body: { connection_id, lot_mode: 'risk_percent'|'fixed'|'multiplier', lot_value, max_risk_percent? }
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as {
    connection_id?: string
    lot_mode?: string
    lot_value?: number | string
    max_risk_percent?: number | string
  }
  const connectionId = String(b.connection_id || '').trim()
  if (!connectionId) return NextResponse.json({ ok: false, error: 'connection_id em falta' }, { status: 400 })
  if (b.lot_mode && !['risk_percent', 'fixed', 'multiplier'].includes(b.lot_mode)) {
    return NextResponse.json({ ok: false, error: 'lot_mode inválido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.lot_mode !== undefined) update.lot_mode = b.lot_mode
  if (b.lot_value !== undefined) update.lot_value = Number(b.lot_value)
  if (b.max_risk_percent !== undefined) update.max_risk_percent = Number(b.max_risk_percent)

  const { data: connection, error } = await supabase
    .from('mtmcopy_connections')
    .update(update)
    .eq('id', connectionId)
    .select('*')
    .single()
  if (error || !connection) {
    return NextResponse.json({ ok: false, error: error?.message || 'ligação não encontrada' }, { status: 500 })
  }

  // Re-sincroniza a subscrição CopyFactory com o novo sizing.
  let cfSync: { ok: boolean; error?: string } | null = null
  if (connection.metaapi_account_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, email')
      .eq('id', connection.user_id)
      .maybeSingle()
    const userLabel =
      profile?.full_name || profile?.username || profile?.email || `MTM-${String(connection.user_id).slice(0, 8)}`
    cfSync = await syncConnectionCopyFactory(connection, userLabel)
    const patchAfter: Record<string, unknown> = { updated_at: new Date().toISOString() }
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
    await supabase.from('mtmcopy_connections').update(patchAfter).eq('id', connectionId)
  }

  return NextResponse.json({
    ok: true,
    account: connection.account_label,
    lot_mode: update.lot_mode ?? connection.lot_mode,
    lot_value: update.lot_value ?? connection.lot_value,
    copyfactory_sync: cfSync,
  })
}

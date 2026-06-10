import { type NextRequest, NextResponse } from 'next/server'
import { checkAccountHealth, getAccountBalance, isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'

const supabaseAdmin = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  if (!isMetaApiConfigured()) {
    return NextResponse.json({ ok: false, error: 'METAAPI_TOKEN não configurado na Vercel' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const { connection_id, metaapi_account_id } = body as {
    connection_id?: string
    metaapi_account_id?: string
  }

  let accountId = metaapi_account_id?.trim()
  if (!accountId && connection_id) {
    const { data } = await supabaseAdmin
      .from('mtmcopy_connections')
      .select('metaapi_account_id')
      .eq('id', connection_id)
      .single()
    accountId = data?.metaapi_account_id ?? undefined
  }

  if (!accountId) {
    return NextResponse.json({ error: 'metaapi_account_id obrigatório' }, { status: 400 })
  }

  const health = await checkAccountHealth(accountId)
  if (!health.ok) {
    if (connection_id) {
      await supabaseAdmin
        .from('mtmcopy_connections')
        .update({
          mt5_status: 'error',
          last_error: health.error ?? 'Conta MT5 inacessível',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection_id)
    }
    return NextResponse.json({ ok: false, error: health.error })
  }

  const balance = await getAccountBalance(accountId)

  if (connection_id) {
    await supabaseAdmin
      .from('mtmcopy_connections')
      .update({
        metaapi_account_id: accountId,
        mt5_status: 'connected',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection_id)
  }

  return NextResponse.json({
    ok: true,
    balance,
    message: 'Conta MetaAPI ligada e sincronizada com MT5',
  })
}

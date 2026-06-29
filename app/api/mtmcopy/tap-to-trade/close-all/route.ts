import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { listOpenPositions, closePositionById } from '@/lib/mtmcopy/metaapi'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  return error || !user ? null : user
}

/**
 * Emergency stop — fecha TODAS as posições abertas na conta T2T do utilizador
 * (espelha o "Emergency stop (close all)" do PrimeSync). Marca os logs como fechados.
 */
export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id, purpose')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  const withAccount = (conns ?? []).filter((c) => c.metaapi_account_id)
  const conn = withAccount.find((c) => c.purpose === 'tap_to_trade') ?? withAccount[0] ?? null

  if (!conn?.metaapi_account_id) {
    return NextResponse.json({ error: 'Sem conta T2T ligada.', code: 'no_account' }, { status: 400 })
  }

  let positions: { id: string }[] = []
  try {
    positions = (await listOpenPositions(conn.metaapi_account_id)) as { id: string }[]
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha a ler posições.' },
      { status: 502 },
    )
  }

  let closed = 0
  const errors: string[] = []
  for (const p of positions) {
    try {
      await closePositionById(conn.metaapi_account_id, p.id)
      closed++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'erro')
    }
  }

  // Marca os sinais T2T ainda abertos/pendentes deste utilizador como fechados.
  await supabase
    .from('mtmcopy_signal_log')
    .update({ status: 'closed', detail: 'Emergency stop' })
    .eq('user_id', user.id)
    .eq('connection_id', conn.id)
    .in('status', ['open', 'pending'])
    .then(undefined, () => {})

  return NextResponse.json({
    success: true,
    closed,
    total: positions.length,
    errors: errors.length ? errors : undefined,
  })
}

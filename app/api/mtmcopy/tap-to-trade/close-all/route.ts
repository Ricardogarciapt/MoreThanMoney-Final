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
    .select('id, metaapi_account_id, purpose, t2t_enabled')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  const withAccount = (conns ?? []).filter((c) => c.metaapi_account_id)
  // Emergency stop fecha em TODAS as contas T2T do user (fan-out). Retrocompat: se nenhuma marcada,
  // usa a 1ª conta ligada.
  let targets = withAccount.filter((c) => c.purpose === 'tap_to_trade' || c.t2t_enabled === true)
  if (!targets.length && withAccount[0]) targets = [withAccount[0]]

  if (!targets.length) {
    return NextResponse.json({ error: 'Sem conta T2T ligada.', code: 'no_account' }, { status: 400 })
  }

  let closed = 0
  let total = 0
  const errors: string[] = []
  for (const conn of targets) {
    const accId = conn.metaapi_account_id!
    let positions: { id: string }[] = []
    try {
      positions = (await listOpenPositions(accId)) as { id: string }[]
    } catch (e) {
      errors.push(`${accId}: ${e instanceof Error ? e.message : 'falha a ler posições'}`)
      continue
    }
    total += positions.length
    for (const p of positions) {
      try {
        await closePositionById(accId, p.id)
        closed++
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'erro')
      }
    }
    // Marca os sinais T2T ainda abertos/pendentes desta conta como fechados.
    await supabase
      .from('mtmcopy_signal_log')
      .update({ status: 'closed', detail: 'Emergency stop' })
      .eq('user_id', user.id)
      .eq('connection_id', conn.id)
      .in('status', ['open', 'pending'])
      .then(undefined, () => {})
  }

  return NextResponse.json({
    success: true,
    closed,
    total,
    accounts: targets.length,
    errors: errors.length ? errors : undefined,
  })
}

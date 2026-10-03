import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const connectionId = searchParams.get('connection_id')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100)

  if (!userId && !connectionId) {
    return NextResponse.json({ error: 'user_id ou connection_id obrigatório' }, { status: 400 })
  }

  let connId = connectionId
  if (!connId && userId) {
    const { data: conn } = await supabase
      .from('mtmcopy_connections')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    connId = conn?.id
  }

  if (!connId) {
    return NextResponse.json({ signals: [] })
  }

  const { data, error } = await supabase
    .from('mtmcopy_signal_log')
    .select('id, symbol, direction, entry, sl, tp, lot, status, detail, created_at')
    .eq('connection_id', connId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[admin/mtmcopy/signals] GET:', error)
    return NextResponse.json({ error: 'Erro ao carregar sinais' }, { status: 500 })
  }

  return NextResponse.json({ signals: data ?? [], connection_id: connId })
}

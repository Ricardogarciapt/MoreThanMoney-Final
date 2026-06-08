// /api/mtmcopy/signals — histórico de sinais Copygram do utilizador autenticado
// Alimentado pelo microserviço externo via service_role.
// Este endpoint apenas lê (GET) — escrita é da responsabilidade do microserviço.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabaseAdmin = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const { data, error, count } = await supabaseAdmin
    .from('mtmcopy_signal_log')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[mtmcopy/signals] erro:', error)
    return NextResponse.json({ error: 'Erro ao obter histórico' }, { status: 500 })
  }

  return NextResponse.json({ signals: data ?? [], total: count ?? 0 })
}

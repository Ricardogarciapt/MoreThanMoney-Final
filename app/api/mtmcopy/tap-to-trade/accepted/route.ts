import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

const supabase = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  return error || !user ? null : user
}

/**
 * Sinais que ESTE utilizador já aceitou (espelha o /signals/swiped do PrimeSync).
 * Devolve { accepted: { [chat_message_id]: status } } para o feed marcar os cartões.
 */
export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { data } = await supabase
    .from('mtmcopy_signal_log')
    .select('chat_message_id, status, created_at')
    .eq('user_id', user.id)
    .not('chat_message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(400)

  const accepted: Record<string, string> = {}
  for (const r of data ?? []) {
    const id = r.chat_message_id as string | null
    if (id && !(id in accepted)) accepted[id] = (r.status as string) ?? 'open'
  }
  return NextResponse.json({ accepted })
}

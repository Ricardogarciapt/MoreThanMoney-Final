import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Resultado ao vivo dos sinais que estão a correr — pips e percentagem, por mensagem do chat.
 *
 * Devolve o que o MOTOR já calculou (`mtmcopy_signal_tracking.live_*`), não cotações: as contas
 * fazem-se uma vez no servidor em vez de uma vez por app aberta. Não precisa de sessão porque
 * não devolve nada do utilizador — é o desempenho público de um sinal público.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200)

  let q = supabase
    .from('mtmcopy_signal_tracking')
    .select('chat_message_id, status, live_pips, live_pct, peak_pips, exits_done, entry_hit_at')
    .eq('status', 'active')
  if (ids.length) q = q.in('chat_message_id', ids)

  const { data, error } = await q.limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const live: Record<
    string,
    { pips: number | null; pct: number | null; peak: number | null; exits: number; entrou: boolean }
  > = {}
  for (const r of data ?? []) {
    live[r.chat_message_id as string] = {
      pips: r.live_pips as number | null,
      pct: r.live_pct as number | null,
      peak: r.peak_pips as number | null,
      exits: (r.exits_done as number) ?? 0,
      // A entrada já foi tocada — quem aceitar agora entra a outro preço com o stop do início.
      // É o que fecha a janela de aceitação, mesmo quando ainda não houve parcial nenhum.
      entrou: Boolean(r.entry_hit_at),
    }
  }
  return NextResponse.json({ live })
}

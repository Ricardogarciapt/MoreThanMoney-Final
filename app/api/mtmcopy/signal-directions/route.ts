import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * A direção com que cada sinal foi mesmo colocado — por mensagem do chat.
 *
 * Existe porque os clientes (web, iOS, Android) liam a direção do TEXTO e enganavam-se: o rodapé
 * do Premium («…key to long term success») fazia passar por COMPRA um «GOLD SELL SETUP». O
 * servidor sempre soube — `mtmcopy_signal_tracking.direction` é a direção da ordem — e é isso
 * que esta rota devolve, para o cartão deixar de adivinhar.
 *
 * Devolve TODOS os estados (pendente, activo, fechado): o histórico também mostra a etiqueta.
 * Não precisa de sessão, pela mesma razão do `/api/mtmcopy/signal-live`: é a ficha pública de um
 * sinal público, sem nada do utilizador.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 400)

  let q = supabase
    .from('mtmcopy_signal_tracking')
    .select('chat_message_id, direction, symbol')
    .not('direction', 'is', null)
  if (ids.length) {
    q = q.in('chat_message_id', ids)
  } else {
    // Sem lista, a janela é a mesma que as apps carregam (36h de sinais + margem).
    q = q.gte('created_at', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())
  }

  const { data, error } = await q.limit(600)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const directions: Record<string, string> = {}
  const symbols: Record<string, string> = {}
  for (const r of data ?? []) {
    const id = r.chat_message_id as string | null
    const dir = String(r.direction ?? '').toLowerCase()
    if (!id || (dir !== 'buy' && dir !== 'sell')) continue
    directions[id] = dir
    if (r.symbol) symbols[id] = String(r.symbol)
  }
  return NextResponse.json({ directions, symbols })
}

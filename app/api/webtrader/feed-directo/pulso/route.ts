import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { lerRefConta } from '@/lib/webtrader/corretoras/regras'

export const dynamic = 'force-dynamic'

/**
 * O BATIMENTO DO FEED DIRECTO — `POST { ref, fonte, estado }` de 60 em 60 s por cada browser ligado.
 *
 * Serve para o dono ver quem está a ler que conta e por que caminho (tabela webtrader_feed_pulsos).
 * NÃO desliga contas: a MetaApi factura no mínimo 6 h por arranque e as contas slave da cópia têm
 * de ficar deployed — essa política é decisão do dono, não deste endpoint.
 */
export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as { ref?: unknown; fonte?: unknown; estado?: unknown }
  const refTxt = String(b.ref ?? '')
  const ref = lerRefConta(refTxt.split(':')[0], refTxt)
  if (!ref || ref.plataforma === 'mtmfunded') return NextResponse.json({ ok: false, error: 'conta inválida' }, { status: 400 })
  const fonte = b.fonte === 'mtm' ? 'mtm' : 'conta'
  const estado = typeof b.estado === 'string' ? b.estado.slice(0, 40) : null
  const agora = new Date().toISOString()
  try {
    const db = getSupabaseAdmin()
    const { data } = await db.from('webtrader_feed_pulsos').select('pulsos').eq('user_id', userId).eq('ref', refTxt).maybeSingle()
    const { error } = await db.from('webtrader_feed_pulsos').upsert(
      { user_id: userId, ref: refTxt, plataforma: ref.plataforma, fonte, estado, pulsos: (Number(data?.pulsos) || 0) + 1, ultimo_pulso: agora },
      { onConflict: 'user_id,ref' },
    )
    if (error && !/does not exist|schema cache/i.test(error.message)) console.error('[feed-directo/pulso]', error.message)
  } catch (e) {
    console.error('[feed-directo/pulso]', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { LIMITE_DIA, pedidoParaRelay, validarResultado, type PedidoGrupo } from '@/lib/telegram/grupos-novos'

export const dynamic = 'force-dynamic'

/**
 * Os grupos e canais que o gmi-relay deve criar com a sessão pessoal (Gestão → Telegram → Grupos
 * novos). Mesmo segredo do relay-post (CRON_SECRET).
 *   GET  → reserva os pendentes (passam a `a_criar`) e devolve-os. Um pedido reservado nunca volta
 *          a sair daqui: se o relay cair a meio, fica `a_criar` e o dono vê-o no painel, em vez de
 *          se criar o mesmo grupo duas vezes.
 *   POST → o resultado de um pedido: { id, ok, chat_id, convite, erro }.
 */
const TABELA = 'telegram_grupos_novos'

function autorizado(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  // O relay diz quantos ainda pode criar hoje; só esses se reservam.
  const max = Math.max(0, Math.min(LIMITE_DIA, Number(req.nextUrl.searchParams.get('max') ?? LIMITE_DIA) || 0))
  if (!max) return NextResponse.json({ ok: true, pedidos: [] })
  const db = getSupabaseAdmin()
  const { data, error } = await db.from(TABELA).select('id').eq('estado', 'pendente').order('criado_em').limit(max)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ ok: true, pedidos: [] })
  const { data: reservados, error: e2 } = await db
    .from(TABELA)
    .update({ estado: 'a_criar', tratado_em: new Date().toISOString() })
    .in('id', data.map((p) => p.id))
    .eq('estado', 'pendente')
    .select('*')
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
  return NextResponse.json({ ok: true, pedidos: (reservados as PedidoGrupo[]).map(pedidoParaRelay) })
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const v = validarResultado(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ ok: false, error: v.erro }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from(TABELA)
    .update({ estado: v.estado, chat_id: v.chat_id, convite: v.convite, erro: v.erro, tratado_em: new Date().toISOString() })
    .eq('id', v.id)
    .eq('estado', 'a_criar')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

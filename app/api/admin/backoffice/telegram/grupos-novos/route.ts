import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { LIMITE_DIA, contaParaLimite, validarPedido, type PedidoGrupo } from '@/lib/telegram/grupos-novos'

export const dynamic = 'force-dynamic'

/**
 * GESTÃO → TELEGRAM → GRUPOS NOVOS: pedir, listar e cancelar grupos e canais a criar pela sessão
 * pessoal (o gmi-relay da VPS cria-os em até 2 min). Ver lib/telegram/grupos-novos.ts.
 * PATCH aprova um rascunho do assistente de IA (passa a pendente, se houver lugar no limite).
 */
const TABELA = 'telegram_grupos_novos'

export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const { data, error } = await getSupabaseAdmin().from(TABELA).select('*').order('criado_em', { ascending: false }).limit(30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const pedidos = data as PedidoGrupo[]
  return NextResponse.json({ pedidos, usadosHoje: contaParaLimite(pedidos), limite: LIMITE_DIA })
}

export async function POST(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const v = validarPedido(await request.json().catch(() => ({})))
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  const db = getSupabaseAdmin()
  const cheio = await limiteCheio(db)
  if (cheio) return cheio
  const { data, error } = await db.from(TABELA).insert({ ...v.pedido, criado_por: g.userId }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ pedido: data })
}

export async function PATCH(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const id = String(((await request.json().catch(() => ({}))) as { id?: string }).id ?? '')
  const db = getSupabaseAdmin()
  const cheio = await limiteCheio(db)
  if (cheio) return cheio
  // criado_em passa a agora: o limite conta a partir da aprovação, não de quando a IA propôs.
  const { data, error } = await db
    .from(TABELA)
    .update({ estado: 'pendente', criado_em: new Date().toISOString(), criado_por: g.userId })
    .eq('id', id)
    .eq('estado', 'rascunho')
    .select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Esse rascunho já foi tratado.' }, { status: 409 })
  return NextResponse.json({ pedido: data[0] })
}

async function limiteCheio(db: ReturnType<typeof getSupabaseAdmin>) {
  const desde = new Date(Date.now() - 86_400_000).toISOString()
  const { data: recentes, error } = await db.from(TABELA).select('estado, criado_em').gte('criado_em', desde)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (contaParaLimite(recentes ?? []) < LIMITE_DIA) return null
  return NextResponse.json({ error: `Já pediste ${LIMITE_DIA} nas últimas 24 h. A Telegram limita contas pessoais que criam grupos em série, e com a tua caíam os relays.` }, { status: 429 })
}

/** Só se cancela um rascunho, o que o relay ainda não apanhou, ou o que ficou preso em `a_criar`. */
export async function DELETE(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const { data, error } = await getSupabaseAdmin()
    .from(TABELA)
    .update({ estado: 'cancelado', tratado_em: new Date().toISOString() })
    .eq('id', id)
    .in('estado', ['rascunho', 'pendente', 'a_criar'])
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Esse pedido já foi tratado.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

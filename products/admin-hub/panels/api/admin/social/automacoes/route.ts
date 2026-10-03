import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { listarAutomacoes } from '@/lib/automacoes'

export const dynamic = 'force-dynamic'

/** As automações próprias — ver `lib/automacoes.ts` para o que são e porque existem. */

async function ehAdmin(request: NextRequest): Promise<boolean> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const db = getSupabaseAdmin()
  const { data } = await db.auth.getUser(token)
  if (!data.user) return false
  const { data: p } = await db.from('profiles').select('user_type').eq('id', data.user.id).maybeSingle()
  return p?.user_type === 'admin'
}

export async function GET(request: NextRequest) {
  if (!(await ehAdmin(request))) return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  return NextResponse.json({ ok: true, automacoes: await listarAutomacoes() })
}

export async function POST(request: NextRequest) {
  if (!(await ehAdmin(request))) return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

  if (!b.nome || !b.canal || !b.gatilho) {
    return NextResponse.json({ error: 'Faltam nome, canal e gatilho' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin().from('mtm_automacoes').insert({
    nome: String(b.nome).slice(0, 120),
    canal: b.canal,
    gatilho: b.gatilho,
    valor: b.valor ? String(b.valor).slice(0, 80) : null,
    alvo_media_id: b.alvoMediaId ? String(b.alvoMediaId) : null,
    resposta_tipo: b.respostaTipo ?? 'texto',
    resposta: b.resposta ?? null,
    seguimento: b.seguimento ?? null,
    funil_id: b.funilId ?? null,
    no_id: b.noId ?? null,
    // Nasce DESLIGADA de propósito: uma automação que começa a responder no instante em que é
    // criada não dá a ninguém a hipótese de a ler primeiro.
    ativa: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, automacoes: await listarAutomacoes() })
}

export async function PATCH(request: NextRequest) {
  if (!(await ehAdmin(request))) return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!b.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [chave, coluna] of Object.entries({
    nome: 'nome', valor: 'valor', respostaTipo: 'resposta_tipo', resposta: 'resposta',
    seguimento: 'seguimento', ativa: 'ativa', funilId: 'funil_id', noId: 'no_id',
    alvoMediaId: 'alvo_media_id', gatilho: 'gatilho', canal: 'canal',
  })) {
    if (chave in b) patch[coluna] = b[chave]
  }

  const { error } = await getSupabaseAdmin().from('mtm_automacoes').update(patch).eq('id', String(b.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, automacoes: await listarAutomacoes() })
}

export async function DELETE(request: NextRequest) {
  if (!(await ehAdmin(request))) return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  await getSupabaseAdmin().from('mtm_automacoes').delete().eq('id', id)
  return NextResponse.json({ ok: true, automacoes: await listarAutomacoes() })
}

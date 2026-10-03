import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { listarLinks, linkDoDia, escolherDoDia, diaAbsoluto } from '@/lib/broker-links'

export const dynamic = 'force-dynamic'

/** O painel também aceita o segredo do cron — é assim que o VPS de vendas escreve na pool. */
async function autorizar(req: NextRequest): Promise<NextResponse | null> {
  const segredo = process.env.CRON_SECRET
  if (segredo && (req.headers.get('authorization') || '') === `Bearer ${segredo}`) return null
  return requireAdmin(req)
}

/** A pool, quem é o link de hoje, e a previsão dos próximos dias. */
export async function GET(req: NextRequest) {
  const negado = await autorizar(req)
  if (negado) return negado

  const links = await listarLinks()
  const ativos = links.filter((l) => l.ativo)
  const hoje = await linkDoDia()

  // A previsão existe para a rotação ser VERIFICÁVEL antes de acontecer: quem entra no painel
  // vê de quem é o dia de amanhã, e uma repartição injusta salta à vista sem ser preciso esperar.
  const d = diaAbsoluto()
  const proximos = Array.from({ length: 7 }, (_, i) => {
    const escolhido = escolherDoDia(ativos, d + i)
    return {
      dia: new Date((d + i) * 86_400_000).toISOString().slice(0, 10),
      etiqueta: escolhido?.etiqueta ?? 'Casa',
    }
  })

  return NextResponse.json({ ok: true, links, hoje, proximos })
}

/** Cria, edita ou apaga um link da pool. */
export async function POST(req: NextRequest) {
  const negado = await autorizar(req)
  if (negado) return negado

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()
  const acao = String(b.acao ?? 'criar')

  if (acao === 'apagar') {
    if (!b.id) return NextResponse.json({ ok: false, error: 'id em falta' }, { status: 400 })
    const { error } = await db.from('broker_referral_links').delete().eq('id', String(b.id))
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const url = String(b.url ?? '').trim()
  // Só http(s). Este link é colado em mensagens que saem em nome da casa — um `javascript:` ou um
  // esquema estranho aqui é um problema de segurança de quem clica, não uma gralha nossa.
  if (acao !== 'editar' && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: 'URL tem de começar por http(s)://' }, { status: 400 })
  }

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.etiqueta != null) campos.etiqueta = String(b.etiqueta).trim().slice(0, 80)
  if (b.url != null && /^https?:\/\//i.test(String(b.url).trim())) campos.url = String(b.url).trim()
  if (b.peso != null) campos.peso = Math.max(1, Math.min(20, Math.floor(Number(b.peso)) || 1))
  if (b.ativo != null) campos.ativo = Boolean(b.ativo)
  if (b.notas != null) campos.notas = String(b.notas).slice(0, 500) || null

  if (acao === 'editar') {
    if (!b.id) return NextResponse.json({ ok: false, error: 'id em falta' }, { status: 400 })
    const { error } = await db.from('broker_referral_links').update(campos).eq('id', String(b.id))
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!campos.etiqueta) return NextResponse.json({ ok: false, error: 'Falta a etiqueta (de quem é o link)' }, { status: 400 })
  const { error } = await db.from('broker_referral_links').insert({ ...campos, url })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireSuperAdmin } from '@/lib/super-admin'

export const dynamic = 'force-dynamic'

/**
 * Gostos dos reels para contacto MANUAL (painel do Ricardo, /ricardogarcia/gostos.html).
 *
 * Só o super admin. Não envia nada ao Instagram: o botão do painel abre o perfil ou a DM e aqui
 * fica apenas o estado do CRM (novo → contactado → respondeu, ou sem interesse).
 * Quem já comentou um post (ig_leads) é tratado pelo setter e sai desta lista.
 */

const ESTADOS = ['novo', 'contactado', 'respondeu', 'sem_interesse']

export async function GET(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const db = getSupabaseAdmin()
  const [gostos, comentarios] = await Promise.all([
    db.from('ig_gostos').select('id, media_code, media_url, utilizador, nome, estado, recolhido_em, estado_em')
      .order('recolhido_em', { ascending: false }).limit(20000),
    db.from('ig_leads').select('commenter').limit(50000),
  ])
  if (gostos.error) return NextResponse.json({ ok: false, erro: gostos.error.message }, { status: 500 })
  const jaComentou = new Set((comentarios.data ?? []).map((c: any) => String(c.commenter ?? '').replace(/^@/, '').toLowerCase()))
  const porReel = new Map<string, any>()
  let escondidos = 0
  for (const g of (gostos.data ?? []) as any[]) {
    if (jaComentou.has(String(g.utilizador).toLowerCase())) { escondidos++; continue }
    let r = porReel.get(g.media_code)
    if (!r) {
      r = { media_code: g.media_code, media_url: g.media_url, total: 0, novo: 0, contactado: 0, respondeu: 0, sem_interesse: 0, pessoas: [] }
      porReel.set(g.media_code, r)
    }
    r.total++
    r[g.estado] = (r[g.estado] ?? 0) + 1
    r.pessoas.push({ id: g.id, utilizador: g.utilizador, nome: g.nome, estado: g.estado, estado_em: g.estado_em })
  }
  return NextResponse.json({ ok: true, reels: [...porReel.values()], escondidos_ja_comentaram: escondidos })
}

export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  let b: any = {}
  try { b = await req.json() } catch {}
  const id = Number(b?.id)
  const estado = String(b?.estado ?? '')
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, erro: 'id inválido' }, { status: 400 })
  if (!ESTADOS.includes(estado)) return NextResponse.json({ ok: false, erro: 'estado inválido' }, { status: 400 })
  const { error } = await getSupabaseAdmin().from('ig_gostos')
    .update({ estado, estado_em: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

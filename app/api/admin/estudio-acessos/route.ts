/**
 * ACESSOS AO ESTÚDIO — quem, sem ser admin, entra no /estudio e em que separadores
 * (gravar, criar, ativos, editor, cortes). Tabela `estudio_acessos` (migração 248).
 *
 *   GET                          → as pessoas com acesso
 *   POST { email, areas[] }      → dar/mudar (areas vazio = tirar)
 *
 * Só o dono. Quem mexeu fica gravado (`definido_por`). As áreas válidas são `AREAS_ESTUDIO`; uma
 * chave desconhecida é deitada fora antes de gravar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { normalizarAreas } from '@/lib/estudio/acesso'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  const db = getSupabaseAdmin()
  const { data, error } = await db.from('estudio_acessos').select('user_id, areas, atualizado_em, nota').order('atualizado_em', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (data ?? []).map((l) => l.user_id as string)
  const { data: perfis } = ids.length
    ? await db.from('profiles').select('id, email, full_name, username').in('id', ids)
    : { data: [] as Array<Record<string, unknown>> }
  const p = new Map((perfis ?? []).map((x) => [x.id as string, x]))
  return NextResponse.json({
    pessoas: (data ?? [])
      .map((l) => ({
        user_id: l.user_id,
        email: (p.get(l.user_id as string)?.email as string) ?? null,
        nome: (p.get(l.user_id as string)?.full_name as string) ?? (p.get(l.user_id as string)?.username as string) ?? null,
        areas: normalizarAreas(l.areas),
        atualizado_em: l.atualizado_em,
        nota: l.nota,
      }))
      .filter((x) => x.areas.length),
  })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  const corpo = (await request.json().catch(() => ({}))) as { email?: string; userId?: string; areas?: unknown; nota?: string }
  const db = getSupabaseAdmin()

  let userId = typeof corpo.userId === 'string' ? corpo.userId : null
  if (!userId) {
    const email = String(corpo.email ?? '').trim().toLowerCase()
    if (!email.includes('@')) return NextResponse.json({ error: 'Indica o email da pessoa.' }, { status: 400 })
    const { data: perfil } = await db.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (!perfil) return NextResponse.json({ error: 'Não há nenhuma conta com esse email. A pessoa tem de se registar primeiro.' }, { status: 404 })
    userId = perfil.id as string
  }

  const areas = normalizarAreas(corpo.areas)
  const { error } = await db.from('estudio_acessos').upsert({
    user_id: userId,
    areas,
    definido_por: auth.userId,
    atualizado_em: new Date().toISOString(),
    nota: typeof corpo.nota === 'string' ? corpo.nota.slice(0, 300) : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, userId, areas })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireSuperAdmin } from '@/lib/super-admin'

export const dynamic = 'force-dynamic'

// Colecções do MTMOS (as mesmas que o artefacto usava). Só o super admin lê e escreve.
const COLS = new Set(['tarefas', 'briefings', 'ideias', 'guioes', 'ordens'])
const okCol = (c: unknown): c is string => typeof c === 'string' && COLS.has(c)

export async function GET(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const col = req.nextUrl.searchParams.get('col')
  if (!okCol(col)) return NextResponse.json({ error: 'colecção inválida' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().from('mtmos_docs').select('id, data').eq('col', col).limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docs: data ?? [] })
}

export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const b = await req.json().catch(() => null) as { op?: string; col?: string; id?: string; data?: Record<string, unknown> } | null
  if (!b || !okCol(b.col)) return NextResponse.json({ error: 'colecção inválida' }, { status: 400 })
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()
  const dados = b.data && typeof b.data === 'object' ? b.data : {}
  if (b.op === 'add') {
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    const { error } = await db.from('mtmos_docs').insert({ col: b.col, id, data: dados, atualizado: agora })
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ id })
  }
  const id = String(b.id ?? '').slice(0, 120)
  if (!id) return NextResponse.json({ error: 'id em falta' }, { status: 400 })
  if (b.op === 'delete') {
    const { error } = await db.from('mtmos_docs').delete().eq('col', b.col).eq('id', id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  if (b.op === 'set' || b.op === 'update') {
    let final = dados
    if (b.op === 'update') {
      const { data: atual } = await db.from('mtmos_docs').select('data').eq('col', b.col).eq('id', id).maybeSingle()
      if (!atual) return NextResponse.json({ error: 'documento não existe' }, { status: 404 })
      final = { ...(atual.data as Record<string, unknown>), ...dados }
    }
    const { error } = await db.from('mtmos_docs').upsert({ col: b.col, id, data: final, atualizado: agora })
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'operação inválida' }, { status: 400 })
}

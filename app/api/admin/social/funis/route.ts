import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { FUNIS_BASE, guardarFunis, lerFunis, type Funil } from '@/lib/funis'

export const dynamic = 'force-dynamic'

/** O desenho dos funis. Ver `lib/funis.ts` para o que isto é — e para o que não é. */

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
  if (!(await ehAdmin(request))) {
    return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  }
  return NextResponse.json({ ok: true, funis: await lerFunis() })
}

export async function PUT(request: NextRequest) {
  if (!(await ehAdmin(request))) {
    return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  }
  const corpo = (await request.json().catch(() => ({}))) as { funis?: Funil[]; repor?: boolean }

  // Repor devolve ao desenho que o CÓDIGO faz hoje — não a uma cópia antiga do desenho.
  const funis = corpo.repor ? FUNIS_BASE : corpo.funis
  if (!Array.isArray(funis)) return NextResponse.json({ error: 'Faltam os funis' }, { status: 400 })

  const r = await guardarFunis(funis)
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 500 })
  return NextResponse.json({ ok: true, funis: await lerFunis() })
}

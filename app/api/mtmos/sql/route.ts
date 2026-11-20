import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireSuperAdmin } from '@/lib/super-admin'

export const dynamic = 'force-dynamic'

// Consultas só de leitura do MTMOS (KPIs, B2B, perguntas do Jarvis). A função na base de dados
// recusa tudo o que não seja SELECT/WITH; aqui só o super admin chega.
export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const b = await req.json().catch(() => null) as { query?: string } | null
  const q = String(b?.query ?? '').trim().slice(0, 8000)
  if (!/^(select|with)\s/i.test(q)) return NextResponse.json({ error: 'só leitura (SELECT/WITH)' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().rpc('mtmos_sql_leitura', { q })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ linhas: data ?? [] })
}

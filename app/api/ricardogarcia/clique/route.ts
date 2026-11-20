import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { checkRateLimit } from '@/lib/admin-api-helpers'

export const dynamic = 'force-dynamic'
const TIPOS = ['link', 'produto', 'contacto', 'visita', 'video']

// Conta visitas e cliques da página do Ricardo (sendBeacon). Nada pessoal: só o alvo, o tipo e a origem.
export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  if (!checkRateLimit('rg-clique:' + ip, 60, 60_000).allowed) return new NextResponse(null, { status: 204 })
  let b: any = {}
  try { b = JSON.parse(await req.text()) } catch {}
  const alvo = String(b?.alvo ?? '').replace(/[^a-z0-9_:-]/gi, '').slice(0, 80)
  const tipo = TIPOS.includes(b?.tipo) ? b.tipo : 'link'
  const origem = String(b?.origem ?? '').replace(/[^\w.:/-]/g, '').slice(0, 120) || null
  if (alvo) await getSupabaseAdmin().from('rg_cliques').insert({ alvo, tipo, origem })
  return new NextResponse(null, { status: 204 })
}

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { vigiarPrazos } from '@/lib/suporte/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * OS PRAZOS DO APOIO — 15 minutos e depois 1 hora.
 *
 * Uma conversa que fica à espera de uma pessoa (escalada ao Ricardo, ou cliente que pediu pessoa,
 * ou IA em baixo) tem prazo. Passado o prazo, o dono recebe um aviso no Telegram com o link para
 * responder. Corre de 5 em 5 min e sai logo quando não há nada em atraso (uma consulta indexada).
 * Só avisa: não responde, não fecha, não reembolsa.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await vigiarPrazos(getSupabaseAdmin())
  return NextResponse.json({ ok: true, ...r })
}

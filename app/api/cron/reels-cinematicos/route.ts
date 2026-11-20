import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { pedirDoDia } from '@/lib/estudio/reels-cinematicos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Pedido diário dos reels cinemáticos (ver lib/estudio/reels-cinematicos.ts). Chamado pelo robô
 * .github/workflows/reels-cinematicos.yml antes de montar. Idempotente no mesmo dia. Nada publica.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await pedirDoDia(getSupabaseAdmin()))
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

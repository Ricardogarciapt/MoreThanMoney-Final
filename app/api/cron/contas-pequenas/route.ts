import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import { vigiarContasPequenas } from '@/lib/copia-contas/servidor/contas-pequenas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Hora a hora: contas em «lote mínimo até saldo» (mestres_contas.conta_pequena_ate) que já
 * passaram o limiar → aviso ao admin no Telegram, uma vez. Ver lib/copia-contas/servidor/contas-pequenas.ts.
 * `?ensaio=1` diz quem seria avisado sem escrever nem avisar.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  try {
    const r = await vigiarContasPequenas(db, (t) => avisarAdmin(db, t), { ensaio })
    return NextResponse.json({ ok: true, ensaio, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

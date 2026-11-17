import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import { lerResultadosDasCopias, textoDoResumo } from '@/lib/copia-contas/servidor/resultados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Diário (07:15 UTC): lê o fecho real das cópias MT5 (deals MetaApi, só leitura), grava em
 * `copia_resultados` ao lado da mestre e manda o resumo em pips ao admin no Telegram.
 * `?ensaio=1` não grava nem avisa · `?horas=N` muda a janela (omissão 48, máx. 336).
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const horas = Number(req.nextUrl.searchParams.get('horas')) || 48
  try {
    const r = await lerResultadosDasCopias(db, { horas, ensaio })
    if (!ensaio) await avisarAdmin(db, textoDoResumo(r, horas)).catch(() => undefined)
    return NextResponse.json({ ok: true, ensaio, horas, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

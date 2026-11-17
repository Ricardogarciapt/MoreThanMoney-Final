import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import { lerResultadosDasCopias, textoDasOrfas, textoDoResumo } from '@/lib/copia-contas/servidor/resultados'
import { auditarCopiasComIA } from '@/lib/copia-contas/servidor/auditor-ia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Diário (07:15 UTC): lê o fecho real das cópias MT5 (deals MetaApi, só leitura), grava em
 * `copia_resultados` ao lado da mestre e manda o resumo em pips ao admin no Telegram.
 * `?ensaio=1` não grava nem avisa · `?horas=N` muda a janela (omissão 48, máx. 336).
 * `?vigia=1` (de hora a hora): janela de 3 h e Telegram SÓ se houver cópias órfãs (abertas na
 * corretora com a mestre fechada). O diário junta o auditor IA (lib/copia-contas/servidor/auditor-ia).
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const vigia = req.nextUrl.searchParams.get('vigia') === '1'
  const horas = Number(req.nextUrl.searchParams.get('horas')) || (vigia ? 3 : 48)
  try {
    const r = await lerResultadosDasCopias(db, { horas, ensaio })
    let auditor: string | null = null
    if (vigia) {
      const t = textoDasOrfas(r)
      if (t && !ensaio) await avisarAdmin(db, t).catch(() => undefined)
    } else {
      auditor = await auditarCopiasComIA(db).catch(() => null)
      if (!ensaio) await avisarAdmin(db, [textoDoResumo(r, horas), auditor].filter(Boolean).join('\n\n')).catch(() => undefined)
    }
    return NextResponse.json({ ok: true, ensaio, vigia, horas, ...r, auditor })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

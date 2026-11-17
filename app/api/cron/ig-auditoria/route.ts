/**
 * Cron diário: auditoria das publicações do @morethanmoney.pt (lib/instagram/auditoria.ts).
 * Guarda em site_settings.ig_auditoria_mtm a lista do que fica (50) e do que arquivar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { auditarInstagram } from '@/lib/instagram/auditoria'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await auditarInstagram()) })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

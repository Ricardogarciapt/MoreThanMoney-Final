import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { correrLote } from '@/lib/b2b/envio'

/**
 * Cron DIÁRIO da prospeção B2B (dias úteis). Envia até ao tecto do dia (por omissão 20, no total),
 * com intervalo entre envios, pelo transporte de email do site. Desligado em
 * `site_settings.b2b_prospeccao.ligado` → não envia nada. `?ensaio=1` decide sem enviar.
 * Bearer CRON_SECRET (ou x-vercel-cron).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const lim = req.nextUrl.searchParams.get('limite')
  try {
    const r = await correrLote(getSupabaseAdmin(), { ensaio, limiteExtra: lim != null ? Number(lim) : undefined })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { processarCandidatos } from '@/lib/b2b/candidatos'

/**
 * Cron da RECOLHA B2B (16/11): pega nos candidatos pendentes (`b2b_candidatos`), lê a página pública
 * de cada um e passa os emails de empresa para `b2b_prospectos`. Corre antes do envio
 * (/api/cron/b2b-prospeccao, 10:30 UTC), duas vezes, para encher a lista do dia sem ninguém clicar.
 * Bearer CRON_SECRET (ou x-vercel-cron). `?limite=` (até 30).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const lim = Number(req.nextUrl.searchParams.get('limite')) || 15
  try {
    const r = await processarCandidatos(getSupabaseAdmin(), lim)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

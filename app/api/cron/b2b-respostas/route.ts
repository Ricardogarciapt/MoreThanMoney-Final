import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { processarRespostas } from '@/lib/b2b/respostas-caixa'

/**
 * Cron das RESPOSTAS da prospeção B2B (17/11). Lê a caixa de envio por IMAP (só leitura), marca
 * quem respondeu, exclui quem pediu para sair ou cujo email foi devolvido, e avisa o dono. À
 * segunda-feira manda também o resumo da semana anterior (Telegram + `site_settings.b2b_respostas.resumo`,
 * que o MTMOS lê). `?ensaio=1` decide sem gravar nem avisar. Bearer CRON_SECRET (ou x-vercel-cron).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await processarRespostas(getSupabaseAdmin(), { ensaio: req.nextUrl.searchParams.get('ensaio') === '1' })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

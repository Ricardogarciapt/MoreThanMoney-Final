import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { correrExecutor } from '@/lib/vendas/executor-pipeline'
import { correrRecrutamentoThreads } from '@/lib/threads/ciclo'

/**
 * Cron do EXECUTOR DO PIPELINE (10/11/2026) — rascunha os seguimentos (Telegram + email), passa-os
 * pela regra legal e envia só o que tem base (consentimento / soft opt-in), e sobe a «contactado»
 * os negócios a quem saiu mensagem. Não depende do Mac. Interruptor: site_settings.pipeline_executor.
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
  const db = getSupabaseAdmin()
  const r = await correrExecutor(db)
  // Recrutamento no Threads vai à boleia (tecto de 100 crons). Uma falha lá não estraga o executor.
  const threads = await correrRecrutamentoThreads(db).catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : String(e) }))
  return NextResponse.json({ ...r, threads })
}

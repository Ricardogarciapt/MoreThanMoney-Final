import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { correrExecutor } from '@/lib/vendas/executor-pipeline'

/**
 * Cron do EXECUTOR DO PIPELINE (10/11/2026) — rascunha os seguimentos (Telegram + email), passa-os
 * pela regra legal e envia só o que tem base (consentimento / soft opt-in), e sobe a «contactado»
 * os negócios a quem saiu mensagem. Não depende do Mac. Interruptor: site_settings.pipeline_executor.
 * Bearer CRON_SECRET (ou x-vercel-cron).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const r = await correrExecutor(getSupabaseAdmin())
  return NextResponse.json(r)
}

import { NextRequest, NextResponse } from 'next/server'
import { runLeadFollowups } from '@/lib/telegram-lead-followup'

/**
 * Cron do FOLLOW-UP de leads mornos no Telegram (reativação Cardone/Worre/Daniel G).
 * Bearer CRON_SECRET (ou x-vercel-cron). Correr a cada ~2h.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const r = await runLeadFollowups()
  return NextResponse.json(r)
}

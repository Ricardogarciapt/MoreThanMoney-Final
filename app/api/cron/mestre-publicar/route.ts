import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { publicarTodasAsMestres } from '@/lib/mestres/servidor/publicar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O chat e o Telegram das estratégias com a mestre em live contam o que a CONTA-MESTRE fez
 * (entradas em falta, parciais, break-even, fecho) — ver lib/mestres/servidor/publicar.ts.
 * Idempotente; corre de minuto a minuto (vercel.json) e pode ser chamado por um gatilho da base.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const resumo = await publicarTodasAsMestres()
  return NextResponse.json({ ok: true, resumo, timestamp: new Date().toISOString() })
}

export async function POST(request: NextRequest) {
  return GET(request)
}

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { publicarTodasAsMestres } from '@/lib/mestres/servidor/publicar'
import { vigiaNaVps } from '@/lib/vigias/delegacao'
import { espelharCanaisParaTelegram } from '@/lib/telegram-espelho-canal'

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
  // Espelho chat → Telegram (03/11: «MTM Auto Premium II»). Corre SEMPRE aqui, antes do desvio para
  // o VPS: o bundle do mtm-vigias não o tem, e o minuto da Vercel já é chamado de qualquer forma.
  const espelho = await espelharCanaisParaTelegram().catch(() => [])
  // Corre no VPS (mtm-vigias) enquanto o pulso estiver fresco — aqui só sai.
  if (await vigiaNaVps('mestre-publicar')) return NextResponse.json({ ok: true, vps: true, espelho })
  const resumo = await publicarTodasAsMestres()
  return NextResponse.json({ ok: true, resumo, espelho, timestamp: new Date().toISOString() })
}

export async function POST(request: NextRequest) {
  return GET(request)
}

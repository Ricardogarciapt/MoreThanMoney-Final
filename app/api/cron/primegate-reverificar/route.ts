import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { reverificarPendentes } from '@/lib/primegate/verificacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * De hora a hora: volta a verificar no PrimeGate os registos «a confirmar» cuja hora chegou
 * (backoff 1h → 6h → 24h, máx. 5) e, no fim das tentativas, avisa o admin UMA vez por par.
 * Nunca recusa ninguém. Sem chave configurada não faz nada.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await reverificarPendentes(8)
  return NextResponse.json({ ok: true, ...r })
}

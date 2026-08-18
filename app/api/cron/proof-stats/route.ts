import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { computeProofStats, getProofStats } from '@/lib/proof-stats'

/**
 * CRON diário: recalcula a PROVA SOCIAL a partir das contas mestre reais e grava em
 * site_settings.proof_stats. É a fonte que o funil (posts/emails/ManyChat/cartões) lê — antes os
 * números estavam hardcoded e ficavam congelados. Se não houver dados suficientes, mantém o snapshot
 * anterior (nunca degrada nem inventa a prova).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await computeProofStats()
  const current = await getProofStats()
  return NextResponse.json({ success: true, updated: r.ok, reason: r.reason, stats: r.stats ?? current })
}

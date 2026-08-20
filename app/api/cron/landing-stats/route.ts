import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { computeLandingStats } from '@/lib/landing-stats'

/**
 * CRON SEMANAL (segunda, 06:00): recalcula os números públicos da landing a partir da BD e grava em
 * site_settings.landing_stats. Sem ele, os totais na página ficam congelados no snapshot em código.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await computeLandingStats()
  return NextResponse.json({ success: r.ok, reason: r.reason, stats: r.stats })
}

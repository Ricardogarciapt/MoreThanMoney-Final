import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runPremiumZoneMonitor } from '@/lib/mtmcopy/premium-zone-monitor'

/**
 * CRON: monitor de ENTRADA POR ZONA + REAÇÃO do Premium.
 * Expira/cancela pendentes e dispara entradas nos gatilhos C (reconfirmação) e B (toque).
 * Default DESLIGADO (config mtmcopy_premium_zone.mode = 'off'). Corre a cada 1 min.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runPremiumZoneMonitor()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runPremiumPriceMonitor } from '@/lib/mtmcopy/premium-price-monitor'

/**
 * CRON: monitor de preço Premium — fecha parciais/BE/trailing por PREÇO.
 * Default DESLIGADO (exec-switch premium_price_monitor). Corre a cada 1 min.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runPremiumPriceMonitor()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}

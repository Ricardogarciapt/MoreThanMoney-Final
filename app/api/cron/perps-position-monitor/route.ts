import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runPerpsPositionMonitor } from '@/lib/mtmcopy/perps-position-monitor'

/**
 * CRON: monitor de POSIÇÃO dos Perpétuos (Bybit) — acompanha a posição-mestre e publica o ciclo de
 * vida (Entry Hit → parcial → BE → fecho c/ resultado) no chat + Telegram dos perps. Só NOTIFICA
 * (saídas já nativas na Bybit). Switch perps_position_monitor (default ON). Correr a cada ~poucos s
 * (loop VPS) para acompanhamento em tempo real, à imagem do premium-price-monitor.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runPerpsPositionMonitor()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}

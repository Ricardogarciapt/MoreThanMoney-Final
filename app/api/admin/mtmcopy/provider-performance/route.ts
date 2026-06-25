import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getProviderStrategyMetrics } from '@/lib/mtmcopy/provider-metrics'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Desempenho das contas Provider (estratégias MTMcopy) — só admin. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  try {
    const data = await getProviderStrategyMetrics()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro a obter desempenho'
    return NextResponse.json({ configured: false, providers: [], error: message }, { status: 500 })
  }
}

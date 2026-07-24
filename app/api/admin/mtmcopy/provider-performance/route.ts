import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getProviderStrategyMetrics, type ProviderStrategyMetrics } from '@/lib/mtmcopy/provider-metrics'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Conta-mestre Bybit (perps) como provider. A Bybit exige edge/fra1 (geo-bloqueio) — esta
 * rota é node/iad1, por isso vai buscar as métricas à rota edge interna /api/bybit/metrics.
 */
async function fetchBybitProvider(origin: string): Promise<ProviderStrategyMetrics | null> {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  try {
    const res = await fetch(`${origin}/api/bybit/metrics`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const m = (await res.json()) as {
      ok?: boolean; equity?: number | null; profit?: number | null; trades?: number
      wonTrades?: number; lostTrades?: number; winRatePct?: number | null; profitFactor?: number | null; windowDays?: number
    }
    if (m.ok === false && m.equity == null) return null
    return {
      key: 'bybit-perps',
      strategyId: 'bybit',
      accountId: 'bybit-master',
      label: 'Bybit Perps · Aurum Flow',
      description: `Conta-mestre Copy Trading Bybit — perpétuos cripto (últimos ${m.windowDays ?? 30}d)`,
      region: 'Bybit',
      state: null,
      connectionStatus: 'CONNECTED',
      online: true,
      balance: m.equity ?? null,
      equity: m.equity ?? null,
      profit: m.profit ?? null,
      gainPct: null,
      maxDrawdownPct: null,
      profitFactor: m.profitFactor ?? null,
      trades: m.trades ?? null,
      wonTrades: m.wonTrades ?? null,
      lostTrades: m.lostTrades ?? null,
      winRatePct: m.winRatePct ?? null,
      subscribers: 0,
      hasMetaStats: true,
    }
  } catch {
    return null
  }
}

/** Desempenho das contas Provider (estratégias MTMcopy + Bybit perps) — só admin. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  try {
    const data = await getProviderStrategyMetrics()
    const bybit = await fetchBybitProvider(new URL(request.url).origin)
    if (bybit) {
      data.providers.push(bybit)
      data.configured = true // mostra o painel mesmo se a MetaAPI não estiver configurada
    }
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro a obter desempenho'
    return NextResponse.json({ configured: false, providers: [], error: message }, { status: 500 })
  }
}

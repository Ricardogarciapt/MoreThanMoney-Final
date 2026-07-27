import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { getProviderStrategyMetrics, type ProviderStrategyMetrics } from '@/lib/mtmcopy/provider-metrics'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Desempenho das estratégias Provider — versão PÚBLICA (membro autenticado).
 * Mostra o desempenho das estratégias ativas na página /mtmcopy/metrics (como antes).
 * Sanitizado: esconde saldo/equity absolutos da conta-mestre; mantém win rate, profit,
 * profit factor, gain% e nº de trades (a prova social relevante para quem vai copiar).
 */

async function authenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null
  const { data: { user } } = await getSupabaseAdmin().auth.getUser(token)
  return user ?? null
}

/** Conta-mestre Bybit (perps) — métricas via rota edge interna (geo-bloqueio). */
async function fetchBybitProvider(origin: string): Promise<ProviderStrategyMetrics | null> {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`${origin}/api/bybit/metrics`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: ctrl.signal,
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
      description: `Perpétuos cripto (últimos ${m.windowDays ?? 30}d)`,
      region: 'Bybit',
      state: null,
      connectionStatus: 'CONNECTED',
      online: true,
      balance: null,
      equity: null,
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
  } finally {
    clearTimeout(timer)
  }
}

/** Remove saldo/equity absolutos (privacidade da conta-mestre); mantém o desempenho. */
function sanitize(p: ProviderStrategyMetrics): ProviderStrategyMetrics {
  return { ...p, balance: null, equity: null, subscribers: 0 }
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request)
  if (!user) return NextResponse.json({ configured: false, providers: [], error: 'unauthorized' }, { status: 401 })

  try {
    const [data, bybit] = await Promise.all([
      getProviderStrategyMetrics(),
      fetchBybitProvider(new URL(request.url).origin),
    ])
    const providers = data.providers.map(sanitize)
    if (bybit) {
      providers.push(bybit)
    }
    return NextResponse.json({ ...data, providers, configured: data.configured || Boolean(bybit) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro a obter desempenho'
    return NextResponse.json({ configured: false, providers: [], error: message }, { status: 500 })
  }
}

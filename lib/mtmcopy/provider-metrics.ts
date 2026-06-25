/**
 * MTM Auto — métricas de desempenho das contas Provider (estratégias MTMcopy).
 *
 * Fonte principal: MetaStats da MetaAPI (`/users/current/accounts/{id}/metrics`),
 * que devolve saldo, equity, lucro, ganho %, drawdown máx, win rate, nº de trades
 * e profit factor de cada conta mestre. Complementado com o estado da conta e o
 * nº de subscritores CopyFactory (de `fetchMetaApiOverview`).
 *
 * Sem ligação RPC pesada — só REST (rápido e fiável em Vercel). Fallback ao
 * snapshot (saldo/equity) só quando o MetaStats não responde.
 */

import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_SENSEI_STRATEGY_ID,
  MTM_COPY_STRATEGY_CATALOG,
} from './provider-constants'
import { fetchMetaApiOverview } from './metaapi-admin'
import { getAccountSnapshot } from './metaapi'

export type ProviderKey = 'premium' | 'trade-ideas' | 'sensei'

export interface ProviderStrategyMetrics {
  key: ProviderKey
  strategyId: string
  accountId: string
  label: string
  description: string
  region: string | null
  state: string | null
  connectionStatus: string | null
  online: boolean
  /** Métricas de desempenho (MetaStats) */
  balance: number | null
  equity: number | null
  profit: number | null
  gainPct: number | null
  maxDrawdownPct: number | null
  profitFactor: number | null
  trades: number | null
  wonTrades: number | null
  lostTrades: number | null
  winRatePct: number | null
  /** Subscritores CopyFactory ligados a esta estratégia */
  subscribers: number
  hasMetaStats: boolean
  error?: string
}

export interface ProviderPerformancePayload {
  configured: boolean
  providers: ProviderStrategyMetrics[]
  fetchedAt: string
}

interface ProviderDef {
  key: ProviderKey
  accountId: string
  strategyId: string
}

const PROVIDERS: ProviderDef[] = [
  { key: 'premium', accountId: CANONICAL_PREMIUM_ACCOUNT_ID, strategyId: CANONICAL_PREMIUM_STRATEGY_ID },
  { key: 'trade-ideas', accountId: CANONICAL_TRADE_IDEAS_ACCOUNT_ID, strategyId: CANONICAL_TRADE_IDEAS_STRATEGY_ID },
  { key: 'sensei', accountId: CANONICAL_SENSEI_ACCOUNT_ID, strategyId: CANONICAL_SENSEI_STRATEGY_ID },
]

function token(): string | null {
  return process.env.METAAPI_TOKEN?.trim() || null
}

function metastatsBase(region: string | null): string {
  const r = (region || process.env.METAAPI_REGION || 'new-york').trim()
  const tpl = process.env.METAAPI_METASTATS_URL
  if (tpl) return tpl.includes('{region}') ? tpl.replace('{region}', r) : tpl
  return `https://metastats-api-v1.${r}.agiliumtrade.ai`
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Vai buscar o objeto `metrics` do MetaStats (ou null se indisponível). */
async function fetchMetaStats(
  accountId: string,
  region: string | null,
): Promise<Record<string, unknown> | null> {
  const t = token()
  if (!t) return null
  try {
    const res = await fetch(
      `${metastatsBase(region)}/users/current/accounts/${accountId}/metrics`,
      { headers: { Accept: 'application/json', 'auth-token': t } },
    )
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { metrics?: Record<string, unknown> } | null
    return data?.metrics ?? null
  } catch {
    return null
  }
}

/**
 * Métricas de desempenho das 3 estratégias MTM (contas Provider).
 * Admin-only — chamar só de rotas protegidas por `requireAdmin`.
 */
export async function getProviderStrategyMetrics(): Promise<ProviderPerformancePayload> {
  const fetchedAt = new Date().toISOString()

  if (!token()) {
    return { configured: false, providers: [], fetchedAt }
  }

  const overview = await fetchMetaApiOverview().catch(() => null)

  const accountById = new Map(
    (overview?.accounts ?? []).map((a) => [a.id, a] as const),
  )

  function subscriberCount(strategyId: string): number {
    const subs = overview?.subscribers ?? []
    return subs.filter((s) => s.subscriptions.some((sub) => sub.strategyId === strategyId)).length
  }

  const providers = await Promise.all(
    PROVIDERS.map(async (def): Promise<ProviderStrategyMetrics> => {
      const catalog = MTM_COPY_STRATEGY_CATALOG[def.strategyId]
      const acc = accountById.get(def.accountId) ?? null
      const region = acc?.region ?? null
      const state = acc?.state ?? null
      const connectionStatus = acc?.connectionStatus ?? null
      const online = connectionStatus === 'CONNECTED' || state === 'DEPLOYED'

      const base: ProviderStrategyMetrics = {
        key: def.key,
        strategyId: def.strategyId,
        accountId: def.accountId,
        label: catalog?.publicLabel ?? 'Estratégia MTM',
        description: catalog?.description ?? '',
        region,
        state,
        connectionStatus,
        online,
        balance: null,
        equity: null,
        profit: null,
        gainPct: null,
        maxDrawdownPct: null,
        profitFactor: null,
        trades: null,
        wonTrades: null,
        lostTrades: null,
        winRatePct: null,
        subscribers: subscriberCount(def.strategyId),
        hasMetaStats: false,
      }

      const m = await fetchMetaStats(def.accountId, region)
      if (m) {
        base.hasMetaStats = true
        base.balance = num(m.balance)
        base.equity = num(m.equity)
        base.profit = num(m.profit)
        base.gainPct = num(m.gain)
        base.maxDrawdownPct = num(m.maxDrawdown)
        base.profitFactor = num(m.profitFactor)
        base.trades = num(m.trades)
        base.wonTrades = num(m.wonTrades)
        base.lostTrades = num(m.lostTrades)
        base.winRatePct = num(m.wonTradesPercent)
      } else {
        // Fallback leve: só saldo/equity via snapshot (uma tentativa).
        const snap = await getAccountSnapshot(def.accountId).catch(() => null)
        if (snap) {
          base.balance = snap.balance
          base.equity = snap.equity
        } else if (online) {
          base.error = 'MetaStats indisponível'
        } else {
          base.error = 'Conta offline'
        }
      }

      return base
    }),
  )

  return { configured: true, providers, fetchedAt }
}

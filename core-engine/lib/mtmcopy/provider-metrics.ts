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
  CANONICAL_PREMIUM_STRATEGY_ID,
  CANONICAL_COPYTRADER_RG_ACCOUNT_ID,
  CANONICAL_COPYTRADER_RG_STRATEGY_ID,
  MTM_COPY_STRATEGY_CATALOG,
} from './provider-constants'
import { fetchMetaApiOverview } from './metaapi-admin'
import { getAccountSnapshot } from './metaapi'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type ProviderKey =
  | 'premium'
  | 'trade-ideas'
  | 'sensei'
  | 'goldkiller'
  | 'booster'
  | 'bybit-perps'
  | 'copytrader-rg'

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
  // As rotas de Trade Ideas, Sensei, GoldKiller, Booster e Gold Did foram APAGADAS a
  // 2026-08-20: as contas provider delas já não existiam na MetaApi (404) e cada leitura era
  // um pedido a falhar. Recriam-se pelo admin (Adicionar rota) quando houver contas novas.
  { key: 'premium', accountId: CANONICAL_PREMIUM_ACCOUNT_ID, strategyId: CANONICAL_PREMIUM_STRATEGY_ID },
  // Copy Trader Ricardo Garcia — a intermédia 0f38257a foi apagada na MetaApi (15/09): a constante é
  // null e a entrada sai da lista (MetaStats a uma conta inexistente = NotFoundError a cada leitura).
  ...(CANONICAL_COPYTRADER_RG_ACCOUNT_ID
    ? [{ key: 'copytrader-rg' as ProviderKey, accountId: CANONICAL_COPYTRADER_RG_ACCOUNT_ID, strategyId: CANONICAL_COPYTRADER_RG_STRATEGY_ID }]
    : []),
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

/** Resolve o valor da promise ou `fallback` se demorar mais de `ms` (não bloqueia a rota). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

/** Vai buscar o objeto `metrics` do MetaStats (ou null se indisponível). Timeout 8s. */
async function fetchMetaStats(
  accountId: string,
  region: string | null,
): Promise<Record<string, unknown> | null> {
  const t = token()
  if (!t) return null
  const { contaInexistente } = await import('./metaapi-inexistentes')
  if (await contaInexistente(accountId)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${metastatsBase(region)}/users/current/accounts/${accountId}/metrics`,
      { headers: { Accept: 'application/json', 'auth-token': t }, signal: ctrl.signal },
    )
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { metrics?: Record<string, unknown> } | null
    return data?.metrics ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * CACHE DE 24 H DO METASTATS, por conta provider, em `site_settings`.
 *
 * Porquê: esta função corre em cada abertura da página pública /mtmcopy/metrics (e no briefing).
 * O MetaStats é um pedido pago por conta, e os números que devolve (win rate, profit factor, nº de
 * trades acumulados) mudam devagar — lê-los a cada visita era pagar a mesma resposta muitas vezes.
 *
 * Guarda-se na base e não na memória porque as funções serverless arrancam a frio muitas vezes e
 * a memória não sobreviveria às 24 h. Só se guardam leituras BEM SUCEDIDAS: uma falha não fica
 * «presa» um dia inteiro — na visita seguinte tenta-se de novo.
 *
 * O relatório diário (`accounts-daily-report.ts`) lê o MetaStats diretamente e não passa por aqui.
 */
const CHAVE_CACHE_METASTATS = 'mtmcopy_metastats_cache'
export const TTL_METASTATS_MS = 24 * 60 * 60 * 1000

type CacheMetaStats = Record<string, { metrics: Record<string, unknown>; lidoEm: string }>

/** A entrada guardada ainda serve? Pura, para teste. */
export function metaStatsGuardadoValido(
  entrada: { lidoEm?: string } | null | undefined,
  agora: number = Date.now(),
  ttlMs: number = TTL_METASTATS_MS,
): boolean {
  if (!entrada?.lidoEm) return false
  const t = Date.parse(entrada.lidoEm)
  return Number.isFinite(t) && agora - t >= 0 && agora - t < ttlMs
}

async function lerCacheMetaStats(): Promise<CacheMetaStats> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_CACHE_METASTATS).maybeSingle()
    // Há chaves de site_settings guardadas como texto JSON — aceita-se as duas formas.
    const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
    return v && typeof v === 'object' ? (v as CacheMetaStats) : {}
  } catch {
    return {}
  }
}

async function gravarCacheMetaStats(cache: CacheMetaStats): Promise<void> {
  try {
    await getSupabaseAdmin().from('site_settings').upsert(
      {
        key: CHAVE_CACHE_METASTATS,
        value: cache as unknown as Record<string, unknown>,
        description: 'Cache 24h do MetaStats das contas provider (poupa créditos MetaApi)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch {
    /* sem gravação a próxima visita relê ao vivo — nada se perde */
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

  const [overview, cacheMetaStats] = await Promise.all([
    fetchMetaApiOverview().catch(() => null),
    lerCacheMetaStats(),
  ])
  let cacheMudou = false

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

      const guardado = cacheMetaStats[def.accountId]
      let m: Record<string, unknown> | null = null
      if (metaStatsGuardadoValido(guardado)) {
        m = guardado.metrics
      } else {
        m = await fetchMetaStats(def.accountId, region)
        if (m) {
          cacheMetaStats[def.accountId] = { metrics: m, lidoEm: new Date().toISOString() }
          cacheMudou = true
        }
      }
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
      }
      if (def.key === 'booster') {
        // Booster 20x: capital maioritariamente bónus → percentagens sem significado.
        // Pedido do Ricardo (2026-07-22): mostrar 0 nas percentagens desta conta.
        base.gainPct = 0
        base.maxDrawdownPct = 0
        base.winRatePct = 0
      }
      if (!m) {
        // Fallback leve: só saldo/equity via snapshot. LIMITADO a 8s — sem isto, uma
        // ligação RPC MetaApi que espera 55s (waitConnected) por conta estoura os 60s da
        // rota → 504 em todo o painel. Melhor mostrar "MetaStats indisponível" que pendurar.
        const snap = await withTimeout(getAccountSnapshot(def.accountId).catch(() => null), 8000, null)
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

  // Uma só escrita no fim (e não uma por conta em paralelo, que se pisariam umas às outras).
  if (cacheMudou) await gravarCacheMetaStats(cacheMetaStats)

  return { configured: true, providers, fetchedAt }
}

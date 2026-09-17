/**
 * TERMINAL MTM — leituras de preço (servidor).
 *
 * Fonte principal: `funded_precos`, o streaming PU Prime que o motor do VPS escreve e o WebTrader
 * já lê — é o mesmo instrumento dos gráficos OANDA/PU Prime. Cripto: Binance (o gráfico é Binance).
 * Metais sem tick da corretora: perpétuo Binance (segue o spot) e gold-api.com (spot). Yahoo só
 * como último recurso — e nunca futuros para o ouro. Nada aqui usa a MetaApi.
 *
 * Todas as leituras têm timeout curto e cache em memória por instância: a rota /live é chamada a
 * cada 3 s por quem tem a página aberta (e tem s-maxage no CDN), por isso a base de dados vê no
 * máximo ~1 leitura por símbolo a cada 2 s, e as APIs externas bem menos.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { referencePlan, type ReferenceInstrument, type TerminalAsset } from "@/lib/mtm-terminal-assets"
import {
  candidateKey,
  chooseQuote,
  computeChangePercent,
  quoteSourcePlan,
  type LiveQuote,
  type QuoteCandidate,
  type QuoteSourceKind,
  type ReferenceChange,
} from "@/lib/mtm-terminal-live"

/** Forma guardada em mtm_terminal_daily.quote */
export type TerminalQuote = LiveQuote

const TIMEOUT_MS = 4_000

async function getJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const r = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** Cache em memória por instância, com pedidos em curso partilhados. */
const memo = new Map<string, { at: number; value: unknown; pending?: Promise<unknown> }>()
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  const now = Date.now()
  if (hit && !hit.pending && now - hit.at < ttlMs) return hit.value as T
  if (hit?.pending) return hit.pending as Promise<T>
  const pending = load()
    .then((value) => {
      memo.set(key, { at: Date.now(), value })
      return value
    })
    .catch((e) => {
      memo.delete(key)
      throw e
    })
  memo.set(key, { at: hit?.at ?? 0, value: hit?.value, pending })
  return pending
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : null
}

// ─── Corretora (funded_precos) ────────────────────────────────────────────────
export async function fetchBrokerTick(symbol: string): Promise<QuoteCandidate | null> {
  return cached(`broker:${symbol}`, 1_000, async () => {
    try {
      const { data } = await getSupabaseAdmin()
        .from("funded_precos")
        .select("bid, ask, em")
        .eq("symbol", symbol)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
        .maybeSingle()
      const bid = num(data?.bid)
      const ask = num(data?.ask)
      const at = data?.em ? new Date(String(data.em)).getTime() : NaN
      if (bid == null || ask == null || !Number.isFinite(at)) return null
      return { price: (bid + ask) / 2, bid, ask, at }
    } catch {
      return null
    }
  })
}

// ─── Binance ──────────────────────────────────────────────────────────────────
// data-api.binance.vision é o espelho só-de-mercado da Binance (não bloqueia regiões dos EUA).
async function binanceSpot24h(pair: string) {
  return cached(`bspot:${pair}`, 1_500, async () => {
    const j =
      ((await getJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${pair}`)) as Record<string, unknown> | null) ??
      ((await getJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`)) as Record<string, unknown> | null)
    const last = num(j?.lastPrice)
    return last != null ? { last, open: num(j?.openPrice), bid: num(j?.bidPrice), ask: num(j?.askPrice) } : null
  })
}

async function binanceFutures24h(pair: string) {
  return cached(`bfut:${pair}`, 1_500, async () => {
    const j = (await getJson(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`)) as Record<string, unknown> | null
    const last = num(j?.lastPrice)
    return last != null ? { last, open: num(j?.openPrice) } : null
  })
}

async function coingeckoSpot(pair: string) {
  return cached(`cg:${pair}`, 30_000, async () => {
    const { fetchCoinGeckoSpotUsd } = await import("@/lib/crypto-usd")
    const r = await fetchCoinGeckoSpotUsd(pair).catch(() => null)
    return r?.price != null ? { price: r.price, change24h: r.change24h ?? null, at: Date.now() } : null
  })
}

async function goldApiSpot(metal: "XAU" | "XAG") {
  return cached(`goldapi:${metal}`, 5_000, async () => {
    const j = (await getJson(`https://api.gold-api.com/price/${metal}`)) as Record<string, unknown> | null
    const price = num(j?.price)
    const at = j?.updatedAt ? new Date(String(j.updatedAt)).getTime() : Date.now()
    return price != null ? { price, at: Number.isFinite(at) ? at : Date.now() } : null
  })
}

// ─── Yahoo ────────────────────────────────────────────────────────────────────
type YahooChart = {
  chart?: { result?: { meta?: Record<string, unknown>; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
}
async function yahooMeta(sym: string) {
  return cached(`ymeta:${sym}`, 30_000, async () => {
    const j = (await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    )) as YahooChart | null
    const res = j?.chart?.result?.[0]
    const meta = res?.meta
    const price = num(meta?.regularMarketPrice)
    if (price == null) return null
    const t = num(meta?.regularMarketTime)
    // Fecho da sessão anterior = penúltimo fecho diário (chartPreviousClose é o fecho ANTES dos 5 dias)
    const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => typeof c === "number")
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : num(meta?.previousClose)
    return { price, at: t != null ? t * 1000 : Date.now(), prevClose }
  })
}

// ─── Referência (variação) ────────────────────────────────────────────────────
async function refChange(ref: ReferenceInstrument): Promise<ReferenceChange | null> {
  const { kind, symbol } = ref
  if (kind === "binance-spot") {
    const b = await binanceSpot24h(symbol)
    if (b) return { base: b.open, last: b.last, basis: "24h", sameLevel: ref.sameLevel }
    const cg = await coingeckoSpot(symbol)
    if (cg?.change24h != null) return { base: cg.price / (1 + cg.change24h / 100), last: cg.price, basis: "24h", sameLevel: ref.sameLevel }
    return null
  }
  if (kind === "binance-futures") {
    const f = await binanceFutures24h(symbol)
    return f ? { base: f.open, last: f.last, basis: "24h", sameLevel: ref.sameLevel } : null
  }
  const y = await yahooMeta(symbol)
  return y ? { base: y.prevClose, last: y.price, basis: "sessão", sameLevel: ref.sameLevel } : null
}

/** Variação pela principal e, se falhar (fapi em iad1), pelas de reserva do ativo. */
export async function fetchReferenceChange(asset: TerminalAsset): Promise<ReferenceChange | null> {
  for (const ref of referencePlan(asset)) {
    const r = await refChange(ref).catch(() => null)
    if (r && r.base != null && r.base > 0) return r
  }
  return null
}

async function loadCandidate(kind: QuoteSourceKind, symbol: string): Promise<QuoteCandidate | null> {
  switch (kind) {
    case "broker":
      return fetchBrokerTick(symbol)
    case "binance-spot": {
      const b = await binanceSpot24h(symbol)
      return b ? { price: b.last, bid: b.bid, ask: b.ask, at: Date.now() } : null
    }
    case "binance-futures": {
      const f = await binanceFutures24h(symbol)
      return f ? { price: f.last, at: Date.now() } : null
    }
    case "coingecko": {
      const c = await coingeckoSpot(symbol)
      return c ? { price: c.price, at: c.at } : null
    }
    case "gold-api": {
      const g = await goldApiSpot(symbol as "XAU" | "XAG")
      return g ? { price: g.price, at: g.at } : null
    }
    case "yahoo": {
      const y = await yahooMeta(symbol)
      return y ? { price: y.price, at: y.at } : null
    }
  }
}

/** Resolve o preço ao vivo pela ordem de quoteSourcePlan(). Só busca o que o plano precisa. */
export async function fetchLiveQuote(asset: TerminalAsset): Promise<LiveQuote> {
  const plan = quoteSourcePlan(asset)
  const candidates: Record<string, QuoteCandidate | null> = {}
  const refPromise = fetchReferenceChange(asset).catch(() => null)

  let chosen: ReturnType<typeof chooseQuote> = null
  for (let i = 0; i < plan.length && !chosen; i++) {
    const key = candidateKey(plan[i].kind, plan[i].symbol)
    if (!(key in candidates)) candidates[key] = await loadCandidate(plan[i].kind, plan[i].symbol).catch(() => null)
    chosen = chooseQuote(plan.slice(0, i + 1), candidates, Date.now())
  }
  const ref = await refPromise

  if (!chosen) {
    return {
      symbol: asset.symbol, price: null, bid: null, ask: null, priceAt: null, source: "sem fonte", sourceKind: null,
      sameLevel: true, changePercent: null, changeBasis: null, currency: "USD",
    }
  }
  const { step, candidate } = chosen
  return {
    symbol: asset.symbol,
    price: candidate.price,
    bid: candidate.bid ?? null,
    ask: candidate.ask ?? null,
    priceAt: new Date(candidate.at).toISOString(),
    source: step.label,
    sourceKind: step.kind,
    sameLevel: step.sameLevel,
    changePercent: computeChangePercent(candidate.price, ref, step.sameLevel && (ref?.sameLevel ?? asset.ref.sameLevel)),
    changeBasis: ref?.basis ?? null,
    currency: "USD",
  }
}

/** Compatibilidade: a análise e o cron chamavam fetchTerminalQuote. */
export const fetchTerminalQuote = (asset: TerminalAsset) => fetchLiveQuote(asset)

/** Bloco de contexto de preço ao vivo para injetar no prompt da IA. */
export function buildLivePriceContext(asset: TerminalAsset, quote: LiveQuote): string {
  if (quote.price == null) {
    return `\n\n[DADOS AO VIVO] Sem preço atual de ${asset.symbol}. Diz isso explicitamente e NÃO indiques níveis de preço.`
  }
  const chg =
    quote.changePercent != null ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% (${quote.changeBasis})` : "n/d"
  return `\n\n[DADOS AO VIVO — ${quote.source}, tick de ${quote.priceAt}]
- Ativo: ${asset.name} (${asset.symbol}, gráfico ${asset.tvSymbol})
- Preço atual: ${quote.price}
- Variação: ${chg}`
}

/**
 * TERMINAL MTM — regras puras do preço ao vivo, da idade da análise e do limite de pedidos.
 *
 * Sem I/O: corre no servidor (rotas) e no browser (página), e é o que os testes verificam.
 * As leituras reais estão em lib/mtm-terminal-quote.ts.
 */
import type { TerminalAsset } from "@/lib/mtm-terminal-assets"

export type QuoteSourceKind = "broker" | "binance-spot" | "binance-futures" | "coingecko" | "gold-api" | "yahoo"

export interface PlanStep {
  kind: QuoteSourceKind
  symbol: string
  /** Idade máxima aceite para este passo (ms). Infinity = aceita qualquer idade. */
  maxAgeMs: number
  /** Nome mostrado ao utilizador */
  label: string
  /** false quando o nível não é o do gráfico (último recurso — o utilizador é avisado) */
  sameLevel: boolean
}

export interface QuoteCandidate {
  price: number
  bid?: number | null
  ask?: number | null
  /** Instante do preço (ms epoch) */
  at: number
}

export interface LiveQuote {
  symbol: string
  price: number | null
  bid: number | null
  ask: number | null
  /** Instante do último tick (ISO) */
  priceAt: string | null
  source: string
  sourceKind: QuoteSourceKind | null
  /** Nível do gráfico? false = aproximação (ex.: futuros) */
  sameLevel: boolean
  changePercent: number | null
  /** "24h" (janela móvel) ou "sessão" (vs fecho anterior) */
  changeBasis: "24h" | "sessão" | null
  currency: string
}

/** Um tick da corretora com mais de 15 s já não conta como «ao vivo» (mercado parado ou motor sem pedido). */
export const BROKER_FRESH_MS = 15_000
/** Preço de uma API externa (Binance/gold-api/Yahoo) com mais de 5 min não serve. */
export const EXTERNAL_FRESH_MS = 5 * 60_000

export const candidateKey = (kind: QuoteSourceKind, symbol: string) => `${kind}:${symbol}`

/**
 * Ordem das fontes por ativo. Princípio: o número tem de bater com o gráfico.
 * · Cripto: Binance spot (é o próprio gráfico) → CoinGecko.
 * · Metais: PU Prime ao vivo → perpétuo Binance (segue o spot) → gold-api (spot) → PU Prime antigo.
 *   NUNCA futuros (GC=F estava ~40 $ acima do spot).
 * · Resto: PU Prime ao vivo → Yahoo se estiver ao mesmo nível → PU Prime antigo → Yahoo (aproximação).
 */
export function quoteSourcePlan(asset: TerminalAsset): PlanStep[] {
  const steps: PlanStep[] = []
  const broker = (maxAgeMs: number): PlanStep | null =>
    asset.brokerSymbol ? { kind: "broker", symbol: asset.brokerSymbol, maxAgeMs, label: "PU Prime", sameLevel: true } : null

  if (asset.type === "crypto") {
    steps.push({ kind: "binance-spot", symbol: asset.ref.symbol, maxAgeMs: EXTERNAL_FRESH_MS, label: "Binance", sameLevel: true })
    steps.push({ kind: "coingecko", symbol: asset.ref.symbol, maxAgeMs: EXTERNAL_FRESH_MS, label: "CoinGecko", sameLevel: true })
    return steps
  }

  const fresh = broker(BROKER_FRESH_MS)
  if (fresh) steps.push(fresh)

  if (asset.metalSpot) {
    if (asset.ref.kind === "binance-futures") {
      steps.push({ kind: "binance-futures", symbol: asset.ref.symbol, maxAgeMs: EXTERNAL_FRESH_MS, label: "Binance (spot-perp)", sameLevel: true })
    }
    steps.push({ kind: "gold-api", symbol: asset.metalSpot, maxAgeMs: EXTERNAL_FRESH_MS, label: "gold-api (spot)", sameLevel: true })
    const stale = broker(Infinity)
    if (stale) steps.push(stale)
    return steps
  }

  if (asset.ref.kind === "yahoo" && asset.ref.sameLevel) {
    steps.push({ kind: "yahoo", symbol: asset.ref.symbol, maxAgeMs: EXTERNAL_FRESH_MS, label: "Yahoo Finance", sameLevel: true })
  }
  const stale = broker(Infinity)
  if (stale) steps.push(stale)
  if (asset.ref.kind === "yahoo") {
    steps.push({ kind: "yahoo", symbol: asset.ref.symbol, maxAgeMs: Infinity, label: `Yahoo ${asset.ref.symbol}`, sameLevel: asset.ref.sameLevel })
  }
  return steps
}

/** Escolhe o primeiro passo do plano com candidato válido e dentro da idade. */
export function chooseQuote(
  plan: PlanStep[],
  candidates: Record<string, QuoteCandidate | null | undefined>,
  now: number,
): { step: PlanStep; candidate: QuoteCandidate } | null {
  for (const step of plan) {
    const c = candidates[candidateKey(step.kind, step.symbol)]
    if (!c || !Number.isFinite(c.price) || c.price <= 0) continue
    if (now - c.at > step.maxAgeMs) continue
    return { step, candidate: c }
  }
  return null
}

export interface ReferenceChange {
  /** Base ao mesmo nível da referência (abertura 24h ou fecho anterior) */
  base: number | null
  /** Preço atual da referência */
  last: number | null
  basis: "24h" | "sessão"
  /** Esta referência está ao nível do gráfico? (as de reserva nunca estão). Omisso = a do ativo. */
  sameLevel?: boolean
}

/**
 * Variação: se a referência está ao nível do preço mostrado, mede o preço ao vivo contra a base;
 * senão usa a % da própria referência (nunca mistura níveis — era o que dava −0,38 % errado).
 */
export function computeChangePercent(price: number | null, ref: ReferenceChange | null, sameLevel: boolean): number | null {
  if (!ref || ref.base == null || !(ref.base > 0)) return null
  if (sameLevel && price != null && price > 0) return ((price - ref.base) / ref.base) * 100
  if (ref.last != null && ref.last > 0) return ((ref.last - ref.base) / ref.base) * 100
  return null
}

/** «há 2 s», «há 3 min», «há 2 h», «há 3 d». */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `há ${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}

// ─── Idade da análise diária ──────────────────────────────────────────────────
export const ANALYSIS_STALE_MS = 24 * 3600_000

export function analysisAgeState(generatedAt: string | null | undefined, now: number): {
  state: "missing" | "fresh" | "stale"
  ageMs: number | null
} {
  if (!generatedAt) return { state: "missing", ageMs: null }
  const t = new Date(generatedAt).getTime()
  if (!Number.isFinite(t)) return { state: "missing", ageMs: null }
  const ageMs = Math.max(0, now - t)
  return { state: ageMs > ANALYSIS_STALE_MS ? "stale" : "fresh", ageMs }
}

// ─── Limite de «Atualizar análise» ────────────────────────────────────────────
export const REFRESH_COOLDOWN_MS = 5 * 60_000

/**
 * 1 geração por ativo a cada 5 min — por utilizador E global (se alguém acabou de gerar o ativo,
 * devolve-se essa análise em vez de pagar outra chamada ao modelo).
 */
export function refreshDecision(opts: {
  lastGeneratedAt: string | null | undefined
  lastUserRequestAt: number | null | undefined
  now: number
  cooldownMs?: number
}): { allowed: true } | { allowed: false; reason: "asset" | "user"; retryAfterS: number } {
  const cd = opts.cooldownMs ?? REFRESH_COOLDOWN_MS
  const gen = opts.lastGeneratedAt ? new Date(opts.lastGeneratedAt).getTime() : NaN
  if (opts.lastUserRequestAt != null && opts.now - opts.lastUserRequestAt < cd) {
    return { allowed: false, reason: "user", retryAfterS: Math.ceil((cd - (opts.now - opts.lastUserRequestAt)) / 1000) }
  }
  if (Number.isFinite(gen) && opts.now - gen < cd) {
    return { allowed: false, reason: "asset", retryAfterS: Math.ceil((cd - (opts.now - gen)) / 1000) }
  }
  return { allowed: true }
}

/** Cron: os N ativos com análise mais antiga (sem análise primeiro) que já passaram o limiar. */
export function pickAssetsToRefresh(
  symbols: string[],
  generatedAtBySymbol: Record<string, string | null | undefined>,
  now: number,
  opts: { batch: number; minAgeMs: number },
): string[] {
  return symbols
    .map((s) => {
      const t = generatedAtBySymbol[s] ? new Date(generatedAtBySymbol[s] as string).getTime() : NaN
      return { s, t: Number.isFinite(t) ? t : -Infinity }
    })
    .filter((x) => now - x.t >= opts.minAgeMs)
    .sort((a, b) => a.t - b.t)
    .slice(0, opts.batch)
    .map((x) => x.s)
}

// ─── Velas: cache e estado mostrado ───────────────────────────────────────────
/** Cabeçalho de cache da rota das velas. Vazio também vai para o CDN (curto) para não martelar as fontes. */
export function candlesCacheHeader(count: number): string {
  return count > 0
    ? "public, max-age=30, s-maxage=60, stale-while-revalidate=120"
    : "public, max-age=0, s-maxage=30, stale-while-revalidate=30"
}

/**
 * O que o bloco «ao vivo» deve mostrar — decidido num sítio só, para não voltar a haver seis cartões
 * com «—» (queixa de 17/09).
 * · live: velas + preço → cartões completos.
 * · levels-only: sem velas mas a análise trouxe níveis → aviso único + suportes/resistências da análise.
 * · waiting-price: há velas mas ainda não há preço → aviso único.
 * · loading: o 1.º pedido de velas ainda não respondeu.
 * · no-candles: nada para mostrar → aviso único, sem cartões.
 */
export type LiveBlockState = "live" | "levels-only" | "waiting-price" | "loading" | "no-candles"
export function liveBlockState(opts: {
  hasTechnicals: boolean
  candlesLoaded: boolean
  candleCount: number
  hasPrice: boolean
  fallbackLevelCount: number
}): LiveBlockState {
  if (opts.hasTechnicals) return "live"
  if (opts.fallbackLevelCount > 0) return "levels-only"
  if (opts.candleCount > 0 && !opts.hasPrice) return "waiting-price"
  if (!opts.candlesLoaded) return "loading"
  return "no-candles"
}

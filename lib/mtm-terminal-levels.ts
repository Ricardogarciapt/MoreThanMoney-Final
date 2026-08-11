/**
 * Níveis técnicos REAIS para o Terminal MTM — suportes/resistências calculados a partir de OHLC
 * diário (não inventados pelo LLM): pivots clássicos do dia anterior, máximos/mínimos de swing
 * recentes, e high/low do dia e semana anteriores. Fontes já usadas no projeto (Binance klines
 * para crypto, Yahoo chart para o resto). Sem variáveis de ambiente novas.
 */
import type { TerminalAsset } from "@/lib/mtm-terminal-assets"

export interface Candle { t: number; o: number; h: number; l: number; c: number }

export interface TerminalLevels {
  supports: number[]
  resistances: number[]
  detail: {
    pivot: number
    priorDay: { h: number; l: number }
    priorWeek: { h: number; l: number }
    swingHighs: number[]
    swingLows: number[]
    asOf: string
  }
}

async function fetchYahooCandles(sym: string, range = "6mo"): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" })
  if (!r.ok) return []
  const data = await r.json().catch(() => null)
  const res = data?.chart?.result?.[0]
  const ts: number[] = res?.timestamp ?? []
  const q = res?.indicators?.quote?.[0] ?? {}
  const out: Candle[] = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
    if ([o, h, l, c].every((v) => typeof v === "number" && Number.isFinite(v))) {
      out.push({ t: ts[i] * 1000, o, h, l, c })
    }
  }
  return out
}

async function fetchBinanceKlines(pair: string, limit = 150): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&limit=${limit}`
  const r = await fetch(url, { cache: "no-store" })
  if (!r.ok) return []
  const data = (await r.json().catch(() => null)) as unknown[]
  if (!Array.isArray(data)) return []
  return data
    .map((k) => {
      const a = k as (string | number)[]
      return { t: Number(a[0]), o: Number(a[1]), h: Number(a[2]), l: Number(a[3]), c: Number(a[4]) }
    })
    .filter((c) => [c.o, c.h, c.l, c.c].every((v) => Number.isFinite(v)))
}

/** OHLC diário recente (mais recente por último). Vazio se a fonte falhar. */
export async function fetchTerminalCandles(asset: TerminalAsset): Promise<Candle[]> {
  try {
    if (asset.priceSource === "binance" || asset.priceSource === "coingecko") {
      const b = await fetchBinanceKlines(asset.priceSymbol, 150)
      if (b.length) return b
      const { fetchCoinGeckoOhlcAsKlines } = await import("@/lib/crypto-usd")
      const k = await fetchCoinGeckoOhlcAsKlines(asset.priceSymbol, 90).catch(() => null)
      return (k ?? []).map(([t, o, h, l, c]) => ({ t, o, h, l, c }))
    }
    return await fetchYahooCandles(asset.priceSymbol, "6mo")
  } catch {
    return []
  }
}

function roundTo(v: number): number {
  const abs = Math.abs(v)
  const dp = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : 5
  return Number(v.toFixed(dp))
}

/** Pivôs de swing locais (janela w para cada lado). */
function swings(candles: Candle[], w = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = []
  const lows: number[] = []
  for (let i = w; i < candles.length - w; i++) {
    const h = candles[i].h
    const l = candles[i].l
    let isH = true
    let isL = true
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue
      if (candles[j].h >= h) isH = false
      if (candles[j].l <= l) isL = false
    }
    if (isH) highs.push(h)
    if (isL) lows.push(l)
  }
  return { highs, lows }
}

/**
 * Suportes/resistências reais à volta do preço atual: junta pivots clássicos (do dia anterior
 * COMPLETO), high/low do dia e semana anteriores, e swings recentes; escolhe os mais próximos
 * (dedup por proximidade >0.2%). Devolve null se não houver dados.
 */
export function computeTerminalLevels(candles: Candle[], price: number): TerminalLevels | null {
  if (!candles.length || !Number.isFinite(price) || price <= 0) return null
  // A última vela pode ser o dia em curso → o "dia anterior completo" é a penúltima.
  const prev = candles.length >= 2 ? candles[candles.length - 2] : candles[candles.length - 1]
  const P = (prev.h + prev.l + prev.c) / 3
  const r1 = 2 * P - prev.l
  const s1 = 2 * P - prev.h
  const r2 = P + (prev.h - prev.l)
  const s2 = P - (prev.h - prev.l)
  const r3 = prev.h + 2 * (P - prev.l)
  const s3 = prev.l - 2 * (prev.h - P)
  const wk = candles.slice(-6, -1) // 5 dias anteriores ao dia em curso
  const priorWeekH = wk.length ? Math.max(...wk.map((c) => c.h)) : prev.h
  const priorWeekL = wk.length ? Math.min(...wk.map((c) => c.l)) : prev.l
  const { highs, lows } = swings(candles.slice(-60), 3)

  const above = [r1, r2, r3, prev.h, priorWeekH, ...highs].filter((v) => Number.isFinite(v) && v > price * 1.0005)
  const below = [s1, s2, s3, prev.l, priorWeekL, ...lows].filter((v) => Number.isFinite(v) && v < price * 0.9995)

  const pickNearest = (arr: number[], ascending: boolean): number[] => {
    const uniq = [...new Set(arr.map(roundTo))]
    uniq.sort((a, b) => Math.abs(a - price) - Math.abs(b - price))
    const picked: number[] = []
    for (const v of uniq) {
      if (picked.every((p) => Math.abs(p - v) / price > 0.002)) picked.push(v)
      if (picked.length >= 3) break
    }
    return picked.sort((a, b) => (ascending ? a - b : b - a))
  }

  const resistances = pickNearest(above, true)
  const supports = pickNearest(below, false)
  if (!resistances.length && !supports.length) return null

  return {
    supports,
    resistances,
    detail: {
      pivot: roundTo(P),
      priorDay: { h: roundTo(prev.h), l: roundTo(prev.l) },
      priorWeek: { h: roundTo(priorWeekH), l: roundTo(priorWeekL) },
      swingHighs: highs.slice(-6).map(roundTo),
      swingLows: lows.slice(-6).map(roundTo),
      asOf: new Date().toISOString(),
    },
  }
}

/** Contexto para o prompt: força o LLM a usar estes níveis reais em vez de inventar. */
export function buildLevelsContext(levels: TerminalLevels | null): string {
  if (!levels) return ""
  return `\n\n[NÍVEIS TÉCNICOS REAIS — calculados AGORA a partir de OHLC diário (pivots clássicos do dia anterior + máximos/mínimos de swing + high/low do dia e semana anteriores). Usa ESTES números EXATOS como suportes/resistências no dashboard; NÃO inventes outros nem os arredondes de forma diferente]:
- Suportes (do mais próximo): ${levels.supports.join(", ") || "n/d"}
- Resistências (do mais próximo): ${levels.resistances.join(", ") || "n/d"}
- Pivô diário: ${levels.detail.pivot} · Dia anterior H/L: ${levels.detail.priorDay.h}/${levels.detail.priorDay.l} · Semana anterior H/L: ${levels.detail.priorWeek.h}/${levels.detail.priorWeek.l}
Ancora as zonas de entrada, stops e take-profits nestes níveis.`
}

/** Busca candles + calcula níveis num só passo (best-effort). */
export async function fetchTerminalLevels(asset: TerminalAsset, price: number | null): Promise<TerminalLevels | null> {
  if (price == null) return null
  const candles = await fetchTerminalCandles(asset)
  return computeTerminalLevels(candles, price)
}

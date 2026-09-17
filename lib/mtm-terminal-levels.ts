/**
 * Níveis técnicos REAIS para o Terminal MTM — velas diárias do instrumento de REFERÊNCIA do ativo
 * (Binance spot para cripto, perpétuo Binance para metais — ao nível do spot —, Yahoo para o resto)
 * e cálculo puro em lib/mtm-terminal-technicals.ts. Sem MetaApi, sem variáveis novas.
 * Se a referência principal falhar, tenta as de reserva do ativo (refFallbacks).
 */
import { referencePlan, type ReferenceInstrument, type TerminalAsset } from "@/lib/mtm-terminal-assets"
import { basisAdjust, computeTerminalLevels, type Candle, type TerminalLevels } from "@/lib/mtm-terminal-technicals"

export type { Candle, TerminalLevels } from "@/lib/mtm-terminal-technicals"
export { computeTerminalLevels, buildLevelsContext } from "@/lib/mtm-terminal-technicals"

const TIMEOUT_MS = 5_000

async function fetchYahooCandles(sym: string, range = "1y"): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
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

function parseKlines(data: unknown): Candle[] {
  if (!Array.isArray(data)) return []
  return data
    .map((k) => {
      const a = k as (string | number)[]
      return { t: Number(a[0]), o: Number(a[1]), h: Number(a[2]), l: Number(a[3]), c: Number(a[4]) }
    })
    .filter((c) => [c.o, c.h, c.l, c.c].every((v) => Number.isFinite(v)))
}

async function fetchKlines(urls: string[]): Promise<Candle[]> {
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!r.ok) continue
      const c = parseKlines(await r.json().catch(() => null))
      if (c.length) return c
    } catch {
      /* próxima */
    }
  }
  return []
}

/** Velas de UMA referência. Vazio se a fonte falhar (o erro não interessa: passa-se à seguinte). */
async function fetchRefCandles(ref: ReferenceInstrument): Promise<Candle[]> {
  const { kind, symbol } = ref
  try {
    if (kind === "binance-spot") {
      const b = await fetchKlines([
        `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&limit=260`,
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=260`,
      ])
      if (b.length) return b
      const { fetchCoinGeckoOhlcAsKlines } = await import("@/lib/crypto-usd")
      const k = await fetchCoinGeckoOhlcAsKlines(symbol, 90).catch(() => null)
      return (k ?? []).map(([t, o, h, l, c]) => ({ t, o, h, l, c }))
    }
    if (kind === "binance-futures") {
      // Responde 451 a IPs dos EUA — é aqui que o ouro/prata morriam em iad1. Ver refFallbacks.
      return await fetchKlines([`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=260`])
    }
    return await fetchYahooCandles(symbol, "1y")
  } catch {
    return []
  }
}

/**
 * OHLC diário (mais recente por último), ~1 ano, e a referência de onde veio — quem usa as velas
 * precisa do `sameLevel` DESSA referência para saber se as reescala (a de reserva nunca está ao nível).
 * Mínimo de velas para servir: com menos não há EMA50/ATR/intervalo, e é melhor tentar a seguinte.
 */
export const MIN_CANDLES = 60
export async function fetchTerminalCandleSeries(asset: TerminalAsset): Promise<{ ref: ReferenceInstrument; candles: Candle[] }> {
  const plan = referencePlan(asset)
  let best: { ref: ReferenceInstrument; candles: Candle[] } = { ref: asset.ref, candles: [] }
  for (const ref of plan) {
    const candles = await fetchRefCandles(ref)
    if (candles.length >= MIN_CANDLES) return { ref, candles }
    if (candles.length > best.candles.length) best = { ref, candles }
  }
  return best
}

/** Compatibilidade: só as velas. Quem as reescala deve usar fetchTerminalCandleSeries. */
export async function fetchTerminalCandles(asset: TerminalAsset): Promise<Candle[]> {
  return (await fetchTerminalCandleSeries(asset)).candles
}

/** Busca candles + calcula níveis num só passo (best-effort), já ao nível do preço mostrado. */
export async function fetchTerminalLevels(asset: TerminalAsset, price: number | null): Promise<TerminalLevels | null> {
  if (price == null) return null
  const { ref, candles } = await fetchTerminalCandleSeries(asset)
  const { candles: adj } = basisAdjust(candles, price, ref.sameLevel)
  return computeTerminalLevels(adj, price)
}

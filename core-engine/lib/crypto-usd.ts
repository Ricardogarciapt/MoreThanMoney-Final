import { coingeckoFetchConfig, resolveCoinGeckoId } from "@/lib/coingecko-portfolio"

/** Par USDT para API Binance (evita ADAUSDT → ADAUSDTUSDT) */
export function normalizeBinancePair(raw: string): string {
  const s = raw
    .toUpperCase()
    .replace(/^BINANCE:/, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim()
  if (!s) return "BTCUSDT"
  if (s.endsWith("USDT")) return s
  return `${s}USDT`
}

export async function fetchBinanceSpotUsd(rawSymbol: string): Promise<number | null> {
  try {
    const pair = normalizeBinancePair(rawSymbol)
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, {
      next: { revalidate: 60 },
    })
    if (!r.ok) return null
    const j = (await r.json()) as { price?: string }
    const price = parseFloat(j.price || "")
    return Number.isFinite(price) ? price : null
  } catch {
    return null
  }
}

export async function fetchCoinGeckoSpotUsd(
  rawSymbol: string
): Promise<{ price: number | null; change24h: number | null }> {
  const id = resolveCoinGeckoId(rawSymbol)
  if (!id) return { price: null, change24h: null }
  const { baseUrl, headers } = coingeckoFetchConfig()
  const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`
  try {
    const r = await fetch(url, { next: { revalidate: 120 }, headers })
    if (!r.ok) return { price: null, change24h: null }
    const data = (await r.json()) as Record<string, { usd?: number; usd_24h_change?: number }>
    const row = data[id]
    if (!row) return { price: null, change24h: null }
    const price = typeof row.usd === "number" ? row.usd : null
    const change24h = typeof row.usd_24h_change === "number" ? row.usd_24h_change : null
    return { price, change24h }
  } catch {
    return { price: null, change24h: null }
  }
}

/**
 * Binance primeiro; se falhar (ex. IP bloqueado nos EUA onde corre a Vercel), CoinGecko.
 */
export async function fetchCryptoUsdBest(rawSymbol: string): Promise<number | null> {
  const binance = await fetchBinanceSpotUsd(rawSymbol)
  if (binance != null) return binance
  const cg = await fetchCoinGeckoSpotUsd(rawSymbol)
  return cg.price
}

/** Velas diárias estilo Binance kline a partir do OHLC CoinGecko (fallback quando Binance bloqueada) */
export async function fetchCoinGeckoOhlcAsKlines(
  rawSymbol: string,
  days: number
): Promise<number[][] | null> {
  const id = resolveCoinGeckoId(rawSymbol)
  if (!id) return null
  const { baseUrl, headers } = coingeckoFetchConfig()
  const url = `${baseUrl}/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${days}`
  try {
    const r = await fetch(url, { next: { revalidate: 300 }, headers })
    if (!r.ok) return null
    const ohlc = (await r.json()) as number[][]
    if (!Array.isArray(ohlc) || ohlc.length === 0) return null
    return ohlc.map(([t, o, h, l, c]) => [t, o, h, l, c, 0])
  } catch {
    return null
  }
}

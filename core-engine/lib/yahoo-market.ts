/** Cotação Yahoo Finance para ETFs / stocks (preço + variação diária). */

export type YahooQuote = {
  price: number | null
  changePercent: number | null
  previousClose: number | null
  currency: string | null
}

const quoteCache = new Map<string, { quote: YahooQuote; ts: number }>()
const CACHE_MS = 90_000

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return { price: null, changePercent: null, previousClose: null, currency: null }

  const cached = quoteCache.get(sym)
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.quote

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
      { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MTM-Portfolio/1.0)' } },
    )
    if (!res.ok) {
      return { price: null, changePercent: null, previousClose: null, currency: null }
    }
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    const price =
      typeof meta?.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)
        ? meta.regularMarketPrice
        : null
    const changePercent =
      typeof meta?.regularMarketChangePercent === 'number' &&
      Number.isFinite(meta.regularMarketChangePercent)
        ? meta.regularMarketChangePercent
        : null
    const previousClose =
      typeof meta?.chartPreviousClose === 'number' && Number.isFinite(meta.chartPreviousClose)
        ? meta.chartPreviousClose
        : typeof meta?.previousClose === 'number'
          ? meta.previousClose
          : null

    const quote: YahooQuote = {
      price,
      changePercent,
      previousClose,
      currency: meta?.currency ?? 'USD',
    }
    quoteCache.set(sym, { quote, ts: Date.now() })
    return quote
  } catch {
    return { price: null, changePercent: null, previousClose: null, currency: null }
  }
}

export async function fetchYahooHistoricalCloses(
  symbol: string,
  range: '7d' | '1mo' = '7d',
): Promise<number[]> {
  const sym = symbol.trim().toUpperCase()
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`,
      { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MTM-Portfolio/1.0)' } },
    )
    if (!res.ok) return []
    const data = await res.json()
    const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    return closes.filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0)
  } catch {
    return []
  }
}

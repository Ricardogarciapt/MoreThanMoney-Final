/**
 * COTAÇÕES DA /portfolios — fontes grátis, lidas por um cron e guardadas em `portfolio_cotacoes`
 * (migração 234). A página nunca vai fora: lê a tabela.
 *
 * Porque estas fontes:
 *  · Cripto: data-api.binance.vision — o espelho público da Binance, sem chave e sem o bloqueio 451
 *    que a api.binance.com dá aos IPs dos EUA (a Vercel corre em iad1). UM pedido traz todos os
 *    pares (ticker/24hr?symbols=[...]). CoinGecko grátis só para o par que faltar.
 *  · ETF: Yahoo chart (preço e fecho anterior → variação do dia), um pedido por ETF.
 *
 * Nunca lança: o que falha fica `null` e o cron mantém a cotação anterior.
 */
import { coingeckoFetchConfig, resolveCoinGeckoId } from '@/lib/coingecko-portfolio'

export interface Cotacao { symbol: string; preco: number; var24hPct: number | null; fonte: string }

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MTM/1.0)' }

async function json(url: string, headers: Record<string, string> = UA): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

const num = (v: unknown): number | null => {
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? x : null
}

/** Par Binance (ADA → ADAUSDT). */
export function parBinance(s: string): string {
  const t = s.toUpperCase().replace(/^BINANCE:/, '').replace(/[^A-Z0-9]/g, '')
  return t.endsWith('USDT') ? t : `${t}USDT`
}

export async function cotacoesCripto(symbols: string[]): Promise<Record<string, Cotacao>> {
  const out: Record<string, Cotacao> = {}
  const pares = [...new Set(symbols.map(parBinance))]
  if (!pares.length) return out
  for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    const faltam = pares.filter((p) => !out[p])
    if (!faltam.length) break
    const lista = (await json(`${base}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(faltam))}`)) as
      | Array<{ symbol?: string; lastPrice?: string; priceChangePercent?: string }>
      | null
    // Um par que a Binance não conhece faz falhar o lote inteiro: aí tenta-se um a um.
    const linhas = Array.isArray(lista)
      ? lista
      : ((await Promise.all(faltam.map((p) => json(`${base}/api/v3/ticker/24hr?symbol=${p}`)))).filter(Boolean) as Array<{ symbol?: string; lastPrice?: string; priceChangePercent?: string }>)
    for (const l of linhas) {
      const preco = num(l.lastPrice)
      if (l.symbol && preco) {
        const v = Number(l.priceChangePercent)
        out[l.symbol] = { symbol: l.symbol, preco, var24hPct: Number.isFinite(v) ? v : null, fonte: base.includes('vision') ? 'binance-vision' : 'binance' }
      }
    }
  }
  const faltam = pares.filter((p) => !out[p])
  if (faltam.length) {
    const ids = faltam.map((p) => [p, resolveCoinGeckoId(p)] as const).filter(([, id]) => id)
    if (ids.length) {
      const { baseUrl, headers } = coingeckoFetchConfig()
      const d = (await json(`${baseUrl}/simple/price?ids=${ids.map(([, id]) => id).join(',')}&vs_currencies=usd&include_24hr_change=true`, { ...UA, ...(headers as Record<string, string>) })) as
        | Record<string, { usd?: number; usd_24h_change?: number }>
        | null
      for (const [p, id] of ids) {
        const row = d?.[id as string]
        const preco = num(row?.usd)
        if (preco) out[p] = { symbol: p, preco, var24hPct: typeof row?.usd_24h_change === 'number' ? row.usd_24h_change : null, fonte: 'coingecko' }
      }
    }
  }
  return out
}

export async function cotacoesEtf(symbols: string[]): Promise<Record<string, Cotacao>> {
  const out: Record<string, Cotacao> = {}
  await Promise.all(
    [...new Set(symbols)].map(async (s) => {
      for (const host of ['query1', 'query2']) {
        const j = (await json(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=5d`)) as
          | { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }> } }
          | null
        const meta = j?.chart?.result?.[0]?.meta
        const preco = num(meta?.regularMarketPrice)
        if (preco) {
          const ant = num(meta?.previousClose) ?? num(meta?.chartPreviousClose)
          out[s] = { symbol: s, preco, var24hPct: ant ? ((preco - ant) / ant) * 100 : null, fonte: 'yahoo' }
          return
        }
      }
    }),
  )
  return out
}

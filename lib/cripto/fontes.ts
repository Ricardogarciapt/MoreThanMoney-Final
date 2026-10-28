/**
 * AGENTE CRIPTO: a CAMADA DE DADOS. Só leitura, só endpoints públicos e grátis, sem chaves.
 *
 *  · Bybit v5 público: velas de 5 min, livro e funding dos perps (os mesmos perps do copy Aurum).
 *  · DexScreener: memecoins Solana em destaque e os pares delas.
 *  · GeckoTerminal: velas de 5 min das pools (o DexScreener não tem API de velas).
 *  · RugCheck: autoridades, detentores, liquidez bloqueada, riscos.
 *  · Jupiter (lite-api): cotação de VENDA, para apanhar honeypots e taxas escondidas.
 *  · RSS (CoinDesk, Cointelegraph): títulos para o analista de notícias.
 *
 * Corre na VPS (o container da cloud não chega a estes hosts). Cada função devolve `null`/[] em
 * falha: dado em falta conta contra na guarda e no filtro de rug, nunca a favor.
 */
import type { DadosRug, Livro, Vela } from './tipos'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

async function json(url: string, ms = 8000): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const num = (x: unknown): number | null => {
  const n = Number(x)
  return x != null && x !== '' && Number.isFinite(n) ? n : null
}

/* ─── Bybit (perps lineares USDT) ─── */

const BYBIT = 'https://api.bybit.com'

export async function velasBybit(symbol: string, limite = 300, intervaloMin: 1 | 5 = 5): Promise<Vela[]> {
  const j = (await json(`${BYBIT}/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${intervaloMin}&limit=${limite}`)) as
    | { result?: { list?: string[][] } }
    | null
  const l = j?.result?.list ?? []
  // A Bybit devolve do mais recente para o mais antigo; a vela em curso (a primeira) fica de fora.
  return l
    .slice(1)
    .map((x) => ({ t: Number(x[0]), o: Number(x[1]), h: Number(x[2]), l: Number(x[3]), c: Number(x[4]), v: Number(x[5]) }))
    .filter((v) => Number.isFinite(v.c))
    .reverse()
}

/**
 * Os perps lineares USDT MAIS VOLÁTEIS agora, para o scalping de alta volatilidade. Só entram os
 * com liquidez a sério (turnover 24 h ≥ `minTurnoverUsd`), ordenados pelo range de 24 h em % do
 * preço. Cache de 5 min em memória: o ciclo corre ao minuto e a lista não muda tão depressa.
 */
let cacheVolateis: { em: number; chave: string; lista: string[] } | null = null
export async function perpsVolateis(n: number, minTurnoverUsd = 50_000_000): Promise<string[]> {
  const chave = `${n}|${minTurnoverUsd}`
  if (cacheVolateis && cacheVolateis.chave === chave && Date.now() - cacheVolateis.em < 5 * 60_000) return cacheVolateis.lista
  const j = (await json(`${BYBIT}/v5/market/tickers?category=linear`)) as
    | { result?: { list?: Array<Record<string, string>> } }
    | null
  const lista = (j?.result?.list ?? [])
    .filter((t) => /^[A-Z0-9]{2,20}USDT$/.test(t.symbol ?? ''))
    .map((t) => ({ s: t.symbol, turnover: num(t.turnover24h) ?? 0, alto: num(t.highPrice24h), baixo: num(t.lowPrice24h), preco: num(t.lastPrice) }))
    .filter((t) => t.turnover >= minTurnoverUsd && t.alto != null && t.baixo != null && t.preco != null && t.preco > 0)
    .sort((a, b) => (b.alto! - b.baixo!) / b.preco! - (a.alto! - a.baixo!) / a.preco!)
    .slice(0, n)
    .map((t) => t.s)
  // Falha da Bybit: fica a lista anterior (ou nenhuma), nunca uma lista inventada.
  if (lista.length) cacheVolateis = { em: Date.now(), chave, lista }
  return lista.length ? lista : cacheVolateis?.lista ?? []
}

export async function livroBybit(symbol: string): Promise<Livro | null> {
  const j = (await json(`${BYBIT}/v5/market/orderbook?category=linear&symbol=${encodeURIComponent(symbol)}&limit=50`)) as
    | { result?: { b?: string[][]; a?: string[][] } }
    | null
  if (!j?.result) return null
  const conv = (l?: string[][]) => (l ?? []).map((x) => [Number(x[0]), Number(x[1])] as [number, number])
  return { bids: conv(j.result.b), asks: conv(j.result.a) }
}

export async function fundingBybit(symbol: string): Promise<number | null> {
  const j = (await json(`${BYBIT}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`)) as
    | { result?: { list?: { fundingRate?: string }[] } }
    | null
  const f = num(j?.result?.list?.[0]?.fundingRate)
  return f == null ? null : f * 100
}

/* ─── Memecoins Solana ─── */

export interface CandidatoMeme {
  mint: string
  simbolo: string
  pool: string
  precoUsd: number
  liquidezUsd: number | null
  idadeHoras: number | null
  social: string[]
}

/** Os tokens Solana em destaque no DexScreener, com o par de maior liquidez de cada um. */
export async function candidatosMeme(max = 15, agora = new Date()): Promise<CandidatoMeme[]> {
  const top = (await json('https://api.dexscreener.com/token-boosts/top/v1')) as { chainId?: string; tokenAddress?: string }[] | null
  const mints = [...new Set((top ?? []).filter((t) => t.chainId === 'solana' && t.tokenAddress).map((t) => t.tokenAddress!))].slice(0, max)
  const out: CandidatoMeme[] = []
  for (const mint of mints) {
    const pares = (await json(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`)) as
      | {
          pairAddress?: string
          baseToken?: { address?: string; symbol?: string }
          priceUsd?: string
          liquidity?: { usd?: number }
          pairCreatedAt?: number
          info?: { socials?: { type?: string; url?: string }[]; websites?: { url?: string }[] }
        }[]
      | null
    const p = (pares ?? [])
      .filter((x) => x.baseToken?.address === mint && x.pairAddress)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    const preco = num(p?.priceUsd)
    if (!p || preco == null) continue
    out.push({
      mint,
      simbolo: String(p.baseToken?.symbol ?? mint.slice(0, 6)).slice(0, 16),
      pool: p.pairAddress!,
      precoUsd: preco,
      liquidezUsd: num(p.liquidity?.usd),
      idadeHoras: p.pairCreatedAt ? (agora.getTime() - p.pairCreatedAt) / 3600_000 : null,
      social: [...(p.info?.socials ?? []).map((s) => `${s.type}: ${s.url}`), ...(p.info?.websites ?? []).map((w) => `site: ${w.url}`)].slice(0, 5),
    })
  }
  return out
}

export async function velasPool(pool: string, limite = 300): Promise<Vela[]> {
  const j = (await json(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=5&limit=${limite}&currency=usd`)) as
    | { data?: { attributes?: { ohlcv_list?: number[][] } } }
    | null
  return (j?.data?.attributes?.ohlcv_list ?? [])
    .map((x) => ({ t: x[0] * 1000, o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] }))
    .filter((v) => Number.isFinite(v.c))
    .sort((a, b) => a.t - b.t)
}

/** Junta RugCheck + cotação de venda Jupiter. Campos que falharem ficam `null` (contam contra). */
export async function dadosRug(c: CandidatoMeme, valorTesteUsd = 100): Promise<DadosRug> {
  const rep = (await json(`https://api.rugcheck.xyz/v1/tokens/${c.mint}/report`, 12_000)) as
    | {
        score?: number
        risks?: { name?: string }[]
        mintAuthority?: string | null
        freezeAuthority?: string | null
        token?: { decimals?: number }
        topHolders?: { pct?: number; insider?: boolean }[]
        markets?: { pubkey?: string; lp?: { lpLockedPct?: number } }[]
      }
      | null
  let impacto: number | null = null
  const dec = num(rep?.token?.decimals)
  if (dec != null && c.precoUsd > 0) {
    // Só serve para cotar: perder precisão nos últimos dígitos não muda o impacto.
    const raw = Math.floor((valorTesteUsd / c.precoUsd) * Math.pow(10, dec)).toLocaleString('fullwide', { useGrouping: false })
    const q = (await json(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${c.mint}&outputMint=${USDC}&amount=${raw}&slippageBps=300`)) as
      | { priceImpactPct?: string; outAmount?: string }
      | null
    const outUsd = num(q?.outAmount)
    // Perda total de vender: impacto + taxas escondidas. outAmount vem em USDC (6 casas).
    if (outUsd != null) impacto = Math.max(0, (1 - outUsd / 1e6 / valorTesteUsd) * 100)
  }
  // A pool principal aparece como "detentor": tira-se quem tiver a mesma chave de um mercado.
  const pools = new Set((rep?.markets ?? []).map((m) => m.pubkey))
  const top = (rep?.topHolders ?? []).slice(0, 10).filter((h) => !pools.has((h as { address?: string }).address))
  const lp = (rep?.markets ?? []).map((m) => num(m.lp?.lpLockedPct)).filter((x): x is number => x != null)
  return {
    mint: c.mint,
    rugcheckScore: num(rep?.score),
    rugcheckRiscos: (rep?.risks ?? []).map((r) => String(r.name ?? '')).filter(Boolean),
    mintAuthorityAtiva: rep ? !!rep.mintAuthority : null,
    freezeAuthorityAtiva: rep ? !!rep.freezeAuthority : null,
    top10Fraccao: rep?.topHolders ? top.reduce((s, h) => s + (num(h.pct) ?? 0), 0) / 100 : null,
    lpBloqueadaFraccao: lp.length ? Math.max(...lp) / 100 : null,
    liquidezUsd: c.liquidezUsd,
    idadeHoras: c.idadeHoras,
    impactoVendaPct: impacto,
  }
}

/* ─── Notícias ─── */

const RSS = ['https://www.coindesk.com/arc/outboundfeeds/rss/', 'https://cointelegraph.com/rss']

export async function titulosNoticias(max = 20): Promise<string[]> {
  const out: string[] = []
  for (const url of RSS) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t))
      if (!r.ok) continue
      const xml = await r.text()
      for (const m of xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)) out.push(m[1].trim())
    } catch {
      /* fonte em baixo: as outras chegam */
    }
  }
  return out.slice(0, max)
}

/** Títulos que falam do ativo (ou do mercado em geral, para BTC/ETH). */
export function titulosDoAtivo(titulos: string[], ativo: string): string[] {
  const base = ativo.replace(/USDT$/, '').toUpperCase()
  const nomes: Record<string, string[]> = { BTC: ['bitcoin', 'btc'], ETH: ['ether', 'eth'], SOL: ['solana', 'sol '] }
  const chaves = nomes[base] ?? [base.toLowerCase()]
  const gerais = /fed|sec|etf|crypto market|liquidat|hack|exploit/i
  return titulos.filter((t) => chaves.some((k) => t.toLowerCase().includes(k)) || gerais.test(t)).slice(0, 10)
}

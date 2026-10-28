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
import type { TradePool, TransacaoRpc } from './carteiras'
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

/** Retrato instantâneo de uma memecoin pela DexScreener (sem velas: a GeckoTerminal limita a ~30/min). */
export interface SnapshotMeme {
  mint: string
  simbolo: string
  pool: string
  /** pumpfun = ainda na curva da Pump.fun; pumpswap/raydium/meteora/orca = já em pool. */
  dexId: string
  precoUsd: number
  liquidezUsd: number | null
  fdvUsd: number | null
  idadeHoras: number | null
  var5mPct: number | null
  var1hPct: number | null
  var24hPct: number | null
  vol5mUsd: number | null
  vol1hUsd: number | null
  compras5m: number
  vendas5m: number
  compras1h: number
  vendas1h: number
  social: string[]
}

export type CandidatoMeme = SnapshotMeme

type ParDex = {
  dexId?: string
  pairAddress?: string
  baseToken?: { address?: string; symbol?: string }
  priceUsd?: string
  liquidity?: { usd?: number }
  fdv?: number
  pairCreatedAt?: number
  priceChange?: { m5?: number; h1?: number; h24?: number }
  volume?: { m5?: number; h1?: number }
  txns?: { m5?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number } }
  info?: { socials?: { type?: string; url?: string }[]; websites?: { url?: string }[] }
}

/**
 * Retratos de até 30 mints por pedido (`/tokens/v1/solana/a,b,c`, ~300 pedidos/min grátis). Por
 * mint fica o par com mais liquidez; na curva da Pump.fun a liquidez vem vazia e fica `null`.
 */
export async function snapshotsDex(mints: string[], agora = new Date()): Promise<Map<string, SnapshotMeme>> {
  const out = new Map<string, SnapshotMeme>()
  const unicos = [...new Set(mints)]
  for (let i = 0; i < unicos.length; i += 30) {
    const lote = unicos.slice(i, i + 30)
    const pares = ((await json(`https://api.dexscreener.com/tokens/v1/solana/${lote.join(',')}`)) as ParDex[] | null) ?? []
    for (const mint of lote) {
      const p = pares
        .filter((x) => x.baseToken?.address === mint && x.pairAddress)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0) || (b.volume?.h1 ?? 0) - (a.volume?.h1 ?? 0))[0]
      const preco = num(p?.priceUsd)
      if (!p || preco == null || !(preco > 0)) continue
      out.set(mint, {
        mint,
        simbolo: String(p.baseToken?.symbol ?? mint.slice(0, 6)).slice(0, 16),
        pool: p.pairAddress!,
        dexId: String(p.dexId ?? ''),
        precoUsd: preco,
        liquidezUsd: num(p.liquidity?.usd),
        fdvUsd: num(p.fdv),
        idadeHoras: p.pairCreatedAt ? (agora.getTime() - p.pairCreatedAt) / 3600_000 : null,
        var5mPct: num(p.priceChange?.m5),
        var1hPct: num(p.priceChange?.h1),
        var24hPct: num(p.priceChange?.h24),
        vol5mUsd: num(p.volume?.m5),
        vol1hUsd: num(p.volume?.h1),
        compras5m: num(p.txns?.m5?.buys) ?? 0,
        vendas5m: num(p.txns?.m5?.sells) ?? 0,
        compras1h: num(p.txns?.h1?.buys) ?? 0,
        vendas1h: num(p.txns?.h1?.sells) ?? 0,
        social: [...(p.info?.socials ?? []).map((s) => `${s.type}: ${s.url}`), ...(p.info?.websites ?? []).map((w) => `site: ${w.url}`)].slice(0, 5),
      })
    }
  }
  return out
}

/**
 * Mints Solana em destaque agora, de várias fontes grátis: boosts (top e recentes) e perfis novos da
 * DexScreener (muitos são da Pump.fun) e as pools em tendência da GeckoTerminal (1 pedido, cache de
 * 5 min, porque a GeckoTerminal corta a ~30 pedidos/min). Uma fonte em baixo não pára as outras.
 */
let cacheTendencia: { em: number; mints: string[] } | null = null
export async function mintsEmDestaque(max = 60): Promise<string[]> {
  const doDex = async (url: string) =>
    (((await json(url)) as { chainId?: string; tokenAddress?: string }[] | null) ?? []).filter((t) => t.chainId === 'solana' && t.tokenAddress).map((t) => t.tokenAddress!)
  const [top, recentes, perfis] = await Promise.all([
    doDex('https://api.dexscreener.com/token-boosts/top/v1'),
    doDex('https://api.dexscreener.com/token-boosts/latest/v1'),
    doDex('https://api.dexscreener.com/token-profiles/latest/v1'),
  ])
  if (!cacheTendencia || Date.now() - cacheTendencia.em > 5 * 60_000) {
    const j = (await json('https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1')) as
      | { data?: { relationships?: { base_token?: { data?: { id?: string } } } }[] }
      | null
    const mints = (j?.data ?? []).map((d) => String(d.relationships?.base_token?.data?.id ?? '').replace(/^solana_/, '')).filter((m) => m.length >= 32)
    if (mints.length) cacheTendencia = { em: Date.now(), mints }
  }
  return [...new Set([...perfis, ...recentes, ...(cacheTendencia?.mints ?? []), ...top])].slice(0, max)
}

/** As memecoins candidatas desta passagem, já com o retrato da DexScreener. */
export async function candidatosMeme(max = 60, agora = new Date()): Promise<CandidatoMeme[]> {
  const snaps = await snapshotsDex(await mintsEmDestaque(max), agora)
  return [...snaps.values()]
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
/* ─── Carteiras espertas: negociações de uma pool e transacções de uma carteira ─── */

/** Últimas negociações de uma pool (GeckoTerminal, grátis, ~30 pedidos/min: usar com conta). */
export async function tradesPool(pool: string): Promise<TradePool[]> {
  const j = (await json(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/trades?trade_volume_in_usd_greater_than=100`)) as
    | { data?: { attributes?: { kind?: string; tx_from_address?: string; price_to_in_usd?: string; volume_in_usd?: string; block_timestamp?: string } }[] }
    | null
  return (j?.data ?? [])
    .map((d) => d.attributes ?? {})
    .filter((a) => (a.kind === 'buy' || a.kind === 'sell') && a.tx_from_address)
    .map((a) => ({ kind: a.kind as 'buy' | 'sell', carteira: a.tx_from_address!, precoUsd: num(a.price_to_in_usd) ?? 0, volumeUsd: num(a.volume_in_usd) ?? 0, em: String(a.block_timestamp ?? '') }))
}

const RPC = () => process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

async function rpc(metodo: string, params: unknown[]): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const r = await fetch(RPC(), { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }) })
    if (!r.ok) return null
    return ((await r.json()) as { result?: unknown }).result ?? null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Assinaturas mais recentes de uma carteira (as mais novas primeiro), até `ate` (exclusive). */
export async function assinaturasDe(carteira: string, ate?: string | null, limite = 10): Promise<{ assinatura: string; falhou: boolean }[]> {
  const r = (await rpc('getSignaturesForAddress', [carteira, { limit: limite, ...(ate ? { until: ate } : {}) }])) as { signature?: string; err?: unknown }[] | null
  return (r ?? []).filter((x) => x.signature).map((x) => ({ assinatura: x.signature!, falhou: x.err != null }))
}

export async function transacaoRpc(assinatura: string): Promise<TransacaoRpc | null> {
  return (await rpc('getTransaction', [assinatura, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }])) as TransacaoRpc | null
}

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

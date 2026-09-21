/**
 * VELAS E COTAÇÕES DE REFERÊNCIA (rede) — Binance spot/futuros e Yahoo, sem chave e sem MetaApi.
 *
 * Um só sítio para ir buscar velas públicas: usam-no as velas de reserva do WebTrader
 * (lib/mtmfunded/simulado/velas.ts), o Terminal MTM (lib/mtm-terminal-levels.ts) e o motor da VPS
 * (fonte-yahoo.ts). Só `fetch` global e imports relativos: o esbuild empacota isto para node18.
 *
 * Nunca lança: uma fonte que falha devolve [] (ou null) e quem chama passa à seguinte.
 * Pedidos iguais em curso partilham a promessa e as respostas ficam uns segundos em memória:
 * dez gráficos no ouro a frio são UM pedido ao Yahoo.
 */
import { TF_BINANCE, TF_SEG, cotacaoDoYahoo, janelaYahoo, velasDaBinance, velasDoYahoo, type RefMercado, type VelaRef } from './referencias'

const TIMEOUT_MS = 4_000
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MTM/1.0)' }

const BINANCE_SPOT = ['https://data-api.binance.vision/api/v3/klines', 'https://api.binance.com/api/v3/klines']
/** fapi responde 451 a IPs dos EUA (Vercel iad1): fica por último e nunca é o único plano. */
const BINANCE_FUTUROS = ['https://fapi.binance.com/fapi/v1/klines']
const YAHOO = ['https://query1.finance.yahoo.com/v8/finance/chart/', 'https://query2.finance.yahoo.com/v8/finance/chart/']

// ── cache curta + pedidos partilhados ─────────────────────────────────────────
const cache = new Map<string, { em: number; v: unknown }>()
const emCurso = new Map<string, Promise<unknown>>()
function memo<T>(chave: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const c = cache.get(chave)
  if (c && Date.now() - c.em < ttlMs) return Promise.resolve(c.v as T)
  const ja = emCurso.get(chave)
  if (ja) return ja as Promise<T>
  const p = f().then((v) => {
    cache.set(chave, { em: Date.now(), v })
    if (cache.size > 400) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k)
    return v
  }).finally(() => emCurso.delete(chave))
  emCurso.set(chave, p)
  return p
}

/** Esvazia a cache curta (verificações que simulam uma fonte a cair entre dois pedidos). */
export function limparCacheReferencias() { cache.clear() }

async function json(url: string, headers?: Record<string, string>, timeoutMs = TIMEOUT_MS): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) } as RequestInit)
    if (!r.ok) return null
    return await r.json().catch(() => null)
  } catch {
    return null
  }
}

// ── Binance ───────────────────────────────────────────────────────────────────
async function paginaKlines(bases: string[], symbol: string, intervalo: string, n: number, fimMs: number | null): Promise<VelaRef[]> {
  for (const base of bases) {
    const lote = velasDaBinance(await json(`${base}?symbol=${encodeURIComponent(symbol)}&interval=${intervalo}&limit=${n}${fimMs ? `&endTime=${fimMs}` : ''}`))
    if (lote.length) return lote
  }
  return []
}

/**
 * Klines até `limite` (o Sensei pede 3000; a Binance dá 1000 por pedido). A Binance não tem
 * buracos (24/7), por isso as páginas calculam-se à partida e pedem-se EM PARALELO — três páginas
 * custam uma ida, não três.
 */
async function klines(bases: string[], symbol: string, tf: string, limite: number, ateSeg: number | null): Promise<VelaRef[]> {
  const intervalo = TF_BINANCE[tf]
  if (!intervalo) return []
  const seg = TF_SEG[tf]
  const fim = ateSeg ? ateSeg * 1000 - 1 : null
  const paginas = Math.min(6, Math.ceil(limite / 1000))
  const lotes = await Promise.all(Array.from({ length: paginas }, (_, i) => {
    const n = i === paginas - 1 ? limite - 1000 * i : 1000
    const fimMs = i === 0 ? fim : (fim ?? Date.now()) - i * 1000 * seg * 1000
    return paginaKlines(bases, symbol, intervalo, n, fimMs)
  }))
  const porT = new Map<number, VelaRef>()
  for (const l of lotes) for (const v of l) porT.set(v.t, v)
  return [...porT.values()].sort((a, b) => a.t - b.t).slice(-limite)
}

// ── Yahoo ─────────────────────────────────────────────────────────────────────
async function yahoo(symbol: string, tf: string, limite: number, ateSeg: number | null, sessaoCurta: boolean): Promise<VelaRef[]> {
  const agora = Math.floor(Date.now() / 1000)
  const { period1, period2, intervalo } = janelaYahoo(tf, limite, ateSeg, agora, sessaoCurta)
  if (period1 >= period2) return []
  const q = `${encodeURIComponent(symbol)}?interval=${intervalo}&period1=${period1}&period2=${period2}&includePrePost=false&events=`
  for (const base of YAHOO) {
    const velas = velasDoYahoo(await json(base + q, UA), tf)
    if (velas.length) {
      const filtradas = ateSeg ? velas.filter((v) => v.t < ateSeg) : velas
      return filtradas.slice(-limite)
    }
  }
  return []
}

/**
 * Velas (segundos unix, mais recente por último) de UMA referência no timeframe `tf`.
 * TTL da cache pelo timeframe: uma vela de M1 muda a cada minuto, uma de D1 quase nada.
 */
export function buscarVelasRef(ref: RefMercado, tf: string, limite: number, ateSeg: number | null = null): Promise<VelaRef[]> {
  if (!TF_SEG[tf]) return Promise.resolve([])
  const ttl = ateSeg ? 10 * 60_000 : Math.min(60_000, Math.max(5_000, TF_SEG[tf] * 50))
  const chave = `v:${ref.kind}:${ref.symbol}:${tf}:${limite}:${ateSeg ?? ''}`
  return memo(chave, ttl, async () => {
    try {
      if (ref.kind === 'binance-spot') return await klines(BINANCE_SPOT, ref.symbol, tf, limite, ateSeg)
      if (ref.kind === 'binance-futures') return await klines(BINANCE_FUTUROS, ref.symbol, tf, limite, ateSeg)
      return await yahoo(ref.symbol, tf, limite, ateSeg, Boolean(ref.sessaoCurta))
    } catch {
      return []
    }
  })
}

/**
 * Velas da referência À VOLTA de um instante (para ancorar a reescala num preço antigo): M1 se o
 * instante for desta semana, senão M5 (60 dias), senão H1.
 */
export function velasAVoltaDe(ref: RefMercado, emSeg: number): Promise<{ velas: VelaRef[]; tfSeg: number }> {
  const idade = Date.now() / 1000 - emSeg
  const tf = idade < 6 * 86400 ? 'M1' : idade < 55 * 86400 ? 'M5' : 'H1'
  const ate = Math.floor(emSeg / 60) * 60 + 30 * 60
  return buscarVelasRef(ref, tf, 240, ate).then((velas) => ({ velas, tfSeg: TF_SEG[tf] }))
}

/** Última cotação do Yahoo (preço + instante), com a janela mínima (≈2 KB por pedido). */
export async function cotacaoYahoo(symbol: string, timeoutMs = 3_000): Promise<{ preco: number; emSeg: number } | null> {
  const agora = Math.floor(Date.now() / 1000)
  const q = `${encodeURIComponent(symbol)}?interval=1m&period1=${agora - 900}&period2=${agora + 60}&includePrePost=false&events=`
  for (const base of YAHOO) {
    const c = cotacaoDoYahoo(await json(base + q, UA, timeoutMs))
    if (c) return c
  }
  return null
}

/** Ouro/prata à vista (gold-api.com — sem chave, ao nível do spot, tempo real). */
export async function cotacaoMetalSpot(metal: 'XAU' | 'XAG' | 'XPT' | 'XPD', timeoutMs = 3_000): Promise<{ preco: number; emSeg: number } | null> {
  const d = (await json(`https://api.gold-api.com/price/${metal}`, UA, timeoutMs)) as { price?: number; updatedAt?: string } | null
  const p = Number(d?.price)
  const em = d?.updatedAt ? Math.floor(Date.parse(d.updatedAt) / 1000) : 0
  return p > 0 && em > 0 ? { preco: p, emSeg: em } : null
}

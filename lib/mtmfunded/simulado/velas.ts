import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { candidatosDeTicker } from './ordens'

/**
 * VELAS HISTÓRICAS (servidor) — o helper por trás de /api/mtmfunded/simulado/velas.
 *
 * As velas vêm do histórico da MetaApi lido através de uma conta provider já ligada (as velas são
 * do mercado, não da conta; pedir por uma conta é só a forma como a MetaApi serve histórico).
 *
 * ── O problema que isto resolve (2026-09) ─────────────────────────────────────────────────────
 * A rota pedia sempre `funded_symbols.simbolo_fonte` (XAUUSD.s — o nome na corretora das contas
 * simuladas). A conta de leitura é de OUTRA corretora e não conhece «XAUUSD.s»: a MetaApi respondia
 * 500 «Symbol XAUUSD.s does not exist» e o gráfico abria vazio em produção. E há uma segunda
 * armadilha: a mesma conta tem «US30» mas com a última vela em 2024 (símbolo morto) — responder 200
 * não chega, a vela mais recente tem de ser recente.
 *
 * Por isso o nome a pedir RESOLVE-SE, por esta ordem, e o que funciona fica em cache por
 * símbolo+conta:
 *   1. `simbolo_fonte` do catálogo (quando a conta de leitura é da mesma corretora);
 *   2. o símbolo canónico (XAUUSD);
 *   3. as variantes de `candidatosDeTicker` (sem sufixo, apelidos US30/DJ30…);
 *   4. a lista de símbolos da própria conta ordenada por `rankedBrokerSymbols` (DJIUSD para US30).
 * Cada candidato só «funciona» se devolver velas E a mais recente tiver menos de ~4 dias.
 *
 * ── Quantidade ────────────────────────────────────────────────────────────────────────────────
 * O MTM Sensei precisa de ~3000 velas (DEMA 238 aquece em 474 barras, estrutura e estatísticas
 * pedem história). A MetaApi dá no máximo 1000 por pedido e pagina PARA TRÁS (`startTime` = agora
 * devolve as velas anteriores), por isso pede-se por páginas até ao total.
 *
 * ── Cache ─────────────────────────────────────────────────────────────────────────────────────
 * LRU em memória por instância (30 s) + pedidos em curso partilhados: dez pessoas no ouro com o
 * Sensei ligado não são trinta pedidos. A rota junta `Cache-Control` de 30 s para a CDN.
 */

export const TF_METAAPI: Record<string, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '1h', H4: '4h', D1: '1d' }
const TF_SEG: Record<string, number> = { M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 }

/** Máximo de velas por pedido à rota (o Sensei pede 3000; a folga cobre o H4 de gráficos longos). */
export const MAX_VELAS = 5000
const POR_PAGINA = 1000
const MERCADO = 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai'
const PROVISIONAMENTO = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
const TIMEOUT_MS = 8000

export interface VelaOHLCV {
  t: number
  o: number
  h: number
  l: number
  c: number
  /** volume de ticks da MetaApi (0 quando não vem) — o Sensei usa-o no volume e no order flow */
  v: number
}

export interface RespostaVelas {
  symbol: string
  tf: string
  velas: VelaOHLCV[]
  fonte: 'metaapi' | null
  /** o nome que efetivamente serviu na conta de leitura (ex.: XAUUSD em vez de XAUUSD.s) */
  simboloFonte?: string
  motivo?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Caches
// ─────────────────────────────────────────────────────────────────────────────

/** LRU mínima: Map mantém ordem de inserção; ler re-insere no fim, o mais antigo sai primeiro. */
class LRU<V> {
  private m = new Map<string, { em: number; v: V }>()
  constructor(private max: number, private ttlMs: number) {}
  get(k: string): V | undefined {
    const e = this.m.get(k)
    if (!e) return undefined
    if (Date.now() - e.em > this.ttlMs) { this.m.delete(k); return undefined }
    this.m.delete(k); this.m.set(k, e)
    return e.v
  }
  set(k: string, v: V) {
    this.m.delete(k)
    this.m.set(k, { em: Date.now(), v })
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string)
  }
  delete(k: string) { this.m.delete(k) }
}

const CACHE_RESPOSTAS = new LRU<RespostaVelas>(96, 30_000)
/**
 * Janelas GRANDES (> JANELA_RECENTE velas, sem `ate`): o corpo antigo não muda, por isso guarda-se
 * 10 min; a cauda (as últimas JANELA_RECENTE) continua com os 30 s de sempre e cola-se por cima.
 * Três páginas de 1000 velas à MetaApi custavam ~9 s a frio — agora custam isso uma vez a cada
 * 10 min por símbolo+timeframe, e não a cada 30 s.
 */
const CACHE_CORPO = new LRU<RespostaVelas>(64, 10 * 60_000)
export const JANELA_RECENTE = 300
const EM_CURSO = new Map<string, Promise<RespostaVelas>>()
/** símbolo do catálogo → { conta, nome que serve } (6 h; invalidado se deixar de servir). */
const RESOLVIDOS = new LRU<{ conta: string; nome: string }>(256, 6 * 3600_000)
/** símbolo do catálogo sem fonte nenhuma (não martelar a MetaApi a cada pedido): 10 min. */
const SEM_FONTE = new LRU<string>(256, 10 * 60_000)
const SIMBOLOS_DA_CONTA = new LRU<string[]>(16, 3600_000)

let contasLeitura: { ids: string[]; em: number } = { ids: [], em: 0 }
async function contasDeLeitura(): Promise<string[]> {
  if (contasLeitura.ids.length && Date.now() - contasLeitura.em < 10 * 60_000) return contasLeitura.ids
  const { data } = await getSupabaseAdmin()
    .from('mtm_trading_accounts').select('metaapi_account_id')
    .eq('tipo', 'provider').not('metaapi_account_id', 'is', null)
  const ids = [...new Set((data ?? []).map((d) => String(d.metaapi_account_id)).filter(Boolean))]
  contasLeitura = { ids, em: Date.now() }
  return ids
}

// ─────────────────────────────────────────────────────────────────────────────
// MetaApi
// ─────────────────────────────────────────────────────────────────────────────

async function pedir(url: string, token: string): Promise<Response | null> {
  try {
    return await fetch(url, { headers: { 'auth-token': token }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch {
    return null
  }
}

function normalizar(lote: Array<Record<string, unknown>>): VelaOHLCV[] {
  return lote
    .map((v) => ({
      t: Math.floor(new Date(String(v.time)).getTime() / 1000),
      o: Number(v.open), h: Number(v.high), l: Number(v.low), c: Number(v.close),
      v: Number(v.tickVolume ?? v.volume ?? 0) || 0,
    }))
    .filter((v) => Number.isFinite(v.t) && v.o > 0 && v.h > 0 && v.l > 0 && v.c > 0)
}

async function pagina(conta: string, nome: string, tf: string, antesDeMs: number, limite: number, token: string): Promise<VelaOHLCV[] | null> {
  const url = `${MERCADO}/users/current/accounts/${conta}/historical-market-data/symbols/${encodeURIComponent(nome)}` +
    `/timeframes/${TF_METAAPI[tf]}/candles?startTime=${new Date(antesDeMs).toISOString()}&limit=${limite}`
  const r = await pedir(url, token)
  if (!r?.ok) return null
  try {
    const j = await r.json()
    return Array.isArray(j) ? normalizar(j as Array<Record<string, unknown>>) : null
  } catch {
    return null
  }
}

/** Um nome «serve» se devolver velas e a mais recente for de há menos de ~4 dias (fim de semana + feriado). */
async function serve(conta: string, nome: string, tf: string, token: string): Promise<boolean> {
  const lote = await pagina(conta, nome, tf, Date.now(), 2, token)
  if (!lote?.length) return false
  const maisRecente = Math.max(...lote.map((v) => v.t))
  return Date.now() / 1000 - maisRecente < Math.max(4 * 86400, 3 * (TF_SEG[tf] ?? 300))
}

async function simbolosDaConta(conta: string, token: string): Promise<string[]> {
  const guardado = SIMBOLOS_DA_CONTA.get(conta)
  if (guardado) return guardado
  let lista: string[] = []
  const p = await pedir(`${PROVISIONAMENTO}/users/current/accounts/${conta}`, token)
  const regiao = p?.ok ? String(((await p.json().catch(() => ({}))) as { region?: string }).region ?? '') : ''
  if (regiao) {
    const r = await pedir(`https://mt-client-api-v1.${regiao}.agiliumtrade.ai/users/current/accounts/${conta}/symbols`, token)
    if (r?.ok) {
      const j = await r.json().catch(() => [])
      if (Array.isArray(j)) lista = j.map(String)
    }
  }
  SIMBOLOS_DA_CONTA.set(conta, lista)
  return lista
}

/**
 * Resolve o nome que a conta de leitura serve para este símbolo. Exportado para verificação
 * (tsx) e para quem precise do nome sem pedir velas.
 */
const RESOLUCOES_EM_CURSO = new Map<string, Promise<{ conta: string; nome: string } | null>>()

export async function resolverFonteHistorico(symbol: string, tf = 'M5', opcoes: { ignorarCache?: boolean } = {}): Promise<{ conta: string; nome: string } | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null
  if (!opcoes.ignorarCache) {
    const r = RESOLVIDOS.get(symbol)
    if (r) return r
    if (SEM_FONTE.get(symbol)) return null
  }
  // O gráfico pede a cauda e o corpo ao mesmo tempo: a mesma resolução a frio não se faz duas vezes.
  const emCurso = RESOLUCOES_EM_CURSO.get(symbol)
  if (emCurso) return emCurso
  const p = resolverSemCache(symbol, tf, token)
  RESOLUCOES_EM_CURSO.set(symbol, p)
  try { return await p } finally { RESOLUCOES_EM_CURSO.delete(symbol) }
}

async function resolverSemCache(symbol: string, tf: string, token: string): Promise<{ conta: string; nome: string } | null> {
  const { data: s } = await getSupabaseAdmin().from('funded_symbols').select('simbolo_fonte').eq('symbol', symbol).maybeSingle()
  const fonteCatalogo = s?.simbolo_fonte ? String(s.simbolo_fonte) : null
  const contas = await contasDeLeitura()
  const base: string[] = []
  const add = (x: string | null | undefined) => { if (x && !base.includes(x)) base.push(x) }
  add(fonteCatalogo)
  add(symbol)
  for (const c of candidatosDeTicker(symbol)) add(c)
  if (fonteCatalogo) for (const c of candidatosDeTicker(fonteCatalogo)) add(c)

  // Várias contas provider costumam ser da mesma corretora: tentam-se por ordem e pára-se na 1.ª que serve.
  // Os candidatos de uma conta testam-se em PARALELO (cada «não existe» custa um pedido) e ganha o
  // primeiro NA ORDEM de preferência que sirva — não o que responder primeiro.
  const primeiroQueServe = async (conta: string, nomes: string[]) => {
    const ok = await Promise.all(nomes.map((n) => serve(conta, n, tf, token)))
    const i = ok.indexOf(true)
    return i < 0 ? null : { conta, nome: nomes[i] }
  }
  for (const conta of contas) {
    let r = await primeiroQueServe(conta, base)
    if (!r) {
      // Último recurso: os símbolos reais da conta (ex.: DJIUSD para US30), pelo resolvedor da execução.
      const lista = await simbolosDaConta(conta, token)
      r = await primeiroQueServe(conta, rankedBrokerSymbols(symbol, lista).filter((n) => !base.includes(n)).slice(0, 4))
    }
    if (r) {
      RESOLVIDOS.set(symbol, r)
      return r
    }
  }
  SEM_FONTE.set(symbol, '1')
  return null
}

async function recolher(conta: string, nome: string, tf: string, limite: number, ateSeg: number | null, token: string): Promise<VelaOHLCV[] | null> {
  const porT = new Map<number, VelaOHLCV>()
  let cursorMs = ateSeg ? ateSeg * 1000 : Date.now()
  let primeira = true
  while (porT.size < limite) {
    const falta = limite - porT.size
    const lote = await pagina(conta, nome, tf, cursorMs, Math.min(POR_PAGINA, falta + (primeira ? 0 : 1)), token)
    if (lote == null) return primeira ? null : [...porT.values()]
    primeira = false
    if (!lote.length) break
    let minT = Infinity
    const antes = porT.size
    for (const v of lote) {
      if (ateSeg != null && v.t >= ateSeg) continue
      porT.set(v.t, v)
      minT = Math.min(minT, v.t)
    }
    // Sem velas novas (fim do histórico) ou página curta → acabou.
    if (porT.size === antes || lote.length < 2 || !Number.isFinite(minT) || minT * 1000 >= cursorMs) break
    cursorMs = minT * 1000
  }
  return [...porT.values()].sort((a, b) => a.t - b.t).slice(-limite)
}

/**
 * As `limite` velas até agora (ou anteriores a `ate`, unix s) de `symbol` no timeframe `tf`.
 * Nunca lança: falhar devolve lista vazia com `motivo` (o gráfico constrói-se pelos preços ao vivo).
 */
export async function obterVelas(symbol: string, tf: string, limite: number, ate: number | null = null): Promise<RespostaVelas> {
  const lim = Math.min(MAX_VELAS, Math.max(20, Math.floor(limite) || 300))
  // Janela grande até agora = corpo (cache longa) + cauda recente (cache curta), colados por tempo.
  if (ate == null && lim > JANELA_RECENTE) {
    const [corpo, cauda] = await Promise.all([
      comCache(CACHE_CORPO, symbol, tf, lim, null),
      comCache(CACHE_RESPOSTAS, symbol, tf, JANELA_RECENTE, null),
    ])
    if (!corpo.velas.length) return cauda.velas.length ? cauda : corpo
    if (!cauda.velas.length) return corpo
    return { ...corpo, velas: colarVelas(corpo.velas, cauda.velas, lim) }
  }
  return comCache(CACHE_RESPOSTAS, symbol, tf, lim, ate)
}

/**
 * Junta duas listas de velas por tempo — a `nova` ganha a partir da sua primeira vela (a vela viva
 * mudou, e a cauda é mais fresca) — e fica com as `limite` mais recentes. O corpo tem no máximo
 * 10 min e a cauda 300 velas (5 h no M1): as duas sobrepõem-se sempre, não fica buraco.
 */
export function colarVelas(antiga: VelaOHLCV[], nova: VelaOHLCV[], limite: number): VelaOHLCV[] {
  if (!nova.length) return antiga.slice(-limite)
  const primeiraNova = nova[0].t
  return antiga.filter((v) => v.t < primeiraNova).concat(nova).slice(-limite)
}

async function comCache(cache: LRU<RespostaVelas>, symbol: string, tf: string, lim: number, ate: number | null): Promise<RespostaVelas> {
  const chave = `${cache === CACHE_CORPO ? 'corpo' : 'r'}:${symbol}:${tf}:${lim}:${ate ?? 'agora'}`
  // Um corpo vazio fica na cache curta (ver abaixo).
  const guardado = cache.get(chave) ?? (cache === CACHE_CORPO ? CACHE_RESPOSTAS.get(chave) : undefined)
  if (guardado) return guardado
  const emCurso = EM_CURSO.get(chave)
  if (emCurso) return emCurso

  const trabalho = (async (): Promise<RespostaVelas> => {
    const vazio = (motivo: string): RespostaVelas => ({ symbol, tf, velas: [], fonte: null, motivo })
    const token = process.env.METAAPI_TOKEN
    if (!token) return vazio('sem histórico configurado')
    if (!TF_METAAPI[tf]) return vazio('timeframe inválido')

    let fonte = await resolverFonteHistorico(symbol, tf)
    if (!fonte) return vazio('histórico indisponível')
    let velas = await recolher(fonte.conta, fonte.nome, tf, lim, ate, token)
    if (velas == null) {
      // O nome em cache deixou de servir (conta desligada, símbolo retirado): resolve outra vez, uma vez.
      RESOLVIDOS.delete(symbol)
      fonte = await resolverFonteHistorico(symbol, tf, { ignorarCache: true })
      velas = fonte ? await recolher(fonte.conta, fonte.nome, tf, lim, ate, token) : null
    }
    if (!fonte || velas == null) return vazio('histórico indisponível')
    return { symbol, tf, velas, fonte: 'metaapi', simboloFonte: fonte.nome }
  })()

  EM_CURSO.set(chave, trabalho)
  try {
    const r = await trabalho
    // Respostas vazias guardam-se só 30 s (na cache curta): um símbolo sem histórico não martela a
    // MetaApi, mas também não fica 10 min sem gráfico se a conta de leitura voltar.
    if (r.velas.length || cache !== CACHE_CORPO) cache.set(chave, r)
    else CACHE_RESPOSTAS.set(chave, r)
    return r
  } finally {
    EM_CURSO.delete(chave)
  }
}

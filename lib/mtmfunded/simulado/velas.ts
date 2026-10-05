import { simbolosPartilhados } from '@/lib/mtmcopy/metaapi-simbolos-partilhados'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { candidatosDeTicker } from './ordens'
import { isMarketOpen } from '@/lib/mtmcopy/market-hours'
import { fatorAncorado, fatorValido, referenciasPara, reescalar, soAberto, type Ancora, type RefMercado } from '@/lib/mercado/referencias'
import { buscarVelasRef, velasAVoltaDe } from '@/lib/mercado/velas-referencia'
// Os timeframes e a agregação são puros e partilhados com o cliente (selector, vela viva).
import { DERIVACAO, agregarNoTimeframe } from '@/lib/webtrader/timeframes'

/**
 * VELAS HISTÓRICAS (servidor) — o helper por trás de /api/mtmfunded/simulado/velas.
 *
 * ── DE ONDE VÊM (05/10, regra do dono «a MetaApi não entra nas velas») ─────────────────────────
 * A MetaApi é só o cano que entrega ordens às contas dos clientes (memória metaapi-so-entrega-slaves).
 * As velas vêm, por esta ordem:
 *   1. das referências públicas de lib/mercado — Binance spot (cripto, PAXG para o ouro) e Yahoo
 *      (forex, metais, índices, energia, acções) —, reescaladas ao nosso nível por um fator
 *      ancorado no último preço conhecido em `funded_precos` (a âncora é o nosso preço; a forma da
 *      vela é a da referência). `fonte` diz de onde vieram; `reescala` o fator aplicado;
 *   2. a vela VIVA é sempre a nossa: o gráfico cola por cima os ticks de `funded_precos`/conector
 *      (use-precos.ts no cliente). Nem `funded_precos` nem o conector MT5 guardam histórico de
 *      velas — o conector só emite ticks —, por isso não podem ser fonte do passado;
 *   3. só com `MOTOR_PRECOS_METAAPI=1` (a mesma chave que liga a MetaApi no motor do VPS), e só
 *      quando as reservas não dão nada, a MetaApi entra como último recurso (3 s de prazo e
 *      disjuntor). Sem a chave, nem é chamada. Antes ia PRIMEIRO, em corrida com a reserva.
 *
 * ── TIMEFRAMES ────────────────────────────────────────────────────────────────────────────────
 * Nativos (as fontes servem-nos): M1 M5 M15 H1 H4 D1. Os outros DERIVAM-SE de um nativo aqui no
 * servidor — M2/M3 do M1, M10 do M5, M30 do M15, H2/H6/H8/H12 do H1, W1 e MN do D1 — com a mesma
 * agregação do cliente (`agregarVelas`, alinhada à época UTC) e, para a semana e o mês, alinhada
 * ao CALENDÁRIO (segunda-feira 00:00 UTC; dia 1 00:00 UTC), que a época não alinha (o dia 0 Unix
 * foi uma quinta). O tecto de velas por pedido é o do nativo (MAX_VELAS): um H12 dá no máximo
 * MAX_VELAS/12 velas.
 *
 * ── Quantidade ────────────────────────────────────────────────────────────────────────────────
 * O MTM Sensei precisa de ~3000 velas (DEMA 238 aquece em 474 barras, estrutura e estatísticas
 * pedem história).
 *
 * ── Cache ─────────────────────────────────────────────────────────────────────────────────────
 * LRU em memória por instância (30 s) + pedidos em curso partilhados: dez pessoas no ouro com o
 * Sensei ligado não são trinta pedidos. A rota junta `Cache-Control` para a CDN.
 *
 * ── MetaApi (só com a chave) ──────────────────────────────────────────────────────────────────
 * A conta de leitura é de OUTRA corretora e não conhece «XAUUSD.s»: o nome a pedir resolve-se
 * (canónico → `simbolo_fonte` → `candidatosDeTicker` → lista da conta por `rankedBrokerSymbols`),
 * e só serve se a vela mais recente tiver menos de ~4 dias. Dá no máximo 1000 velas por pedido e
 * pagina para trás.
 */

export { DERIVACAO, TIMEFRAMES_GRAFICO, TF_NATIVOS, inicioCalendario, inicioDaVela, tfValido } from '@/lib/webtrader/timeframes'

/** Agrega as velas do nativo no timeframe derivado (`tf` nativo: devolve-as tal como vêm). */
export function derivarVelas(velas: VelaOHLCV[], tf: string): VelaOHLCV[] {
  return DERIVACAO[tf] ? agregarNoTimeframe(velas, tf) : velas
}

export const TF_METAAPI: Record<string, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '1h', H4: '4h', D1: '1d' }
const TF_SEG: Record<string, number> = { M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 }

/** A MetaApi só entra nas velas com esta chave (a mesma do motor do VPS). */
export const metaApiNasVelas = () => process.env.MOTOR_PRECOS_METAAPI === '1' && Boolean(process.env.METAAPI_TOKEN)

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
  /** volume (ticks/negócios da fonte; 0 quando não vem) — o Sensei usa-o no volume e no order flow */
  v: number
}

export interface RespostaVelas {
  symbol: string
  tf: string
  velas: VelaOHLCV[]
  fonte: 'metaapi' | 'binance' | 'yahoo' | null
  /** o nome que efetivamente serviu (XAUUSD em vez de XAUUSD.s na MetaApi; GC=F/PAXGUSDT nas reservas) */
  simboloFonte?: string
  /** fator aplicado às velas da reserva para as pôr ao nosso nível (1 = mesmo nível) */
  reescala?: number
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
    // Lista PARTILHADA com a execução (tabela metaapi_simbolos_cache): as contas provider são as
    // mesmas que executam o Premium, e cada getSymbols (500 créditos) sai da quota do token inteiro.
    lista = await simbolosPartilhados(conta, async () => {
      const r = await pedir(`https://mt-client-api-v1.${regiao}.agiliumtrade.ai/users/current/accounts/${conta}/symbols`, token)
      if (!r) return []
      if (!r.ok) throw Object.assign(new Error(await r.text().catch(() => `HTTP ${r.status}`)), { status: r.status })
      const j = await r.json().catch(() => [])
      return Array.isArray(j) ? j.map(String) : []
    }).catch(() => [] as string[])
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
  // O canónico primeiro (2026-09): as contas de leitura são de OUTRA corretora, e um nome que não
  // existe lá (XAUUSD.s) só falha ao fim de ~5 s (500 «unexpected error» da MetaApi). Com o `.s` à
  // frente, cada símbolo novo esperava esses 5 s antes de poder usar o XAUUSD que respondera em 0,2 s.
  // Um canónico «morto» (US30 com a última vela em 2024) não passa no `serve` e segue-se para o resto.
  add(symbol)
  add(fonteCatalogo)
  for (const c of candidatosDeTicker(symbol)) add(c)
  if (fonteCatalogo) for (const c of candidatosDeTicker(fonteCatalogo)) add(c)

  // Várias contas provider costumam ser da mesma corretora: tentam-se por ordem e pára-se na 1.ª que serve.
  // Os candidatos de uma conta testam-se em PARALELO (cada «não existe» custa um pedido) e ganha o
  // primeiro NA ORDEM de preferência que sirva — não o que responder primeiro. Mas não se espera pelos
  // lentos de trás: assim que o candidato i serve e todos os anteriores já falharam, está decidido.
  const primeiroQueServe = (conta: string, nomes: string[]) => new Promise<{ conta: string; nome: string } | null>((resolver) => {
    if (!nomes.length) return resolver(null)
    const estado: Array<boolean | undefined> = nomes.map(() => undefined)
    let feito = false
    const decidir = () => {
      if (feito) return
      for (let i = 0; i < estado.length; i++) {
        if (estado[i] === undefined) return
        if (estado[i]) { feito = true; return resolver({ conta, nome: nomes[i] }) }
      }
      feito = true
      resolver(null)
    }
    nomes.forEach((n, i) => {
      serve(conta, n, tf, token).catch(() => false).then((ok) => { estado[i] = ok; decidir() })
    })
  })
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
  const d = DERIVACAO[tf]
  if (d) {
    // Derivado: pede-se o nativo com velas que cheguem (+1 para a primeira não sair cortada) e agrega-se.
    const base = await obterVelas(symbol, d.de, Math.min(MAX_VELAS, (Math.max(20, Math.floor(limite) || 300) + 1) * d.fator), ate)
    const velas = derivarVelas(base.velas, tf)
    // A primeira vela agregada pode estar incompleta (o nativo começou a meio dela): sai, se sobrar.
    const inteiras = velas.length > 1 ? velas.slice(1) : velas
    return { ...base, tf, velas: inteiras.slice(-Math.max(20, Math.floor(limite) || 300)) }
  }
  const lim = Math.min(MAX_VELAS, Math.max(20, Math.floor(limite) || 300))
  // Janela grande até agora = corpo (cache longa) + cauda recente (cache curta), colados por tempo.
  if (ate == null && lim > JANELA_RECENTE) {
    const [corpo, cauda] = await Promise.all([
      comCache(CACHE_CORPO, symbol, tf, lim, null),
      comCache(CACHE_RESPOSTAS, symbol, tf, JANELA_RECENTE, null),
    ])
    if (!corpo.velas.length) return cauda.velas.length ? cauda : corpo
    if (!cauda.velas.length) return corpo
    // Fontes diferentes (corpo de uma referência, cauda de outra) não se colam: níveis podem não bater.
    if (corpo.fonte !== cauda.fonte || corpo.simboloFonte !== cauda.simboloFonte) return corpo
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

// ─────────────────────────────────────────────────────────────────────────────
// MetaApi com prazo e disjuntor
// ─────────────────────────────────────────────────────────────────────────────

/** A MetaApi (só com MOTOR_PRECOS_METAAPI=1, último recurso) tem isto para dar velas. */
export const PRAZO_METAAPI_MS = 3_000
let falhasMetaSeguidas = 0
let metaPausadaAte = 0

async function velasMetaApi(symbol: string, tf: string, lim: number, ate: number | null): Promise<RespostaVelas> {
  const vazio = (motivo: string): RespostaVelas => ({ symbol, tf, velas: [], fonte: null, motivo })
  const token = process.env.METAAPI_TOKEN
  if (!token) return vazio('sem histórico MetaApi configurado')
  let fonte = await resolverFonteHistorico(symbol, tf)
  if (!fonte) return vazio('histórico MetaApi indisponível')
  let velas = await recolher(fonte.conta, fonte.nome, tf, lim, ate, token)
  if (velas == null) {
    // O nome em cache deixou de servir (conta desligada, símbolo retirado): resolve outra vez, uma vez.
    RESOLVIDOS.delete(symbol)
    fonte = await resolverFonteHistorico(symbol, tf, { ignorarCache: true })
    velas = fonte ? await recolher(fonte.conta, fonte.nome, tf, lim, ate, token) : null
  }
  if (!fonte || velas == null) return vazio('histórico MetaApi indisponível')
  return { symbol, tf, velas, fonte: 'metaapi', simboloFonte: fonte.nome }
}

async function velasMetaApiComPrazo(symbol: string, tf: string, lim: number, ate: number | null): Promise<RespostaVelas | null> {
  // A MetaApi não entra nas velas sem a chave (regra do dono, 05/10) — nem um pedido.
  if (!metaApiNasVelas()) return null
  if (Date.now() < metaPausadaAte) return { symbol, tf, velas: [], fonte: null, motivo: 'MetaApi em pausa (falhas seguidas)' }
  let prazo: ReturnType<typeof setTimeout> | undefined
  const r = await Promise.race([
    velasMetaApi(symbol, tf, lim, ate).catch(() => null),
    new Promise<null>((res) => { prazo = setTimeout(() => res(null), PRAZO_METAAPI_MS) }),
  ])
  if (prazo) clearTimeout(prazo)
  if (r?.velas.length) { falhasMetaSeguidas = 0; return r }
  if (++falhasMetaSeguidas >= 3) { metaPausadaAte = Date.now() + 2 * 60_000; falhasMetaSeguidas = 0 }
  return r ?? { symbol, tf, velas: [], fonte: null, motivo: 'MetaApi sem resposta em 3 s' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reservas públicas (Binance/Yahoo) — lib/mercado
// ─────────────────────────────────────────────────────────────────────────────

const INFO_CATALOGO = new LRU<{ classe: string | null; moeda: string | null; digits: number | null }>(2048, 6 * 3600_000)
async function infoCatalogo(symbol: string) {
  const g = INFO_CATALOGO.get(symbol)
  if (g) return g
  const { data } = await getSupabaseAdmin().from('funded_symbols').select('classe, moeda_lucro, digits').eq('symbol', symbol).maybeSingle()
  const info = { classe: data?.classe ? String(data.classe) : null, moeda: data?.moeda_lucro ? String(data.moeda_lucro) : null, digits: data?.digits != null ? Number(data.digits) : null }
  INFO_CATALOGO.set(symbol, info)
  return info
}

/** O último preço nosso (meio do spread) e quando — a âncora da reescala. 60 s por instância. */
const ANCORAS = new LRU<Ancora | 'nada'>(512, 60_000)
async function ancoraDe(symbol: string): Promise<Ancora | null> {
  const g = ANCORAS.get(symbol)
  if (g) return g === 'nada' ? null : g
  const { data } = await getSupabaseAdmin().from('funded_precos').select('bid, ask, em').eq('symbol', symbol).maybeSingle()
  const bid = Number(data?.bid), ask = Number(data?.ask), em = data?.em ? Date.parse(String(data.em)) : NaN
  const a = bid > 0 && ask > 0 && Number.isFinite(em) ? { preco: (bid + ask) / 2, emSeg: Math.floor(em / 1000) } : null
  ANCORAS.set(symbol, a ?? 'nada')
  return a
}

/** Fator da âncora para esta referência: primeiro pelas próprias velas; se não a cobrirem, um pedido à volta dela. */
async function fatorPara(ref: RefMercado, velas: VelaOHLCV[], ancora: Ancora | null, tfSeg: number): Promise<number | null> {
  if (!ancora) return null
  const f = fatorAncorado(velas, ancora, Math.max(3 * tfSeg, 20 * 60))
  if (f != null) return f
  const volta = await velasAVoltaDe(ref, ancora.emSeg)
  return fatorAncorado(volta.velas, ancora, 3 * 3600)
}

/**
 * Velas das referências públicas (a fonte principal desde 05/10). Tenta as referências do plano por ordem; uma referência fora do
 * nosso nível só serve reescalada (fator válido), e uma «ao mesmo nível» cujo fator saia dos ±10 %
 * é outro instrumento e salta-se. Sem âncora nenhuma, a primeira série serve tal como vem (dito em `motivo`).
 */
export async function velasDeReserva(symbol: string, tf: string, lim: number, ate: number | null): Promise<RespostaVelas> {
  const vazio = (motivo: string): RespostaVelas => ({ symbol, tf, velas: [], fonte: null, motivo })
  const [info, ancora] = await Promise.all([
    infoCatalogo(symbol).catch(() => ({ classe: null, moeda: null, digits: null })),
    ancoraDe(symbol).catch(() => null),
  ])
  const plano = referenciasPara(symbol, info.classe, info.moeda)
  if (!plano.length) return vazio('sem referência pública para este símbolo')
  const tfSeg = TF_SEG[tf] ?? 300
  let semAncora: RespostaVelas | null = null
  for (const ref of plano) {
    // Referência 24/7 (PAXG) para um mercado com fim de semana: pede-se a mais o que o filtro vai tirar.
    const pedir = ref.soHorasMercado && tf !== 'D1' ? Math.min(MAX_VELAS, Math.min(lim * 3, Math.ceil(lim * 1.45) + Math.ceil(2 * 86400 / tfSeg))) : lim
    let velas: VelaOHLCV[] = await buscarVelasRef(ref, tf, pedir, ate)
    if (ref.soHorasMercado) velas = soAberto(velas, (t) => isMarketOpen(symbol, new Date(t * 1000)).open).slice(-lim)
    if (velas.length < Math.min(20, lim)) continue
    const fonte = ref.kind === 'yahoo' ? 'yahoo' as const : 'binance' as const
    const f = await fatorPara(ref, velas, ancora, tfSeg)
    if (ref.sameLevel) {
      if (f != null && !fatorValido(f)) continue // o nível não bate: instrumento errado
      return { symbol, tf, velas: reescalar(velas, 1, info.digits ?? undefined), fonte, simboloFonte: ref.symbol, reescala: 1 }
    }
    if (fatorValido(f)) {
      return { symbol, tf, velas: reescalar(velas, f, info.digits ?? undefined), fonte, simboloFonte: ref.symbol, reescala: Number(f.toFixed(6)) }
    }
    if (f == null && !semAncora) semAncora = { symbol, tf, velas: reescalar(velas, 1, info.digits ?? undefined), fonte, simboloFonte: ref.symbol, reescala: 1, motivo: 'nível da referência (sem preço nosso para reescalar)' }
  }
  return semAncora ?? vazio('reservas sem velas')
}

async function comCache(cache: LRU<RespostaVelas>, symbol: string, tf: string, lim: number, ate: number | null): Promise<RespostaVelas> {
  const chave = `${cache === CACHE_CORPO ? 'corpo' : 'r'}:${symbol}:${tf}:${lim}:${ate ?? 'agora'}`
  // Um corpo vazio fica na cache curta (ver abaixo).
  const guardado = cache.get(chave) ?? (cache === CACHE_CORPO ? CACHE_RESPOSTAS.get(chave) : undefined)
  if (guardado) return guardado
  const emCurso = EM_CURSO.get(chave)
  if (emCurso) return emCurso

  const trabalho = (async (): Promise<RespostaVelas> => {
    if (!TF_METAAPI[tf]) return { symbol, tf, velas: [], fonte: null, motivo: 'timeframe inválido' }
    // Referências públicas primeiro; a MetaApi só se a chave a ligar E as referências vierem vazias.
    const reserva = await velasDeReserva(symbol, tf, lim, ate).catch((): RespostaVelas => ({ symbol, tf, velas: [], fonte: null, motivo: 'reservas falharam' }))
    if (reserva.velas.length) return reserva
    const meta = await velasMetaApiComPrazo(symbol, tf, lim, ate)
    if (meta?.velas.length) return meta
    return { ...reserva, motivo: meta?.motivo ? `${reserva.motivo ?? 'sem reserva'}; ${meta.motivo}` : reserva.motivo }
  })()

  EM_CURSO.set(chave, trabalho)
  try {
    const r = await trabalho
    // Respostas vazias guardam-se só 30 s (na cache curta): um símbolo sem histórico não martela as
    // fontes, mas também não fica 10 min sem gráfico quando elas voltarem.
    if (r.velas.length || cache !== CACHE_CORPO) cache.set(chave, r)
    else CACHE_RESPOSTAS.set(chave, r)
    return r
  } finally {
    EM_CURSO.delete(chave)
  }
}

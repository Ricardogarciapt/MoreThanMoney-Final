/**
 * MOTOR DE SIMULAÇÃO DO MTM FUNDED — o processo longo do VPS (M2).
 *
 * O site executa as ordens a mercado (com o último preço que este motor escreveu). Tudo o que
 * acontece SEM o aluno carregar num botão acontece aqui:
 *
 *  · escreve os preços (funded_precos) — é a fonte única de preço do site e do WebTrader;
 *  · fecha por SL/TP, por stop-out, e executa as pendentes quando o preço lá chega;
 *  · mede a equity e a margem de cada conta e escreve-as (no máximo 1× por 2s por conta);
 *  · aplica as regras do programa (ou do torneio) — quebra ou passagem — e avisa o site, que é
 *    quem manda os emails, emite certificados e abre a fase seguinte;
 *  · vira o dia da corretora às 22:00 UTC (âncora da perda diária = saldo de fecho);
 *  · tira fotografias de equity (5 em 5 min com posições; 1 por dia para todas);
 *  · mantém `mtm_trading_accounts.metricas` na MESMA forma que o cron do MT5 escreve — o painel,
 *    a classificação e os certificados lêem as duas contas da mesma maneira (migração híbrida).
 *
 * ── MOTOR_ESCRITA ────────────────────────────────────────────────────────────
 *   0 → lê preços e contas, decide, e só ESCREVE NO LOG o que faria. Nada na base, nada no site.
 *   1 → a sério.
 * Arranca-se sempre a 0 primeiro: um motor novo a fechar posições de alunos por um erro de
 * leitura é o erro que não se desfaz.
 *
 * ── O QUE NUNCA SE FAZ ───────────────────────────────────────────────────────
 * Nunca se decide o fim de uma conta (quebra, stop-out, passagem) com uma fotografia que pode
 * estar a meio de uma escrita do site: fechar uma posição no site são duas escritas (posição e
 * saldo), e lê-las entre uma e outra dá uma equity que não existe. Antes de uma decisão dessas, a
 * conta relê-se até duas leituras seguidas das posições baterem certo (`lerContaConsistente`).
 *
 * Estado reconstruível 100% da base: o que está em memória é cache. Reiniciar é seguro.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isMarketOpen } from '../../lib/mtmcopy/market-hours'
import { rankedBrokerSymbols } from '../../lib/mtmcopy/symbol-resolver'
import { avaliarConta, type RegrasConta } from '../../lib/mtmfunded/regras'
import { estadoDaConta, type MapaPrecos, type Simbolo } from '../../lib/mtmfunded/simulado/matematica'
import {
  avaliarTick,
  diaCorretora,
  emSessao,
  lucroPorDiaDe,
  resultadoSemIdeiasPct,
  type ContaSim,
  type Decisoes,
  type FechoHistorico,
  type OrdemSim,
  type Parcial,
  type PosicaoSim,
  type Sessoes,
} from './avaliacao'
import { alertaDispara, gestaoDaLinha, temGestao, type AlertaPreco } from '../../lib/mtmfunded/simulado/avancadas'
import { FonteRpc, FonteStreaming, type FontePrecos, type Tick } from './feed'
import { iniciarEspelho, latenciaSeguidoras, simbolosDoEspelho } from './espelho-estrategias'
import { iniciarEspelhoProvider, simbolosDoProvider, type ControloProvider } from './espelho-provider'
import { feedTradeLockerDoAmbiente, type ComparadorTradeLocker } from './feed-tradelocker'
import { registarErroMetaApi } from './metaapi-partilhada'
import {
  assinaturaMetricas,
  precisaDeEscreverMetricas,
  ultimoPontoDoHistorico,
  type UltimaEscritaMetricas,
} from './metricas-escrita'

// ── configuração ──────────────────────────────────────────────────────────────
const env = (k: string, obrigatoria = true) => {
  const v = process.env[k]?.trim()
  if (!v && obrigatoria) {
    console.error(`[motor] falta a variável ${k}`)
    process.exit(2)
  }
  return v ?? ''
}
const CFG = {
  supabaseUrl: env('SUPABASE_URL', false) || env('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  metaapiToken: env('METAAPI_TOKEN'),
  contaPrecos: env('METAAPI_CONTA_PRECOS', false) || '530d2e07-b391-440f-bc6e-f4c2a224057b',
  segredo: env('LMS_CAPTION_WORKER_SECRET', false),
  apiBase: (env('MTM_API_BASE', false) || 'https://www.morethanmoney.pt').replace(/\/+$/, ''),
  escrita: env('MOTOR_ESCRITA', false) === '1',
  intervaloMs: Number(env('MOTOR_INTERVALO_MS', false) || 1000),
  /** Intervalo das cotações dos símbolos geridos por tick no espelho provider. */
  intervaloRapidoMs: Number(env('MOTOR_INTERVALO_RAPIDO_MS', false) || 250),
  /** Desvio da hora do servidor da corretora até o primeiro tick o dizer (PU Prime: UTC+3 no verão). */
  desvioInicialMin: Number(env('MOTOR_DESVIO_CORRETORA_MIN', false) || 180),
}

/** Símbolos sempre subscritos: o WebTrader abre neles, e o BTC (24/7) é o pulso do feed. */
const BASE = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US30', 'NAS100', 'BTCUSD']

const db: SupabaseClient = createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)
const seco = (...a: unknown[]) => log('[seco]', ...a)
const arred = (x: number) => Math.round(x * 100) / 100

// ── estado em memória (cache da base) ─────────────────────────────────────────
interface SimboloMotor extends Simbolo {
  simbolo_fonte: string
  sessoes: Sessoes | null
}
interface ContaLinha {
  id: string
  user_id: string | null
  tipo: string
  tournament_id: string | null
  program_id: string | null
  saldo_inicial: number
  alavancagem: number
  sim_saldo: number
  sim_equity: number | null
  sim_margem: number
  sim_ancora_dia: number | null
  sim_ancora_em: string | null
  sim_pico_equity: number | null
  sim_dias_negociados: number
  created_at: string
  fase: string | null
  fase_concluida: string | null
  /** metricas.analise = 'true' → conta de ANÁLISE (segue uma estratégia): regras não a quebram. */
  analise: string | null
}

const simbolos = new Map<string, SimboloMotor>()
const canonicoDaFonte = new Map<string, string>()
const precos: MapaPrecos = {}
const precoEm = new Map<string, number>()
const precosPorEscrever = new Set<string>()
let desvioMin = CFG.desvioInicialMin
/** Símbolos negociáveis da corretora, lidos do feed — para corrigir `simbolo_fonte` que não exista. */
let daCorretora: string[] = []
let ultimoTickEm = 0
let ticksNoMinuto = 0
let provider: ControloProvider | null = null
let feedTl: ComparadorTradeLocker | null = null

const contas = new Map<string, ContaLinha>()
const posicoesDe = new Map<string, PosicaoSim[]>()
const ordensDe = new Map<string, OrdemSim[]>()
/** símbolo → contas a reavaliar quando ele mexe (posições, ordens e conversões para USD). */
const interessados = new Map<string, Set<string>>()
const sujas = new Set<string>()
/** A conta foi escrita pelo motor a este instante: leituras começadas antes disso estão velhas. */
const escritaLocalEm = new Map<string, number>()
const ultimaEquity = new Map<string, { em: number; equity: number; margem: number }>()
const ultimoSnapshot = new Map<string, number>()
const ultimasMetricas = new Map<string, UltimaEscritaMetricas>()
const fechosDe = new Map<string, FechoHistorico[]>()
const eventoEnviadoEm = new Map<string, number>()
const pedidos = new Set<string>()
const ultimoTrailingEm = new Map<string, number>()
/** Alertas de preço activos (funded_alertas), por símbolo. */
const alertasPorSimbolo = new Map<string, Array<AlertaPreco & { user_id: string }>>()
const alertasEmEnvio = new Set<string>()
const ultimoSecoEm = new Map<string, number>()

const programas = new Map<string, { regras: RegrasConta; saldo: number; fases: number }>()
const torneios = new Map<string, { regras: RegrasConta; comeca_em: string | null }>()

// ── catálogo ──────────────────────────────────────────────────────────────────
async function carregarCatalogo(): Promise<void> {
  const linhas: Record<string, unknown>[] = []
  // São mais de mil: o PostgREST devolve 1000 de cada vez.
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from('funded_symbols')
      .select('*')
      .eq('ativo', true)
      .range(de, de + 999)
    if (error) throw new Error(`funded_symbols: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  simbolos.clear()
  canonicoDaFonte.clear()
  for (const r of linhas) {
    const s: SimboloMotor = {
      symbol: String(r.symbol),
      classe: r.classe as Simbolo['classe'],
      moeda_lucro: (r.moeda_lucro as string) ?? null,
      digits: Number(r.digits),
      contract_size: Number(r.contract_size),
      pip_size: Number(r.pip_size),
      spread_pontos: Number(r.spread_pontos),
      comissao_lote: Number(r.comissao_lote),
      volume_min: Number(r.volume_min),
      volume_step: Number(r.volume_step),
      volume_max: Number(r.volume_max),
      alavancagem_max: Number(r.alavancagem_max),
      simbolo_fonte: String(r.simbolo_fonte),
      sessoes: (r.sessoes as Sessoes) ?? null,
    }
    /**
     * `simbolo_fonte` que a corretora não tem (o seed antigo de 061 dizia «XAUUSD», a PU Prime
     * chama-lhe «XAUUSD.s»): resolve-se pelo mesmo resolvedor do MTM Copy em vez de ficar sem
     * preço. O catálogo gerado pelo script já traz o nome certo; isto é a rede por baixo dele.
     */
    if (daCorretora.length && !daCorretora.includes(s.simbolo_fonte)) {
      const melhor = rankedBrokerSymbols(s.symbol, daCorretora)[0]
      if (melhor) s.simbolo_fonte = melhor
    }
    simbolos.set(s.symbol, s)
    canonicoDaFonte.set(s.simbolo_fonte, s.symbol)
  }

  const { data: progs } = await db.from('mtm_funded_programs').select('id, regras, saldo, fases')
  programas.clear()
  for (const p of progs ?? []) {
    programas.set(p.id as string, { regras: (p.regras ?? {}) as RegrasConta, saldo: Number(p.saldo), fases: Number(p.fases) })
  }
  const { data: tors } = await db.from('mtm_tournaments').select('id, regras, comeca_em')
  torneios.clear()
  for (const t of tors ?? []) {
    torneios.set(t.id as string, { regras: (t.regras ?? {}) as RegrasConta, comeca_em: (t.comeca_em as string) ?? null })
  }
}

/** Símbolo que converte a moeda `m` para USD (XXXUSD ou USDXXX), se existir no catálogo. */
function simboloDeConversao(m: string): string | null {
  const moeda = m === 'GBX' ? 'GBP' : m
  if (moeda === 'USD') return null
  if (simbolos.has(`${moeda}USD`)) return `${moeda}USD`
  if (simbolos.has(`USD${moeda}`)) return `USD${moeda}`
  return null
}

function moedaDe(s: Simbolo): string {
  if (s.moeda_lucro) return s.moeda_lucro.toUpperCase()
  return /^[A-Z]{6}$/.test(s.symbol) ? s.symbol.slice(3) : 'USD'
}

// ── contas, posições e ordens ─────────────────────────────────────────────────
/** Colunas da gestão automática (migração 072) — iguais nas posições e nas ordens. */
const COLS_GESTAO = 'trailing_distancia, trailing_ativacao, be_gatilho, be_offset, be_no_tp1, tps'
const COLS_POSICAO_BASE = 'id, account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, swap, origem'
const COLS_ORDEM_BASE = 'id, account_id, symbol, direcao, tipo, volume, preco, sl, tp, origem, expira_em'
/**
 * Com a 072 por aplicar as colunas da gestão não existem e a leitura inteira falhava (o motor não
 * arrancava). À primeira falha por coluna em falta passa-se às colunas de base: tudo continua a
 * funcionar sem ordens avançadas (a gestão do espelho provider vive em memória e não precisa delas).
 */
let tem072 = true
let COLS_POSICAO = `${COLS_POSICAO_BASE}, ${COLS_GESTAO}, be_feito, volume_inicial`
let COLS_ORDEM = `${COLS_ORDEM_BASE}, oco_grupo, ${COLS_GESTAO}`
function semColunas072(msg: string | undefined): boolean {
  if (!tem072 || !msg || !/column .* does not exist/i.test(msg)) return false
  tem072 = false
  COLS_POSICAO = COLS_POSICAO_BASE
  COLS_ORDEM = COLS_ORDEM_BASE
  log('[motor] migração 072 por aplicar — leio posições/ordens sem as colunas da gestão automática')
  return true
}
const COLUNAS_CONTA =
  'id, user_id, tipo, tournament_id, program_id, saldo_inicial, alavancagem, sim_saldo, sim_equity, sim_margem, ' +
  'sim_ancora_dia, sim_ancora_em, sim_pico_equity, sim_dias_negociados, created_at, fase:metricas->>fase, fase_concluida:metricas->>faseConcluida, analise:metricas->>analise'

function normalizarConta(r: Record<string, unknown>): ContaLinha {
  return {
    ...(r as unknown as ContaLinha),
    saldo_inicial: Number(r.saldo_inicial ?? 0),
    alavancagem: Number(r.alavancagem ?? 100),
    sim_saldo: Number(r.sim_saldo ?? r.saldo_inicial ?? 0),
    sim_equity: r.sim_equity == null ? null : Number(r.sim_equity),
    sim_margem: Number(r.sim_margem ?? 0),
    sim_ancora_dia: r.sim_ancora_dia == null ? null : Number(r.sim_ancora_dia),
    sim_pico_equity: r.sim_pico_equity == null ? null : Number(r.sim_pico_equity),
    sim_dias_negociados: Number(r.sim_dias_negociados ?? 0),
  }
}
function normalizarPosicao(r: Record<string, unknown>): PosicaoSim {
  return {
    id: String(r.id), account_id: String(r.account_id), symbol: String(r.symbol), direcao: r.direcao as 'buy' | 'sell',
    volume: Number(r.volume), preco_entrada: Number(r.preco_entrada), sl: r.sl == null ? null : Number(r.sl),
    tp: r.tp == null ? null : Number(r.tp), comissao: Number(r.comissao ?? 0), swap: Number(r.swap ?? 0),
    origem: (r.origem as PosicaoSim['origem']) ?? 'manual',
    gestao: gestaoOuNull(r),
  }
}
function gestaoOuNull(r: Record<string, unknown>) {
  const g = gestaoDaLinha(r)
  return temGestao(g) ? g : null
}
function normalizarOrdem(r: Record<string, unknown>): OrdemSim {
  return {
    id: String(r.id), account_id: String(r.account_id), symbol: String(r.symbol), direcao: r.direcao as 'buy' | 'sell',
    tipo: r.tipo as 'limit' | 'stop', volume: Number(r.volume), preco: Number(r.preco),
    sl: r.sl == null ? null : Number(r.sl), tp: r.tp == null ? null : Number(r.tp),
    origem: (r.origem as OrdemSim['origem']) ?? 'manual', expira_em: (r.expira_em as string) ?? null,
    oco_grupo: (r.oco_grupo as string) ?? null, gestao: gestaoOuNull(r),
  }
}

async function carregarContas(): Promise<void> {
  const inicio = Date.now()
  const { data: cs, error } = await db
    .from('mtm_trading_accounts')
    .select(COLUNAS_CONTA)
    .eq('motor', 'sim')
    .eq('estado', 'ativa')
    .limit(5000)
  if (error) throw new Error(`contas: ${error.message}`)
  const ids = (cs ?? []).map((c) => (c as unknown as { id: string }).id)

  const novasPos = new Map<string, PosicaoSim[]>()
  const novasOrd = new Map<string, OrdemSim[]>()
  if (ids.length) {
    const [{ data: ps, error: e1 }, { data: os, error: e2 }] = await Promise.all([
      db.from('funded_positions').select(COLS_POSICAO).eq('estado', 'aberta').in('account_id', ids).limit(20000),
      db.from('funded_orders').select(COLS_ORDEM).eq('estado', 'pendente').in('account_id', ids).limit(20000),
    ])
    if (e1 || e2) {
      if (semColunas072(e1?.message) || semColunas072(e2?.message)) return carregarContas()
      throw new Error(`posições/ordens: ${(e1 ?? e2)?.message}`)
    }
    for (const r of (ps ?? []) as unknown as Record<string, unknown>[]) {
      const p = normalizarPosicao(r)
      novasPos.set(p.account_id, [...(novasPos.get(p.account_id) ?? []), p])
    }
    for (const r of (os ?? []) as unknown as Record<string, unknown>[]) {
      const o = normalizarOrdem(r)
      novasOrd.set(o.account_id, [...(novasOrd.get(o.account_id) ?? []), o])
    }
  }

  const vistas = new Set<string>()
  for (const r of cs ?? []) {
    const c = normalizarConta(r as unknown as Record<string, unknown>)
    vistas.add(c.id)
    // Leitura começada antes de uma escrita nossa: a memória está mais certa do que ela.
    if ((escritaLocalEm.get(c.id) ?? 0) >= inicio) continue
    const antes = contas.get(c.id)
    contas.set(c.id, c)
    posicoesDe.set(c.id, novasPos.get(c.id) ?? [])
    ordensDe.set(c.id, novasOrd.get(c.id) ?? [])
    if (!antes || antes.sim_saldo !== c.sim_saldo) sujas.add(c.id)
  }
  for (const id of [...contas.keys()]) {
    if (!vistas.has(id)) {
      contas.delete(id)
      posicoesDe.delete(id)
      ordensDe.delete(id)
    }
  }
  reconstruirInteressados()
}

function reconstruirInteressados(): void {
  interessados.clear()
  const juntar = (sym: string, conta: string) => {
    if (!interessados.has(sym)) interessados.set(sym, new Set())
    interessados.get(sym)!.add(conta)
  }
  for (const [id] of contas) {
    const itens: Array<{ symbol: string }> = [...(posicoesDe.get(id) ?? []), ...(ordensDe.get(id) ?? [])]
    for (const it of itens) {
      juntar(it.symbol, id)
      const s = simbolos.get(it.symbol)
      const conv = s ? simboloDeConversao(moedaDe(s)) : null
      if (conv) juntar(conv, id)
    }
  }
}

/**
 * Relê UMA conta até a fotografia bater certo: posições, conta, posições outra vez — se as duas
 * leituras das posições forem iguais, o saldo lido no meio corresponde a elas. É o que impede
 * uma quebra decidida entre as duas escritas de um fecho manual no site.
 */
async function lerContaConsistente(id: string): Promise<boolean> {
  const chave = (ps: Record<string, unknown>[] | null) =>
    (ps ?? []).map((p) => `${p.id}:${p.volume}:${p.sl}:${p.tp}:${JSON.stringify(p.tps ?? null)}`).sort().join('|')
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const cols = COLS_POSICAO
    const { data: a, error: ea } = await db.from('funded_positions').select(cols).eq('account_id', id).eq('estado', 'aberta')
    const { data: c } = await db.from('mtm_trading_accounts').select(`${COLUNAS_CONTA}, estado`).eq('id', id).maybeSingle()
    const { data: o, error: eo } = await db.from('funded_orders').select(COLS_ORDEM).eq('account_id', id).eq('estado', 'pendente')
    const { data: b, error: eb } = await db.from('funded_positions').select(cols).eq('account_id', id).eq('estado', 'aberta')
    // Uma leitura falhada NÃO é «sem posições»: sem isto, duas leituras nulas batiam certo e a conta ficava vazia.
    if (ea || eo || eb) { semColunas072((ea ?? eo ?? eb)?.message); return false }
    if (!c || (c as unknown as { estado: string }).estado !== 'ativa') {
      contas.delete(id)
      return false
    }
    if (chave(a as unknown as Record<string, unknown>[]) === chave(b as unknown as Record<string, unknown>[])) {
      contas.set(id, normalizarConta(c as unknown as Record<string, unknown>))
      posicoesDe.set(id, ((b ?? []) as unknown as Record<string, unknown>[]).map(normalizarPosicao))
      ordensDe.set(id, ((o ?? []) as unknown as Record<string, unknown>[]).map(normalizarOrdem))
      return true
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

async function carregarFechos(): Promise<void> {
  const ids = [...contas.keys()]
  fechosDe.clear()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from('funded_positions')
      .select('account_id, pnl, comissao, fechada_em, origem')
      .eq('estado', 'fechada')
      .in('account_id', ids.slice(i, i + 200))
      .limit(50000)
    for (const r of data ?? []) {
      const k = r.account_id as string
      fechosDe.set(k, [...(fechosDe.get(k) ?? []), r as unknown as FechoHistorico])
    }
  }
}

// ── preços ────────────────────────────────────────────────────────────────────
function aoTick(t: Tick): void {
  const sym = canonicoDaFonte.get(t.fonte)
  if (!sym) return
  const antes = precos[sym]
  if (antes && antes.bid === t.bid && antes.ask === t.ask) return
  precos[sym] = { symbol: sym, bid: t.bid, ask: t.ask }
  precoEm.set(sym, t.em.getTime())
  precosPorEscrever.add(sym)
  if (t.desvioMin != null) desvioMin = t.desvioMin
  ultimoTickEm = Date.now()
  ticksNoMinuto++
  for (const c of interessados.get(sym) ?? []) sujas.add(c)
  // Gestão do espelho provider NO PRÓPRIO tick (BE, trailing, parciais).
  provider?.aoTick(sym, t.em.getTime())
}

/** Preço de recurso (feed secundário) já em símbolo canónico: só entra se o principal estiver velho. */
function aoTickRecurso(sym: string, bid: number, ask: number, em: number): void {
  if (!simbolos.has(sym)) return
  const s = simbolos.get(sym)!
  aoTick({ fonte: s.simbolo_fonte, bid, ask, em: new Date(em), desvioMin: null })
}

/** Há fills neste símbolo agora? Precisa de preço e de mercado aberto (sessão da corretora). */
function negociavel(sym: string, agora: Date): boolean {
  if (!precos[sym]) return false
  const s = simbolos.get(sym)
  const sessao = emSessao(s?.sessoes, agora, desvioMin)
  if (sessao === false) return false
  if (sessao == null && !isMarketOpen(sym, agora).open) return false
  return true
}

async function escreverPrecos(): Promise<void> {
  if (!precosPorEscrever.size) return
  const linhas = [...precosPorEscrever].map((s) => ({
    symbol: s, bid: precos[s].bid, ask: precos[s].ask, em: new Date(precoEm.get(s) ?? Date.now()).toISOString(),
  }))
  precosPorEscrever.clear()
  if (!CFG.escrita) return
  const { error } = await db.from('funded_precos').upsert(linhas, { onConflict: 'symbol' })
  if (error) log('[precos] escrita falhou:', error.message)
}

async function carregarPedidos(): Promise<void> {
  const desde = new Date(Date.now() - 60_000).toISOString()
  const { data, error } = await db.from('funded_precos_pedidos').select('symbol').gte('pedido_em', desde).limit(500)
  pedidos.clear()
  if (error) return // antes da 064 a tabela não existe — não é razão para parar
  for (const r of data ?? []) pedidos.add(r.symbol as string)
}

function simbolosDesejados(): Set<string> {
  const canon = new Set<string>(BASE)
  for (const s of interessados.keys()) canon.add(s)
  for (const s of simbolosDoEspelho) canon.add(s)
  for (const s of simbolosDoProvider) canon.add(s)
  for (const s of alertasPorSimbolo.keys()) canon.add(s)
  for (const s of pedidos) {
    canon.add(s)
    const sm = simbolos.get(s)
    const conv = sm ? simboloDeConversao(moedaDe(sm)) : null
    if (conv) canon.add(conv)
  }
  const fontes = new Set<string>()
  for (const s of canon) {
    const sm = simbolos.get(s)
    if (sm) fontes.add(sm.simbolo_fonte)
  }
  return fontes
}

// ── alertas de preço (funded_alertas, migração 072) ─────────────────────────────
async function carregarAlertas(): Promise<void> {
  const { data, error } = await db.from('funded_alertas').select('id, user_id, symbol, condicao, preco').eq('ativo', true).limit(5000)
  if (error) return // antes da 072 a tabela não existe
  alertasPorSimbolo.clear()
  for (const r of data ?? []) {
    const a = { id: String(r.id), user_id: String(r.user_id), symbol: String(r.symbol), condicao: r.condicao as 'acima' | 'abaixo', preco: Number(r.preco) }
    alertasPorSimbolo.set(a.symbol, [...(alertasPorSimbolo.get(a.symbol) ?? []), a])
  }
}

/**
 * Um alerta dispara uma vez: marca-se na base com guarda (`ativo = true`) e só quem ganhou a escrita
 * pede ao site a notificação — dois motores (ou um reinício a meio) não mandam dois avisos.
 */
async function verificarAlertas(): Promise<void> {
  for (const [sym, lista] of alertasPorSimbolo) {
    const p = precos[sym]
    if (!p) continue
    for (const a of lista) {
      if (alertasEmEnvio.has(a.id) || !alertaDispara(a, p)) continue
      alertasEmEnvio.add(a.id)
      try {
        if (!CFG.escrita) {
          if (Date.now() - (ultimoSecoEm.get(`alerta:${a.id}`) ?? 0) > 60_000) {
            ultimoSecoEm.set(`alerta:${a.id}`, Date.now())
            seco(`alerta ${a.id.slice(0, 8)} ${sym} ${a.condicao} ${a.preco} dispararia @${p.bid}`)
          }
          continue
        }
        const { data } = await db.from('funded_alertas')
          .update({ ativo: false, disparado_em: new Date().toISOString(), preco_disparo: p.bid })
          .eq('id', a.id).eq('ativo', true).select('id')
        alertasPorSimbolo.set(sym, (alertasPorSimbolo.get(sym) ?? []).filter((x) => x.id !== a.id))
        if (!data?.length) continue
        log(`[alerta] ${sym} ${a.condicao} ${a.preco} @${p.bid}`)
        await fetch(`${CFG.apiBase}/api/mtmfunded/simulado/motor`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-caption-secret': CFG.segredo },
          body: JSON.stringify({ evento: 'alerta', alertaId: a.id }),
          signal: AbortSignal.timeout(20_000),
        }).catch((e) => log('[alerta] aviso ao site falhou:', e instanceof Error ? e.message : e))
      } finally {
        alertasEmEnvio.delete(a.id)
      }
    }
  }
}

// ── regras de cada conta ──────────────────────────────────────────────────────
function contaSim(c: ContaLinha): ContaSim {
  let regras: RegrasConta | null = null
  let inicioEm: string | null = c.created_at
  let objetivoPct = 0
  const torneio = Boolean(c.tournament_id)
  if (torneio) {
    const t = torneios.get(c.tournament_id as string)
    regras = t?.regras ?? null
    inicioEm = t?.comeca_em ?? c.created_at
  } else {
    let p = c.program_id ? programas.get(c.program_id) : undefined
    // Conta emitida sem programa: as regras do programa de UMA fase do mesmo tamanho (o caminho
    // difícil), como o cron do MT5 faz. Sem nenhum, não se avalia — nunca se inventam regras.
    if (!p) p = [...programas.values()].find((x) => x.fases === 1 && x.saldo === c.saldo_inicial)
    regras = p?.regras ?? null
    if (c.tipo === 'desafio' && regras && !c.fase_concluida) {
      // A fase 2 tem objectivo próprio (objetivo_fase2_pct) quando o programa o publica.
      const r = regras as RegrasConta & { objetivo_fase2_pct?: number }
      objetivoPct = Number(c.fase) === 2 && r.objetivo_fase2_pct ? Number(r.objetivo_fase2_pct) : Number(r.objetivo_pct ?? 0)
    }
  }
  if (regras && !(Number(regras.perda_diaria_pct) > 0 && Number(regras.perda_maxima_pct) > 0)) regras = null
  /**
   * CONTAS DE ANÁLISE (metricas.analise = true, migração 070): as que seguem uma estratégia do MTM
   * Auto para o aluno medir o desempenho dela. Nascem num programa (para herdar alavancagem e o
   * resto do painel), mas as regras de perda e o objectivo NÃO se aplicam: uma estratégia que
   * perde 8% num mês tem de continuar a ser medida no mês seguinte — quebrar a conta apagava a
   * medição precisamente quando ela interessa. O stop-out por margem continua (é física da conta,
   * não regra do programa).
   */
  if (c.analise === 'true') {
    regras = null
    objetivoPct = 0
  }
  return {
    id: c.id,
    saldo: c.sim_saldo,
    saldoInicial: c.saldo_inicial,
    alavancagem: c.alavancagem,
    ancoraDia: c.sim_ancora_dia ?? c.sim_saldo,
    picoEquity: c.sim_pico_equity ?? c.saldo_inicial,
    diasNegociados: c.sim_dias_negociados,
    inicioEm,
    torneio,
    regras,
    objetivoPct,
  }
}

// ── aplicar as decisões ───────────────────────────────────────────────────────
function tickJson(sym: string) {
  const p = precos[sym]
  return p ? { bid: p.bid, ask: p.ask, em: new Date(precoEm.get(sym) ?? Date.now()).toISOString(), fonte: 'metaapi:puprime' } : null
}

async function aplicar(c: ContaLinha, d: Decisoes): Promise<void> {
  const curto = c.id.slice(0, 8)
  const fim = d.quebra ? 'quebra' : d.objetivo ? 'objetivo' : null

  if (!CFG.escrita) {
    // No modo seco nada muda na base, por isso a mesma decisão repetir-se-ia a cada 250ms.
    if (Date.now() - (ultimoSecoEm.get(c.id) ?? 0) < 60_000) return
    ultimoSecoEm.set(c.id, Date.now())
    for (const id of d.expirar) seco(`${curto} expiraria ordem ${id.slice(0, 8)}`)
    for (const id of d.cancelarSemMargem) seco(`${curto} cancelaria ordem ${id.slice(0, 8)} (sem margem)`)
    for (const x of d.executar) seco(`${curto} executaria ordem ${x.ordemId.slice(0, 8)} ${x.symbol} @${x.preco} comissão ${x.comissao}`)
    for (const id of d.cancelarOco) seco(`${curto} cancelaria ordem ${id.slice(0, 8)} (OCO)`)
    for (const x of d.parciais) seco(`${curto} TP${x.indice + 1} parcial ${x.posicaoId.slice(0, 8)} ${x.symbol} ${x.volume} @${x.preco} pnl ${x.pnl}`)
    for (const m of d.modificar) seco(`${curto} ${m.motivo} ${m.posicaoId.slice(0, 8)} ${m.symbol} SL ${m.slAntes} → ${m.sl}`)
    for (const f of d.fechar) seco(`${curto} fecharia ${f.posicaoId.slice(0, 8)} ${f.symbol} ${f.motivo} @${f.preco} pnl ${f.pnl}`)
    if (fim) seco(`${curto} ${fim}${d.quebra ? ` (${d.quebra.motivo}: ${d.quebra.detalhe})` : ''} → equity ${d.estado.equity}`)
    return
  }

  // A conta morre PRIMEIRO: com o estado já «quebrada», o site deixa de aceitar ordens enquanto
  // se fecham as posições. Pela ordem inversa, o aluno ainda abria uma no meio.
  if (d.quebra) {
    const { data: ganhou } = await db
      .from('mtm_trading_accounts')
      .update({ estado: 'quebrada', quebrou_regra: d.quebra.motivo, quebrada_em: new Date().toISOString() })
      .eq('id', c.id)
      .eq('estado', 'ativa')
      .select('id')
    if (!ganhou?.length) return // alguém (admin, outro processo) já a tirou de «ativa»
  }

  for (const id of d.expirar) {
    await db.from('funded_orders').update({ estado: 'expirada' }).eq('id', id).eq('estado', 'pendente')
  }
  for (const id of [...d.cancelarSemMargem, ...d.cancelarPorFim]) {
    await db.from('funded_orders').update({ estado: 'cancelada' }).eq('id', id).eq('estado', 'pendente')
  }
  const idReal = new Map<string, string>()
  for (const x of d.executar) {
    const { data, error } = await db.rpc('funded_executar_pendente', { p_ordem: x.ordemId, p_comissao: x.comissao, p_tick: tickJson(x.symbol) })
    if (error) log(`[${curto}] pendente ${x.ordemId.slice(0, 8)} falhou:`, error.message)
    else if (data) {
      idReal.set(`ordem:${x.ordemId}`, data as string)
      log(`[${curto}] pendente executada ${x.symbol} @${x.preco}`)
    }
  }
  // OCO: a base já cancelou a irmã dentro de funded_executar_pendente; aqui só se tira da memória.
  const parciaisFeitos = new Map<string, { volume: number; tps: Parcial['tps'] }>()
  for (const x of d.parciais) {
    const { data, error } = await db.rpc('funded_fechar_parcial', {
      p_mae: x.posicaoId, p_volume: x.volume, p_preco: x.preco, p_pnl: x.pnl, p_tick: tickJson(x.symbol),
      p_motivo: 'tp_parcial', p_tps: x.tps,
    })
    if (error) log(`[${curto}] TP${x.indice + 1} parcial ${x.posicaoId.slice(0, 8)} falhou:`, error.message)
    else if (data) {
      const antes = parciaisFeitos.get(x.posicaoId)
      parciaisFeitos.set(x.posicaoId, { volume: (antes?.volume ?? 0) + x.volume, tps: x.tps })
      log(`[${curto}] TP${x.indice + 1} parcial ${x.symbol} ${x.volume} @${x.preco} pnl ${x.pnl}`)
    }
  }
  const slMovidos = new Map<string, { sl: number | null; beFeito: boolean }>()
  for (const m of d.modificar) {
    // O trailing pode querer mexer a cada tick: no máximo 1 escrita por segundo por posição (o BE passa sempre).
    if (m.motivo === 'trailing' && Date.now() - (ultimoTrailingEm.get(m.posicaoId) ?? 0) < 1000) continue
    const patch: Record<string, unknown> = { be_feito: m.beFeito }
    if (m.sl != null && m.sl !== m.slAntes) patch.sl = m.sl
    // Guarda optimista: se o aluno mexeu no SL entretanto, a mão dele ganha e o motor reavalia no tick seguinte.
    let q = db.from('funded_positions').update(patch).eq('id', m.posicaoId).eq('estado', 'aberta')
    q = m.slAntes == null ? q.is('sl', null) : q.eq('sl', m.slAntes)
    const { data, error } = await q.select('id')
    if (error) log(`[${curto}] ${m.motivo} ${m.posicaoId.slice(0, 8)} falhou:`, error.message)
    else if (data?.length) {
      if (m.motivo === 'trailing') ultimoTrailingEm.set(m.posicaoId, Date.now())
      slMovidos.set(m.posicaoId, { sl: patch.sl == null ? m.slAntes : m.sl, beFeito: m.beFeito })
      if (patch.sl != null) log(`[${curto}] ${m.motivo} ${m.symbol} SL ${m.slAntes} → ${m.sl}`)
    }
  }

  for (const f of d.fechar) {
    const id = idReal.get(f.posicaoId) ?? f.posicaoId
    if (id.startsWith('ordem:')) continue // a pendente não chegou a abrir
    const { data, error } = await db.rpc('funded_fechar_posicao', { p_id: id, p_preco: f.preco, p_pnl: f.pnl, p_motivo: f.motivo, p_tick: tickJson(f.symbol) })
    if (error) log(`[${curto}] fecho ${id.slice(0, 8)} falhou:`, error.message)
    else if (data) log(`[${curto}] fechada ${f.symbol} ${f.motivo} @${f.preco} pnl ${f.pnl}`)
    if (!error) provider?.aoFechoLocal(id)
  }

  escritaLocalEm.set(c.id, Date.now())
  const houve = d.expirar.length + d.cancelarSemMargem.length + d.executar.length + d.fechar.length + parciaisFeitos.size + slMovidos.size
  if (houve) {
    // A memória passa a ser a verdade até à próxima leitura começada DEPOIS disto.
    const fechadas = new Set(d.fechar.map((f) => idReal.get(f.posicaoId) ?? f.posicaoId))
    const saem = new Set([...d.expirar, ...d.cancelarSemMargem, ...d.cancelarPorFim, ...d.cancelarOco, ...d.executar.map((x) => x.ordemId)])
    posicoesDe.set(c.id, (posicoesDe.get(c.id) ?? []).filter((p) => !fechadas.has(p.id)).map((p) => {
      // Parciais e SL movidos entram já na memória: o tick seguinte (250 ms) não pode repeti-los.
      const parte = parciaisFeitos.get(p.id)
      const sl = slMovidos.get(p.id)
      if (!parte && !sl) return p
      const volume = parte ? Math.round((p.volume - parte.volume) * 100) / 100 : p.volume
      return {
        ...p, volume,
        comissao: parte ? arred(p.comissao * (volume / p.volume)) : p.comissao,
        sl: sl ? sl.sl : p.sl,
        gestao: p.gestao ? { ...p.gestao, tps: parte ? parte.tps : p.gestao.tps, be_feito: sl ? sl.beFeito : p.gestao.be_feito } : p.gestao,
      }
    }))
    ordensDe.set(c.id, (ordensDe.get(c.id) ?? []).filter((o) => !saem.has(o.id)))
    c.sim_saldo = d.estado.saldo
    if (d.executar.length) {
      // As posições novas vêm na próxima leitura completa; até lá, a próxima leitura manda.
      escritaLocalEm.set(c.id, 0)
    }
  }

  if (fim) await terminarCiclo(c, d)
}

/** Quebra ou passagem: congela as métricas, marca o evento pendente e avisa o site. */
async function terminarCiclo(c: ContaLinha, d: Decisoes): Promise<void> {
  const evento = d.quebra ? 'quebrou' : 'objetivo'
  const agora = new Date().toISOString()
  const metricas = await construirMetricas(c, d.estado.equity, d.estado.margem, d.estado.nivelMargemPct)
  const extra = d.quebra
    ? { congeladoEm: agora, motivo: d.quebra.detalhe ?? d.quebra.motivo }
    : {}
  await db
    .from('mtm_trading_accounts')
    .update({
      metricas: { ...metricas, ...extra, eventoPendente: evento },
      metricas_lidas_em: agora,
      sim_equity: d.estado.equity,
      sim_margem: d.estado.margem,
    })
    .eq('id', c.id)
  if (d.quebra) contas.delete(c.id)
  await enviarEvento(c.id, evento, d.quebra?.motivo, metricas.resultadoPct as number)
}

async function enviarEvento(accountId: string, evento: string, motivo: string | undefined, resultadoPct: number | null): Promise<boolean> {
  const ultimo = eventoEnviadoEm.get(accountId) ?? 0
  if (Date.now() - ultimo < 30_000) return false
  eventoEnviadoEm.set(accountId, Date.now())
  if (!CFG.escrita) {
    seco(`avisaria o site: ${evento} ${accountId.slice(0, 8)}`)
    return true
  }
  try {
    const r = await fetch(`${CFG.apiBase}/api/mtmfunded/simulado/motor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-caption-secret': CFG.segredo },
      body: JSON.stringify({ evento, accountId, motivo, resultadoPct }),
      signal: AbortSignal.timeout(120_000),
    })
    log(`[evento] ${evento} ${accountId.slice(0, 8)} → ${r.status}`)
    return r.ok
  } catch (e) {
    log(`[evento] ${evento} ${accountId.slice(0, 8)} falhou:`, e instanceof Error ? e.message : e)
    return false
  }
}

/** Eventos que não chegaram ao site (site em baixo, motor reiniciado): tentam-se de novo. */
async function reenviarEventos(): Promise<void> {
  const { data } = await db
    .from('mtm_trading_accounts')
    .select('id, evento:metricas->>eventoPendente, motivo:quebrou_regra, resultado:metricas->>resultadoPct')
    .eq('motor', 'sim')
    .not('metricas->>eventoPendente', 'is', null)
    .limit(50)
  for (const r of data ?? []) {
    await enviarEvento(r.id as string, r.evento as string, (r.motivo as string) ?? undefined, r.resultado == null ? null : Number(r.resultado))
  }
}

// ── métricas na forma do cron do MT5 ──────────────────────────────────────────
const PONTOS_HISTORICO = 240

async function construirMetricas(c: ContaLinha, equity: number, margem: number, nivelMargem: number | null): Promise<Record<string, unknown>> {
  const { data } = await db.from('mtm_trading_accounts').select('metricas').eq('id', c.id).maybeSingle()
  const anterior = ((data?.metricas ?? {}) as Record<string, unknown>)
  const cs = contaSim(c)
  const fechos = fechosDe.get(c.id) ?? []
  const lucroPorDia = lucroPorDiaDe(fechos)
  const pico = Math.max(cs.picoEquity, equity)
  const drawdownPct = pico > 0 ? Math.round(((pico - equity) / pico) * 10000) / 100 : 0
  const posicoes = posicoesDe.get(c.id) ?? []
  const simb = Object.fromEntries(simbolos)

  const resultadoPct = cs.saldoInicial > 0 ? arred(((equity - cs.saldoInicial) / cs.saldoInicial) * 100) : 0
  const v = cs.regras
    ? avaliarConta(cs.regras, {
        saldoInicial: cs.saldoInicial, equity, saldoReferenciaDia: cs.ancoraDia, lucroPorDia,
        diasNegociados: cs.diasNegociados,
        diasDecorridos: cs.inicioEm ? Math.floor((Date.now() - new Date(cs.inicioEm).getTime()) / 86_400_000) : undefined,
      })
    : null

  const historico = Array.isArray(anterior.historico) ? (anterior.historico as Array<{ t: string }>) : []
  const ultimo = historico.length ? new Date(historico[historico.length - 1].t).getTime() : 0
  // Um ponto por hora, como o cron: 240 pontos = dez dias, e o gráfico do painel lê os dois igual.
  const novoHistorico = Date.now() - ultimo >= 3600_000
    ? [...historico, { t: new Date().toISOString(), e: arred(equity), s: arred(c.sim_saldo), m: arred(margem) }].slice(-PONTOS_HISTORICO)
    : historico

  return {
    ...anterior,
    motor: 'sim',
    equity: arred(equity),
    saldo: arred(c.sim_saldo),
    saldoReferenciaDia: cs.ancoraDia,
    picoEquity: arred(pico),
    drawdownPct,
    resultadoPct: v?.resultadoPct ?? resultadoPct,
    resultadoPctSemIdeias: resultadoSemIdeiasPct(
      cs.saldoInicial, equity,
      fechos.filter((f) => f.origem === 'ideia_mtm'),
      posicoes.filter((p) => p.origem === 'ideia_mtm'),
      simb, precos,
    ),
    elegivel: v?.elegivel ?? false,
    naoElegivelPorque: v?.naoElegivelPorque ?? (cs.regras ? null : 'sem regras conhecidas'),
    margemDiaria: v?.margemDiaria ?? null,
    margemTotal: v?.margemTotal ?? null,
    margemUsada: arred(margem),
    margemLivre: arred(equity - margem),
    nivelMargem: nivelMargem,
    diasNegociados: cs.diasNegociados,
    lucroPorDia,
    historico: novoHistorico,
    lidoEm: new Date().toISOString(),
  }
}

// ── o ciclo ───────────────────────────────────────────────────────────────────
const emProcesso = new Set<string>()

async function processarConta(id: string, confirmado = false): Promise<void> {
  const c = contas.get(id)
  if (!c) return
  const agora = new Date()
  const posicoes = posicoesDe.get(id) ?? []
  const ordens = ordensDe.get(id) ?? []
  const negociaveis = new Set<string>()
  for (const x of [...posicoes, ...ordens]) if (negociavel(x.symbol, agora)) negociaveis.add(x.symbol)

  const d = avaliarTick({
    conta: contaSim(c), posicoes, ordens, simbolos: Object.fromEntries(simbolos), precos, negociaveis, agora,
    lucroPorDia: lucroPorDiaDe(fechosDe.get(id) ?? []),
  })

  const haAccao = d.expirar.length || d.cancelarSemMargem.length || d.executar.length || d.fechar.length || d.parciais.length || d.modificar.length || d.quebra || d.objetivo
  if (haAccao && !CFG.escrita && Date.now() - (ultimoSecoEm.get(id) ?? 0) < 60_000) return
  if (haAccao && d.precisaConfirmacao && !confirmado) {
    // Decisão de fim (stop-out, quebra, passagem): só com uma fotografia consistente, e com os
    // fechos do dia frescos (consistência).
    if (!(await lerContaConsistente(id))) return
    const { data } = await db.from('funded_positions').select('account_id, pnl, comissao, fechada_em, origem').eq('account_id', id).eq('estado', 'fechada').limit(50000)
    fechosDe.set(id, (data ?? []) as unknown as FechoHistorico[])
    return processarConta(id, true)
  }
  if (d.objetivo && Date.now() - (eventoEnviadoEm.get(id) ?? 0) < 30_000) return
  if (haAccao) await aplicar(c, d)
  if (!contas.has(id)) return

  // Equity e margem: no máximo 1× a cada 2s, e só se mudou.
  const u = ultimaEquity.get(id)
  const agoraMs = Date.now()
  const mudou = !u || Math.abs(u.equity - d.estado.equity) >= 0.01 || Math.abs(u.margem - d.estado.margem) >= 0.01
  if (mudou && (!u || agoraMs - u.em >= 2000)) {
    ultimaEquity.set(id, { em: agoraMs, equity: d.estado.equity, margem: d.estado.margem })
    const pico = Math.max(c.sim_pico_equity ?? c.saldo_inicial, d.estado.equity)
    c.sim_pico_equity = pico
    if (CFG.escrita) {
      await db.from('mtm_trading_accounts').update({ sim_equity: d.estado.equity, sim_margem: d.estado.margem, sim_pico_equity: pico }).eq('id', id).eq('estado', 'ativa')
    }
  }

  // Fotografia de 5 em 5 minutos enquanto há posições.
  if ((posicoesDe.get(id) ?? []).length && agoraMs - (ultimoSnapshot.get(id) ?? 0) >= 300_000) {
    ultimoSnapshot.set(id, agoraMs)
    if (CFG.escrita) await db.from('funded_equity_snapshots').insert({ account_id: id, saldo: c.sim_saldo, equity: d.estado.equity })
  }

  // Métricas: no máximo de minuto a minuto e SÓ quando mudam (ou quando o gráfico precisa do ponto
  // da hora, ou de 15 em 15 min). Antes eram lidas e reescritas todos os minutos em todas as contas,
  // mesmo paradas — a maior fonte de escrita da base (ver metricas-escrita.ts).
  const assinatura = assinaturaMetricas({
    equity: d.estado.equity, saldo: c.sim_saldo, margem: d.estado.margem, nivelMargem: d.estado.nivelMargemPct,
    posicoes: (posicoesDe.get(id) ?? []).length, fechos: (fechosDe.get(id) ?? []).length,
    ancoraDia: c.sim_ancora_dia, diasNegociados: c.sim_dias_negociados,
  })
  if (precisaDeEscreverMetricas(ultimasMetricas.get(id), assinatura, agoraMs)) {
    const m = await construirMetricas(c, d.estado.equity, d.estado.margem, d.estado.nivelMargemPct)
    // Regista-se antes da escrita e também em modo seco: o ritmo das leituras é o mesmo nos dois.
    ultimasMetricas.set(id, { em: agoraMs, assinatura, ultimoPontoMs: ultimoPontoDoHistorico(m) })
    if (CFG.escrita) {
      await db.from('mtm_trading_accounts').update({ metricas: m, metricas_lidas_em: new Date().toISOString() }).eq('id', id).eq('estado', 'ativa')
    }
  }
}

async function cicloDeAvaliacao(): Promise<void> {
  const ids = [...sujas]
  sujas.clear()
  await Promise.all(
    ids.map(async (id) => {
      if (emProcesso.has(id)) { sujas.add(id); return }
      emProcesso.add(id)
      try {
        await processarConta(id)
      } catch (e) {
        log(`[conta ${id.slice(0, 8)}] erro:`, e instanceof Error ? e.message : e)
      } finally {
        emProcesso.delete(id)
      }
    }),
  )
}

/** 22:00 UTC: a âncora da perda diária passa a ser o saldo de fecho do dia. */
async function virarDia(): Promise<void> {
  const hoje = diaCorretora(new Date())
  for (const c of contas.values()) {
    const desde = c.sim_ancora_em ?? c.created_at
    if (diaCorretora(desde) === hoje) continue
    const agora = new Date().toISOString()
    if (!CFG.escrita) {
      seco(`${c.id.slice(0, 8)} viraria o dia: âncora ${c.sim_ancora_dia} → ${c.sim_saldo}`)
      c.sim_ancora_em = agora // no modo seco, não repetir a linha a cada 30s
      continue
    }
    let q = db.from('mtm_trading_accounts').update({ sim_ancora_dia: c.sim_saldo, sim_ancora_em: agora }).eq('id', c.id)
    q = c.sim_ancora_em ? q.eq('sim_ancora_em', c.sim_ancora_em) : q.is('sim_ancora_em', null)
    const { data } = await q.select('id')
    if (!data?.length) continue // outra escrita chegou primeiro; a próxima leitura traz o novo
    c.sim_ancora_dia = c.sim_saldo
    c.sim_ancora_em = agora
    escritaLocalEm.set(c.id, Date.now())
    const st = estadoDaConta(c.sim_saldo, c.alavancagem, posicoesDe.get(c.id) ?? [], Object.fromEntries(simbolos), precos)
    // Uma fotografia por dia para TODAS as contas, com ou sem posições: o gráfico de progresso
    // precisa de um ponto por dia mesmo nos dias em que o aluno não negociou.
    await db.from('funded_equity_snapshots').insert({ account_id: c.id, saldo: c.sim_saldo, equity: st.equity })
    sujas.add(c.id)
    log(`[dia] ${c.id.slice(0, 8)} âncora = ${c.sim_saldo}`)
  }
}

// ── arranque ──────────────────────────────────────────────────────────────────
function repetir(nome: string, ms: number, f: () => Promise<void>): void {
  let ocupado = false
  setInterval(async () => {
    if (ocupado) return
    ocupado = true
    try {
      await f()
    } catch (e) {
      log(`[${nome}] erro:`, e instanceof Error ? e.message : e)
    } finally {
      ocupado = false
    }
  }, ms)
}

/** Símbolos da corretora a pedir ao intervalo curto: os que o espelho provider gere por tick. */
function rapidos(): Set<string> {
  const out = new Set<string>()
  for (const s of simbolosDoProvider) { const sm = simbolos.get(s); if (sm) out.add(sm.simbolo_fonte) }
  return out
}

async function ligarFonte(): Promise<FontePrecos> {
  const principal = new FonteStreaming(CFG.metaapiToken, CFG.contaPrecos, CFG.intervaloMs, CFG.intervaloRapidoMs)
  try {
    await principal.iniciar(aoTick)
    return principal
  } catch (e) {
    registarErroMetaApi(e, 'feed:streaming')
    log('[feed] streaming não ligou, passo a RPC:', e instanceof Error ? e.message : e)
    await principal.parar()
    const recurso = new FonteRpc(CFG.metaapiToken, CFG.contaPrecos, CFG.intervaloMs)
    await recurso.iniciar(aoTick)
    return recurso
  }
}

async function main(): Promise<void> {
  log(`[motor] arranque · escrita=${CFG.escrita ? 'LIGADA' : 'desligada (seco)'} · conta de preços ${CFG.contaPrecos.slice(0, 8)}…`)
  await carregarCatalogo()
  log(`[motor] ${simbolos.size} símbolos no catálogo`)
  await carregarContas()
  await carregarFechos()
  log(`[motor] ${contas.size} contas simuladas activas · ${[...posicoesDe.values()].reduce((a, l) => a + l.length, 0)} posições · ${[...ordensDe.values()].reduce((a, l) => a + l.length, 0)} pendentes`)

  const fonte = await ligarFonte()
  log(`[feed] ligado por ${fonte.nome}`)
  daCorretora = fonte.simbolosDaCorretora()
  if (daCorretora.length) await carregarCatalogo()
  await carregarPedidos()
  await fonte.definirSimbolos(simbolosDesejados(), rapidos())

  // Contas que seguem estratégias do MTM Auto (migração 070). ESPELHO_ATIVO=0 desliga só isto.
  const espelho = env('ESPELHO_ATIVO', false) === '0'
    ? null
    : iniciarEspelho({
        db, metaapiToken: CFG.metaapiToken, escrita: CFG.escrita, log,
        simbolos, precos, precoEm,
        negociavel: (sym) => negociavel(sym, new Date()),
        marcarSuja: (id) => { escritaLocalEm.set(id, 0); sujas.add(id) },
      })

  // ── PONTO DE REGISTO dos módulos do motor ─────────────────────────────────
  // Cada módulo recebe o mesmo contexto (db, preços, símbolos, negociavel, marcarSuja) e expõe
  // aoTick/aoFechoLocal/estado/parar. Módulos novos (ex.: estrategias-sinais.ts) registam-se AQUI
  // com uma linha, ao lado do espelho provider, sem mexer no resto do motor.
  // Espelho provider (migração 082): conta da casa por estratégia, gestão nossa. ESPELHO_PROVIDER=1 liga.
  provider = env('ESPELHO_PROVIDER', false) === '1'
    ? iniciarEspelhoProvider({
        db, metaapiToken: CFG.metaapiToken, escrita: CFG.escrita, log,
        simbolos, precos, precoEm,
        negociavel: (sym) => negociavel(sym, new Date()),
        marcarSuja: (id) => { escritaLocalEm.set(id, 0); sujas.add(id) },
      })
    : null

  // Feed secundário TradeLocker (comparação; recurso só com ESPELHO_FEED_TL_RECURSO=1).
  feedTl = feedTradeLockerDoAmbiente({
    simbolos: () => new Set([...simbolosDoProvider, ...simbolosDoEspelho, 'XAUUSD', 'EURUSD', 'BTCUSD']),
    principal: (sym) => (precos[sym] ? { bid: precos[sym].bid, ask: precos[sym].ask, em: precoEm.get(sym) ?? 0 } : null),
    pip: (sym) => simbolos.get(sym)?.pip_size ?? null,
    aoRecurso: (sym, c) => aoTickRecurso(sym, c.bid, c.ask, c.em),
    log,
  })
  feedTl?.iniciar()

  await carregarAlertas()
  repetir('avaliar', 250, cicloDeAvaliacao)
  repetir('alertas', 5000, carregarAlertas)
  repetir('alertas-precos', 500, verificarAlertas)
  repetir('contas', 1000, carregarContas)
  repetir('precos', 1000, escreverPrecos)
  repetir('pedidos', 5000, carregarPedidos)
  repetir('subscricoes', 10_000, () => fonte.definirSimbolos(simbolosDesejados(), rapidos()))
  repetir('tudo-sujo', 5000, async () => { for (const id of contas.keys()) sujas.add(id) })
  repetir('dia', 30_000, virarDia)
  repetir('eventos', 30_000, reenviarEventos)
  repetir('fechos', 60_000, carregarFechos)
  repetir('catalogo', 10 * 60_000, carregarCatalogo)

  // Pulso: o BTC negoceia 24/7, por isso três minutos sem um único tick é o feed morto — e um
  // motor sem preços é pior do que nenhum. Sai, e o systemd arranca-o de novo.
  setInterval(() => {
    const semTicks = Date.now() - ultimoTickEm
    const amostra = BASE.filter((s) => precos[s]).map((s) => `${s} ${precos[s].bid}/${precos[s].ask}`).join(' · ')
    log(`[pulso] ${ticksNoMinuto} ticks/min · ${contas.size} contas · desvio corretora ${desvioMin}min · ${amostra}`)
    // Batimento na base: UMA escrita por minuto (servicos_pulso, 078). Sem a tabela, só o log.
    const estadoProvider = provider?.estado() ?? null
    const estado = {
      ticksMin: ticksNoMinuto, contas: contas.size, feed: fonte.nome, semTicksMs: ultimoTickEm ? Date.now() - ultimoTickEm : null,
      escrita: CFG.escrita, tem072, simbolosRapidos: simbolosDoProvider.size,
      espelhoSeguidoras: { latenciaEventoEscrita: latenciaSeguidoras.resumo() },
      espelhoProvider: estadoProvider,
      feedTradeLocker: feedTl?.resumo() ?? null,
    }
    if (estadoProvider) log('[pulso][provider]', JSON.stringify(estadoProvider.latencias))
    void db.from('servicos_pulso').upsert({ servico: 'mtm-funded-motor', host: process.env.HOSTNAME ?? null, versao: 'espelho-provider-082', estado, em: new Date().toISOString() }, { onConflict: 'servico' })
      .then(({ error }) => { if (error && !/does not exist/.test(error.message)) log('[pulso] servicos_pulso:', error.message) })
    ticksNoMinuto = 0
    if (ultimoTickEm && semTicks > 180_000) {
      log('[pulso] feed mudo há 3 min — a sair para o systemd reiniciar')
      process.exit(1)
    }
  }, 60_000)

  const sair = async () => {
    log('[motor] a parar')
    await escreverPrecos().catch(() => undefined)
    await espelho?.parar().catch(() => undefined)
    await provider?.parar().catch(() => undefined)
    feedTl?.parar()
    await fonte.parar()
    process.exit(0)
  }
  process.on('SIGTERM', sair)
  process.on('SIGINT', sair)
}

// Uma promessa rejeitada sem catch (tipicamente dentro do SDK da MetaApi, numa ligação de uma
// mestre do espelho) NÃO pode matar o motor: o systemd reiniciava-o e cada arranque volta a
// subscrever todas as contas na MetaApi — é exactamente o gasto de quota que se quer evitar. Regista,
// e se for limite liga o interruptor que pára o espelho. O feed mudo continua a sair pelo [pulso].
process.on('unhandledRejection', (e) => {
  const limite = registarErroMetaApi(e, 'unhandledRejection')
  log(`[motor] promessa rejeitada sem catch${limite ? ' (LIMITE da MetaApi — espelho em pausa)' : ''}:`, e instanceof Error ? e.message : e)
})

main().catch((e) => {
  console.error('[motor] falhou no arranque:', e instanceof Error ? e.message : e)
  process.exit(1)
})

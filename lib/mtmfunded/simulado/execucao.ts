import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { lerSessao, type ModoSessao } from './credenciais'
import { modoFundedPelaLigacao } from '@/lib/webtrader/contas-auto-regras'
import { tipoCurto, estadoCurto } from '@/lib/mtmfunded/etiquetas'
import { selecionarComOpcionais } from '@/lib/mtmfunded/numeros-conta'
import { ehContaRealDaCasa } from '@/lib/mtmfunded/conta-real-casa'
import {
  ehContaPortefolio, estadoDePortefolio, resumoDoPortefolio,
  type MovimentoPortefolio, type PontoCurvaPortefolio,
} from '@/lib/mtmfunded/portefolio'
import { SERVIDOR_SIMULADO } from './motor'
import { desempenhoDaConta, type LinhaFechada } from './desempenho'
import { type Direcao, type Simbolo, type MapaPrecos, type Preco, estadoDaConta } from './matematica'
import {
  planearAbertura, planearFecho, validarModificacao, validarPendente, limitesDaConta,
  precoFresco, diaDaCorretora, simbolosParaMedir, simboloDaLinha, posicaoDaLinha,
  planoSincronizacao, type RegrasDeOrdem,
} from './ordens'
import {
  type Gestao, type FiltroLote, validarGestao, gestaoDaLinha, riscoInicialUsd, selecionarParaFecho,
} from './avancadas'
import { precoDePreenchimento } from '../precos/preenchimento'
import { ticksDoMotor, maisFresco, type TickDoMotor, type LinhaRetrato } from '../precos/tick-motor'

/**
 * A EXECUÇÃO DAS ORDENS SIMULADAS — o lado que toca na base de dados.
 *
 * Duas portas usam isto: a rota das ordens (o WebTrader) e o webhook do TradingView. Estão as duas
 * aqui, e não cada uma com a sua cópia, porque uma ordem vinda de um alerta tem de passar pelas
 * MESMAS verificações que uma vinda do botão — margem, regras, preço fresco. Um atalho no webhook
 * era a forma mais rápida de uma conta abrir o que o ticket recusaria.
 *
 * As decisões (quanto, a que preço, se pode) são de `./ordens`, puras e testadas. Aqui só se lê,
 * se escreve e se garante que dois pedidos ao mesmo tempo não fecham a mesma posição duas vezes.
 */

export class ErroOrdem extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem) }
}

/**
 * `estrategia` é só do motor (contas que seguem uma estratégia do MTM Auto, migração 070): um
 * pedido vindo do WebTrader ou de um webhook nunca a pode declarar — por isso não está em ORIGENS,
 * a lista que valida o que chega de fora.
 */
export type Origem = 'manual' | 'ideia_mtm' | 'scanner' | 'copia' | 'estrategia'
const ORIGENS: Origem[] = ['manual', 'ideia_mtm', 'scanner', 'copia']
export const origemValida = (o: unknown): Origem => (ORIGENS.includes(o as Origem) ? (o as Origem) : 'manual')

const CAMPOS_CONTA = 'id, user_id, tipo, estado, motor, program_id, tournament_id, saldo_inicial, alavancagem, mt5_login, servidor, sim_saldo, sim_equity, sim_margem, sim_ancora_dia, sim_pico_equity, sim_dias_negociados, sim_ultimo_dia, quebrou_regra, quebrada_em, metricas, segue_estrategia, aceita_t2t, created_at, ' +
  // `sem_regras` marca as contas que existem para ESPELHAR uma estratégia. Sem ela no select, a
  // exclusão em `foraDoAmbito` lia sempre undefined e as contas-espelho eram travadas aos 3%.
  // `conta_portefolio` (173): sem ela no select, o ecrã da carteira voltava a CALCULAR a equity a
  // partir de `funded_positions` — tabela onde estas contas não escrevem — e escondia a perda.
  'sem_regras, conta_casa, conta_real_casa, conta_portefolio'
export type Conta = Record<string, unknown> & { id: string; estado: string; motor: string }

// ── quem manda nesta conta ─────────────────────────────────────────────────

/**
 * Duas formas de ter acesso a uma conta simulada:
 *   (a) sessão MTM de quem é DONO da conta → master;
 *   (b) cabeçalho `x-conta-sessao` com a sessão emitida por login+password → o modo dela.
 * A (b) vem primeiro quando existe: é o sinal explícito de com que credenciais se entrou — quem
 * entrou com a investor na conta de outro não pode ficar master só por ter sessão MTM.
 */
export async function autorizarConta(request: Request, accountId: string): Promise<{ conta: Conta; modo: ModoSessao }> {
  if (!accountId) throw new ErroOrdem(400, 'falta a conta')
  const conta = await lerConta(accountId)
  if (!conta || conta.motor !== 'sim') throw new ErroOrdem(404, 'conta não encontrada')

  const token = request.headers.get('x-conta-sessao')
  if (token) {
    let sessao: ReturnType<typeof lerSessao> = null
    try { sessao = lerSessao(token) } catch { sessao = null }
    if (sessao && sessao.accountId === accountId) return { conta, modo: sessao.modo }
  }
  const userId = await userIdDoPedido(request)
  if (userId && conta.user_id === userId) return { conta, modo: 'master' }
  // (c) Conta de OUTRA pessoa que este utilizador ligou (site ou app MTM Auto) — só com a password
  // investor se liga uma conta alheia, por isso abre SEMPRE em leitura (exigirNegociavel recusa ordens).
  if (userId && !token) {
    const ligacoes = await ligacoesFundedDoUtilizador(userId, accountId)
    if (modoFundedPelaLigacao({ accountId, donoId: (conta.user_id as string | null) ?? null, userId, ligacoes }) === 'investor') return { conta, modo: 'investor' }
  }
  if (token) throw new ErroOrdem(401, 'sessão da conta inválida ou expirada — entra outra vez')
  throw new ErroOrdem(userId ? 403 : 401, userId ? 'esta conta não é tua' : 'sem sessão')
}

/** Escrever exige master E conta viva. Uma conta Breached/Closed abre só para ver. */
export function exigirNegociavel(conta: Conta, modo: ModoSessao) {
  if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')
  if (conta.estado !== 'ativa') {
    const e = estadoCurto(String(conta.estado), conta.metricas as Record<string, unknown>)
    throw new ErroOrdem(409, `conta ${e} — não aceita ordens${conta.quebrou_regra ? ` (${conta.quebrou_regra})` : ''}`)
  }
}

/** Ligações de uma conta MTM Funded feitas por este utilizador (ligador do site e app MTM Auto). */
export async function ligacoesFundedDoUtilizador(userId: string, accountId?: string): Promise<Array<{ funded_account_id: unknown; funded_somente_leitura?: unknown }>> {
  const db = getSupabaseAdmin()
  let site = db.from('mtmcopy_connections').select('funded_account_id, funded_somente_leitura').eq('user_id', userId).not('funded_account_id', 'is', null).neq('mt5_status', 'disconnected')
  let auto = db.from('mtmauto_accounts').select('funded_account_id').eq('user_id', userId).not('funded_account_id', 'is', null)
  if (accountId) { site = site.eq('funded_account_id', accountId); auto = auto.eq('funded_account_id', accountId) }
  const [a, b] = await Promise.all([site, auto])
  // Uma tabela sem a coluna (base antiga) não pode impedir a outra de responder.
  return [...(a.error ? [] : a.data ?? []), ...(b.error ? [] : b.data ?? [])]
}

export async function lerConta(accountId: string): Promise<Conta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return null
  // `pausada_em` (079) para o estado «Pause» igual ao do admin e `conta_real_casa` (109) para o
  // painel «A minha conta»; sem as colunas, lê-se sem elas (numeros-conta.ts).
  const db = getSupabaseAdmin()
  const { data } = await selecionarComOpcionais<Conta>(
    CAMPOS_CONTA, (cols) => db.from('mtm_trading_accounts').select(cols).eq('id', accountId).limit(1) as never,
  )
  return data[0] ?? null
}

// ── leituras de mercado ────────────────────────────────────────────────────

export async function carregarSimbolos(symbols: string[], soAtivos = true): Promise<Record<string, Simbolo & { nome?: string; ativo?: boolean }>> {
  const lista = [...new Set(symbols.filter(Boolean))]
  if (!lista.length) return {}
  let q = getSupabaseAdmin().from('funded_symbols').select('*').in('symbol', lista)
  if (soAtivos) q = q.eq('ativo', true)
  const { data } = await q
  const out: Record<string, Simbolo & { nome?: string; ativo?: boolean }> = {}
  for (const r of data ?? []) out[String(r.symbol)] = { ...simboloDaLinha(r), nome: r.nome as string, ativo: r.ativo as boolean }
  return out
}

/**
 * `em` é a hora a que o MOTOR carimbou o preço; `emMercado` é a hora a que o MERCADO o fez, quando
 * a fonte a declara (migração 123) e nula quando não. Só a segunda prova frescura — a primeira
 * prova que o motor está vivo, e foi por se confundirem as duas que entradas abriram a preços que
 * o mercado não ofereceu (ver ../precos/preenchimento.ts).
 */
export async function carregarPrecos(
  symbols: string[],
  /**
   * Os símbolos que vão ser NEGOCIADOS agora — para esses pergunta-se ao motor o tick em memória
   * (~100 ms) em vez de aceitar o retrato (até 5 s). Ver ../precos/tick-motor.ts. Os outros, os
   * que só convertem o lucro para a moeda da conta, não precisam: 3 s de idade ali mudam
   * cêntimos, não o preço a que se entra.
   */
  frescos?: string[],
): Promise<{ precos: MapaPrecos; em: Record<string, string>; emMercado: Record<string, string | null> }> {
  const lista = [...new Set(symbols.filter(Boolean))]
  const precos: MapaPrecos = {}
  const em: Record<string, string> = {}
  const emMercado: Record<string, string | null> = {}
  if (!lista.length) return { precos, em, emMercado }
  const querFrescos = [...new Set((frescos ?? []).filter((s) => lista.includes(s)))]
  // As duas leituras em paralelo: o motor não entra no caminho crítico do que a base já faz.
  const [{ data }, doMotor] = await Promise.all([
    getSupabaseAdmin().from('funded_precos').select('symbol, bid, ask, em, em_mercado').in('symbol', lista),
    querFrescos.length ? ticksDoMotor(querFrescos) : Promise.resolve(new Map<string, TickDoMotor>()),
  ])
  const doRetrato = new Map<string, LinhaRetrato>()
  for (const r of data ?? []) {
    doRetrato.set(String(r.symbol), {
      bid: Number(r.bid), ask: Number(r.ask), em: Date.parse(String(r.em)),
      emMercado: r.em_mercado == null ? null : Date.parse(String(r.em_mercado)),
    })
  }
  for (const symbol of new Set([...doRetrato.keys(), ...doMotor.keys()])) {
    const escolhido = maisFresco(doRetrato.get(symbol) ?? null, doMotor.get(symbol) ?? null)
    if (!escolhido || !Number.isFinite(escolhido.escolha.em)) continue
    const { escolha } = escolhido
    precos[symbol] = { symbol, bid: escolha.bid, ask: escolha.ask }
    em[symbol] = new Date(escolha.em).toISOString()
    emMercado[symbol] = escolha.emMercado == null ? null : new Date(escolha.emMercado).toISOString()
  }
  return { precos, em, emMercado }
}

/** O preço para EXECUTAR: tem de existir e ter menos de 5 s. Senão, 409 e nada acontece. */
function precoParaExecutar(symbol: string, precos: MapaPrecos, em: Record<string, string>): Preco {
  const p = precos[symbol]
  if (!p || !precoFresco(em[symbol])) {
    throw new ErroOrdem(409, `sem preço ao vivo para ${symbol} — mercado fechado ou motor parado`)
  }
  return p
}

/**
 * O PREÇO A QUE UMA ORDEM NOVA ABRE.
 *
 * Igual ao de cima quando não há mais nada a dizer. Mas quando quem pede traz uma REFERÊNCIA — o
 * preço que o sinal declarou, que é o do mercado no instante da decisão — o preenchimento passa
 * pela regra de `../precos/preenchimento`: entre o nosso tick e o do sinal, a conta fica com o
 * pior. Foi por não haver esta regra que 6 de 7 entradas da mestre do Sensei (21-24/09) bateram
 * a favor da casa, 3 delas a preços fora da vela M5 real.
 */
function precoParaOrdem(
  symbol: string, direcao: Direcao, precos: MapaPrecos, em: Record<string, string>,
  referencia: number | null | undefined, digits: number, emMercado?: Record<string, string | null>,
): Preco {
  const p = precoParaExecutar(symbol, precos, em)
  if (!(typeof referencia === 'number' && referencia > 0)) return p
  const mercado = emMercado?.[symbol]
  const fill = precoDePreenchimento({
    direcao,
    // A porta que o `preenchimento.ts` deixou aberta: com a hora do MERCADO provada, o tick vale
    // sozinho; sem ela (fonte que não a declara) fica o caminho pessimista, que é o de hoje.
    tick: { bid: p.bid, ask: p.ask, em: Date.parse(em[symbol]), emMercado: mercado ? Date.parse(mercado) : null },
    referencia: { preco: referencia }, digits,
  })
  if (!fill.ok) throw new ErroOrdem(409, `${symbol}: ${fill.erro}`)
  return { symbol, bid: fill.bid, ask: fill.ask }
}

/** Conta de análise (segue uma estratégia): as regras do programa não se aplicam — ver motor.ts, contaSim. */
export function ehContaDeAnalise(conta: Record<string, unknown>): boolean {
  const m = conta.metricas as Record<string, unknown> | null | undefined
  return m?.analise === true || m?.analise === 'true'
}

export async function regrasDaConta(conta: Conta): Promise<Record<string, unknown> | null> {
  const db = getSupabaseAdmin()
  if (conta.program_id) {
    const { data } = await db.from('mtm_funded_programs').select('regras').eq('id', conta.program_id as string).maybeSingle()
    if (data?.regras) return data.regras as Record<string, unknown>
  }
  if (conta.tournament_id) {
    const { data } = await db.from('mtm_tournaments').select('regras').eq('id', conta.tournament_id as string).maybeSingle()
    if (data?.regras) return data.regras as Record<string, unknown>
  }
  return null
}

async function posicoesAbertas(accountId: string) {
  const { data } = await getSupabaseAdmin().from('funded_positions').select('*')
    .eq('account_id', accountId).eq('estado', 'aberta').order('aberta_em', { ascending: true })
  return (data ?? []) as Record<string, unknown>[]
}

// ── saldo ─────────────────────────────────────────────────────────────────

/**
 * O dinheiro da conta só se mexe por funções da base de dados (migração 064), as MESMAS que o
 * motor usa: `sim_saldo = sim_saldo + delta` numa só escrita. Ler o saldo, somar aqui e gravar
 * perdia dinheiro simulado quando o motor fechava um SL no mesmo instante.
 */
export async function somarSaldo(accountId: string, delta: number): Promise<number | null> {
  if (!delta) return null
  const { data, error } = await getSupabaseAdmin().rpc('funded_somar_saldo', { p_conta: accountId, p_delta: delta })
  if (error) {
    console.error('[funded] funded_somar_saldo falhou', { accountId, delta, error: error.message })
    return null
  }
  return data == null ? null : Number(data)
}

/**
 * Primeira trade de um dia da corretora (vira às 22:00 UTC) = mais um dia negociado. Guarda
 * otimista no próprio contador: duas aberturas simultâneas não contam o mesmo dia duas vezes.
 */
export async function marcarDiaNegociado(accountId: string): Promise<void> {
  const db = getSupabaseAdmin()
  const hoje = diaDaCorretora()
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: c } = await db.from('mtm_trading_accounts')
      .select('sim_ultimo_dia, sim_dias_negociados').eq('id', accountId).maybeSingle()
    if (!c || String(c.sim_ultimo_dia ?? '') === hoje) return
    const n = Number(c.sim_dias_negociados ?? 0)
    const { data: feito } = await db.from('mtm_trading_accounts')
      .update({ sim_ultimo_dia: hoje, sim_dias_negociados: n + 1 })
      .eq('id', accountId).eq('sim_dias_negociados', n).select('id')
    if (feito?.length) return
  }
}

// ── abrir ─────────────────────────────────────────────────────────────────

export interface EntradaAbrir {
  symbol: string
  direcao: Direcao
  volume: number
  sl?: number | null
  tp?: number | null
  origem?: Origem
  ideiaRef?: string | null
  /** Comentário à MT5 («T2T premium», «MTM Auto Premium»). Só o servidor o escreve. */
  comentario?: string | null
  /** Trailing, break-even e TPs parciais (distâncias em preço, migração 072). */
  gestao?: Partial<Gestao> | null
  /**
   * O preço que a outra ponta diz ser o do mercado agora (o `entry` do sinal). Só o servidor o
   * passa, e só quando é MESMO um preço de mercado — nunca o limite de um setup pendente. Com
   * ele, a entrada nunca pode ser melhor do que o mercado ofereceu (ver `precoParaOrdem`).
   */
  referencia?: number | null
}

/** As colunas da gestão para gravar — só as que a trade pediu (o resto fica no default da base). */
function colunasGestao(g: Gestao, risco: number | null, volume: number) {
  const out: Record<string, unknown> = { volume_inicial: volume }
  if (risco != null) out.risco_inicial = risco
  if (g.trailing_distancia) { out.trailing_distancia = g.trailing_distancia; out.trailing_ativacao = g.trailing_ativacao }
  if (g.be_gatilho || g.be_no_tp1) { out.be_gatilho = g.be_gatilho; out.be_no_tp1 = g.be_no_tp1; out.be_offset = g.be_offset }
  if (g.tps?.length) out.tps = g.tps
  return out
}

/**
 * Inserir com as colunas da 072 e, se a base ainda não as tiver (site publicado antes da migração),
 * voltar a tentar sem elas quando a trade não pediu gestão nenhuma. Com gestão pedida, falha —
 * gravar a ordem SEM o trailing que o trader pediu era pior do que recusar.
 */
async function inserirComGestao(tabela: 'funded_positions' | 'funded_orders', base: Record<string, unknown>, extra: Record<string, unknown>) {
  const db = getSupabaseAdmin()
  const r = await db.from(tabela).insert({ ...base, ...extra }).select('*').single()
  const semColuna = r.error && /42703|PGRST204|column/i.test(`${r.error.code} ${r.error.message}`)
  const pediuGestao = Object.keys(extra).some((k) => !['volume_inicial', 'risco_inicial', 'volume'].includes(k))
  if (semColuna && !pediuGestao) return db.from(tabela).insert(base).select('*').single()
  if (semColuna) throw new ErroOrdem(503, 'ordens avançadas ainda não estão ligadas nesta base (migração 072)')
  return r
}

/** Pausa do admin (079): as posições existentes continuam geridas, as novas não nascem. */
async function exigirContaSemPausa(accountId: string) {
  const { exigirSemPausa, ContaEmPausa } = await import('./pausa')
  try {
    await exigirSemPausa(accountId)
  } catch (e) {
    if (e instanceof ContaEmPausa) throw new ErroOrdem(e.status, e.message)
    throw e
  }
}

/**
 * Trava do TIPO de conta (financiada 3 %/6 %, real 30 %) — `lib/travas-por-tipo-de-conta.ts`.
 *
 * Só aqui e em `criarPendente`, como a pausa: são as duas portas por onde nasce uma posição ou uma
 * ordem. Nenhum caminho de saída a chama, e há uma guarda a lê-lo neste ficheiro para que continue
 * assim (lib/__tests__/travas-por-tipo-de-conta.check.ts).
 *
 * Importa-se em tempo de execução, como a pausa, para não fechar um ciclo de imports
 * (travas-tipo.ts precisa do tipo de erro daqui).
 */
async function exigirTravaDoTipo(conta: Conta, equity?: number | null) {
  const { exigirTravaDoTipo: exigir, TravaDoTipoAtingida } = await import('./travas-tipo')
  try {
    await exigir(conta as Parameters<typeof exigir>[0], { equity: equity ?? null })
  } catch (e) {
    if (e instanceof TravaDoTipoAtingida) throw new ErroOrdem(e.status, e.message)
    throw e
  }
}

/** A banca contra que se mede o tecto de SL: a equity, e o saldo quando ela não se sabe. */
function bancaDaConta(conta: Conta): number | null {
  const eq = Number(conta.sim_equity ?? NaN)
  if (Number.isFinite(eq) && eq > 0) return eq
  const s = Number(conta.sim_saldo ?? NaN)
  return Number.isFinite(s) && s > 0 ? s : null
}

export async function abrirPosicao(conta: Conta, e: EntradaAbrir) {
  await exigirContaSemPausa(conta.id)
  await exigirTravaDoTipo(conta)
  const symbol = String(e.symbol || '').toUpperCase()
  if (e.direcao !== 'buy' && e.direcao !== 'sell') throw new ErroOrdem(400, 'direção inválida')
  const abertas = await posicoesAbertas(conta.id)
  const simbolos = await carregarSimbolos([symbol, ...abertas.map((p) => String(p.symbol))])
  const simbolo = simbolos[symbol]
  if (!simbolo) throw new ErroOrdem(400, `símbolo ${symbol} não disponível`)
  const { precos, em, emMercado } = await carregarPrecos(simbolosParaMedir(Object.values(simbolos)), [symbol])
  const preco = precoParaOrdem(symbol, e.direcao, precos, em, e.referencia, simbolo.digits, emMercado)
  const regras = ehContaDeAnalise(conta) ? null : ((await regrasDaConta(conta)) as RegrasDeOrdem | null)

  const plano = planearAbertura({
    simbolo, direcao: e.direcao, volume: Number(e.volume), sl: num(e.sl), tp: num(e.tp), preco,
    saldo: Number(conta.sim_saldo ?? 0), alavancagemConta: Number(conta.alavancagem ?? 100),
    posicoesAbertas: abertas.map(posicaoDaLinha), simbolos, precos, regras,
  })
  if (!plano.ok) throw new ErroOrdem(422, plano.erro)

  // O SL desta entrada contra a banca (conta real: máximo 95 %). Mede-se AQUI e não em
  // `planearAbertura` porque é aqui que o risco em USD já está calculado para a gestão — e assim
  // não há duas formas de medir o mesmo stop.
  const riscoUsd = riscoInicialUsd(simbolo, e.direcao, plano.volume, plano.precoExecucao, num(e.sl), precos)
  const { limitesPorTipo } = await import('./travas-tipo')
  const { slAcimaDaBanca, tipoDeConta } = await import('@/lib/travas-por-tipo-de-conta')
  const tectoSl = (await limitesPorTipo())[tipoDeConta(conta.tipo)].slMaxPctDaBanca
  const slDemais = slAcimaDaBanca(tectoSl, { riscoUsd, banca: bancaDaConta(conta) })
  if (slDemais) throw new ErroOrdem(422, slDemais)

  const g = validarGestao(simbolo, e.direcao, plano.precoExecucao, plano.volume, num(e.sl), num(e.tp), e.gestao)
  if (!g.ok) throw new ErroOrdem(422, g.erro)

  const agora = new Date().toISOString()
  const { data: pos, error } = await inserirComGestao('funded_positions', {
    account_id: conta.id, symbol, direcao: e.direcao, volume: plano.volume, preco_entrada: plano.precoExecucao,
    sl: num(e.sl), tp: num(e.tp), comissao: plano.comissao, estado: 'aberta',
    origem: origemValida(e.origem), ideia_ref: e.ideiaRef ? String(e.ideiaRef).slice(0, 200) : null,
    ...(e.comentario ? { comentario: String(e.comentario).slice(0, 64) } : {}),
    tick_entrada: { bid: preco.bid, ask: preco.ask, em: em[symbol] }, aberta_em: agora,
  }, colunasGestao(g.gestao, riscoUsd, plano.volume))
  if (error?.code === '23505') throw new ErroOrdem(409, 'esta ideia já foi aberta nesta conta')
  if (error || !pos) throw new ErroOrdem(500, 'não foi possível abrir a posição')

  // A comissão sai À ABERTURA, por quem abre (convenção partilhada com o motor).
  await somarSaldo(conta.id, -plano.comissao)
  await marcarDiaNegociado(conta.id)
  return { posicao: pos, plano }
}

// ── fechar ────────────────────────────────────────────────────────────────

export async function fecharPosicao(conta: Conta, positionId: string, volume?: number | null, motivo = 'manual') {
  const db = getSupabaseAdmin()
  const { data: linha } = await db.from('funded_positions').select('*')
    .eq('id', positionId).eq('account_id', conta.id).maybeSingle()
  if (!linha) throw new ErroOrdem(404, 'posição não encontrada')
  if (linha.estado !== 'aberta') throw new ErroOrdem(409, 'a posição já está fechada')
  const pos = posicaoDaLinha(linha)
  const simbolos = await carregarSimbolos([pos.symbol], false)
  const simbolo = simbolos[pos.symbol]
  if (!simbolo) throw new ErroOrdem(400, `símbolo ${pos.symbol} sem especificação`)
  const { precos, em } = await carregarPrecos(simbolosParaMedir([simbolo]))
  const preco = precoParaExecutar(pos.symbol, precos, em)

  const plano = planearFecho(pos, simbolo, preco, precos, volume == null ? null : Number(volume))
  if (!plano.ok) throw new ErroOrdem(422, plano.erro)
  const tick = { bid: preco.bid, ask: preco.ask, em: em[pos.symbol] }

  if (!plano.parcial) {
    // Posição e saldo numa só transacção (funded_fechar_posicao, a mesma do motor): se o SL do
    // motor fechou no mesmo instante, só um ganha e o lucro não entra duas vezes.
    // O lucro creditado é o de preço, como no motor (o swap ainda não é acumulado por ninguém).
    const { data: ganhou, error } = await db.rpc('funded_fechar_posicao', {
      p_id: pos.id, p_preco: plano.precoFecho, p_pnl: plano.pnl, p_motivo: motivo, p_tick: tick,
    })
    if (error) throw new ErroOrdem(500, 'não foi possível fechar a posição')
    if (!ganhou) throw new ErroOrdem(409, 'a posição já foi fechada entretanto')
    const { data: fechada } = await db.from('funded_positions').select('*').eq('id', pos.id).maybeSingle()
    return { fechada, plano }
  }

  // Parcial numa só transacção (funded_fechar_parcial, migração 068): reduzir a mãe, criar a filha
  // e creditar o saldo. Eram três escritas soltas — um SL do motor entre elas deixava meia posição
  // sem registo, e o copiador (que lê a filha) via um parcial que não aconteceu.
  const { data: filhaId, error } = await db.rpc('funded_fechar_parcial', {
    p_mae: pos.id, p_volume: plano.volumeFechado, p_preco: plano.precoFecho, p_pnl: plano.pnl, p_tick: tick,
  })
  if (error) throw new ErroOrdem(500, 'não foi possível registar o fecho parcial')
  if (!filhaId) throw new ErroOrdem(409, 'a posição mudou entretanto — atualiza e tenta outra vez')
  const [{ data: filha }, { data: restante }] = await Promise.all([
    db.from('funded_positions').select('*').eq('id', String(filhaId)).maybeSingle(),
    db.from('funded_positions').select('*').eq('id', pos.id).maybeSingle(),
  ])
  return { fechada: filha, restante, plano }
}

// ── modificar ─────────────────────────────────────────────────────────────

export async function modificarPosicao(conta: Conta, positionId: string, sl: unknown, tp: unknown) {
  const db = getSupabaseAdmin()
  const { data: linha } = await db.from('funded_positions').select('*')
    .eq('id', positionId).eq('account_id', conta.id).maybeSingle()
  if (!linha) throw new ErroOrdem(404, 'posição não encontrada')
  if (linha.estado !== 'aberta') throw new ErroOrdem(409, 'a posição já está fechada')
  const pos = posicaoDaLinha(linha)
  const { precos, em } = await carregarPrecos([pos.symbol])
  const preco = precoParaExecutar(pos.symbol, precos, em)
  const erro = validarModificacao(pos, preco, num(sl), num(tp))
  if (erro) throw new ErroOrdem(422, erro)
  const { data } = await db.from('funded_positions').update({ sl: num(sl), tp: num(tp) })
    .eq('id', pos.id).eq('estado', 'aberta').select('*')
  if (!data?.length) throw new ErroOrdem(409, 'a posição fechou entretanto')
  return { posicao: data[0] }
}

// ── pendentes ─────────────────────────────────────────────────────────────

export interface EntradaPendente {
  symbol: string
  direcao: Direcao
  tipo: 'limit' | 'stop'
  volume: number
  preco: number
  sl?: number | null
  tp?: number | null
  expiraEm?: string | null
  origem?: Origem
  ideiaRef?: string | null
  comentario?: string | null
  gestao?: Partial<Gestao> | null
  /** Pernas OCO partilham o grupo (criarOco). */
  ocoGrupo?: string | null
}

export async function criarPendente(conta: Conta, e: EntradaPendente) {
  await exigirContaSemPausa(conta.id)
  await exigirTravaDoTipo(conta)
  const symbol = String(e.symbol || '').toUpperCase()
  if (e.direcao !== 'buy' && e.direcao !== 'sell') throw new ErroOrdem(400, 'direção inválida')
  if (e.tipo !== 'limit' && e.tipo !== 'stop') throw new ErroOrdem(400, 'tipo inválido (limit ou stop)')
  const simbolos = await carregarSimbolos([symbol])
  const simbolo = simbolos[symbol]
  if (!simbolo) throw new ErroOrdem(400, `símbolo ${symbol} não disponível`)
  // Conversões (EURJPY → USDJPY) para o risco inicial em USD.
  const { precos: conversoes } = await carregarPrecos(simbolosParaMedir([simbolo]))
  // Uma pendente não executa já, por isso aceita-se preço velho — mas usa-se se estiver fresco,
  // para recusar uma buy limit acima do mercado.
  const { precos, em } = await carregarPrecos([symbol])
  const preco = precos[symbol] && precoFresco(em[symbol]) ? precos[symbol] : null
  const v = validarPendente(simbolo, e.direcao, e.tipo, Number(e.volume), Number(e.preco), num(e.sl), num(e.tp), preco)
  if (!v.ok) throw new ErroOrdem(422, v.erro)
  let expira: string | null = null
  if (e.expiraEm) {
    const t = new Date(e.expiraEm).getTime()
    if (!Number.isFinite(t) || t <= Date.now()) throw new ErroOrdem(422, 'a expiração tem de ser no futuro')
    expira = new Date(t).toISOString()
  }
  const g = validarGestao(simbolo, e.direcao, Number(e.preco), v.volume, num(e.sl), num(e.tp), e.gestao)
  if (!g.ok) throw new ErroOrdem(422, g.erro)
  const extra = colunasGestao(g.gestao, riscoInicialUsd(simbolo, e.direcao, v.volume, Number(e.preco), num(e.sl), conversoes), v.volume)
  // Nas ordens não há volume_inicial (é o volume da própria ordem; a função copia-o).
  delete extra.volume_inicial
  if (e.ocoGrupo) extra.oco_grupo = e.ocoGrupo
  if (e.gestao || e.ocoGrupo) extra.bracket = { sl: num(e.sl), tp: num(e.tp), tps: g.gestao.tps, oco: Boolean(e.ocoGrupo) }
  const { data, error } = await inserirComGestao('funded_orders', {
    account_id: conta.id, symbol, direcao: e.direcao, tipo: e.tipo, volume: v.volume, preco: Number(e.preco),
    sl: num(e.sl), tp: num(e.tp), estado: 'pendente', origem: origemValida(e.origem),
    ideia_ref: e.ideiaRef ? String(e.ideiaRef).slice(0, 200) : null, expira_em: expira,
    ...(e.comentario ? { comentario: String(e.comentario).slice(0, 64) } : {}),
  }, extra)
  if (error?.code === '23505') throw new ErroOrdem(409, 'esta ideia já foi aberta nesta conta')
  if (error || !data) throw new ErroOrdem(500, 'não foi possível criar a ordem')
  return { ordem: data }
}

/** Mover uma pendente no gráfico: preço, SL e TP. O tipo mantém-se — e revalida-se contra ele. */
export async function modificarPendente(conta: Conta, orderId: string, preco: unknown, sl: unknown, tp: unknown) {
  const db = getSupabaseAdmin()
  const { data: o } = await db.from('funded_orders').select('*').eq('id', orderId).eq('account_id', conta.id).maybeSingle()
  if (!o) throw new ErroOrdem(404, 'ordem não encontrada')
  if (o.estado !== 'pendente') throw new ErroOrdem(409, 'a ordem já não está pendente')
  const simbolos = await carregarSimbolos([String(o.symbol)], false)
  const simbolo = simbolos[String(o.symbol)]
  if (!simbolo) throw new ErroOrdem(400, 'símbolo sem especificação')
  const { precos, em } = await carregarPrecos([String(o.symbol)])
  const atual = precos[String(o.symbol)] && precoFresco(em[String(o.symbol)]) ? precos[String(o.symbol)] : null
  const nivel = preco == null ? Number(o.preco) : Number(preco)
  const v = validarPendente(simbolo, o.direcao as Direcao, o.tipo as 'limit' | 'stop', Number(o.volume), nivel, num(sl), num(tp), atual)
  if (!v.ok) throw new ErroOrdem(422, v.erro)
  const { data } = await db.from('funded_orders').update({ preco: nivel, sl: num(sl), tp: num(tp) })
    .eq('id', orderId).eq('estado', 'pendente').select('*')
  if (!data?.length) throw new ErroOrdem(409, 'a ordem foi executada ou cancelada entretanto')
  return { ordem: data[0] }
}

export async function cancelarPendente(conta: Conta, orderId: string) {
  const { data } = await getSupabaseAdmin().from('funded_orders').update({ estado: 'cancelada' })
    .eq('id', orderId).eq('account_id', conta.id).eq('estado', 'pendente').select('*')
  if (!data?.length) throw new ErroOrdem(409, 'a ordem já não está pendente')
  return { ordem: data[0] }
}

// ── ordens avançadas (072) ────────────────────────────────────────────────

/**
 * OCO: duas pendentes que se anulam. Cria-se a primeira e, se a segunda falhar a validação, a
 * primeira cancela-se — nunca fica meia OCO viva (uma pendente solta que o trader julga protegida).
 */
export async function criarOco(conta: Conta, pernas: EntradaPendente[]) {
  if (!Array.isArray(pernas) || pernas.length !== 2) throw new ErroOrdem(400, 'uma OCO tem exactamente duas pernas')
  if (String(pernas[0].symbol).toUpperCase() !== String(pernas[1].symbol).toUpperCase()) throw new ErroOrdem(422, 'as duas pernas da OCO são do mesmo símbolo')
  const grupo = crypto.randomUUID()
  const a = await criarPendente(conta, { ...pernas[0], ocoGrupo: grupo })
  try {
    const b = await criarPendente(conta, { ...pernas[1], ocoGrupo: grupo })
    return { ordens: [a.ordem, b.ordem], ocoGrupo: grupo }
  } catch (e) {
    await getSupabaseAdmin().from('funded_orders').update({ estado: 'cancelada' }).eq('id', String(a.ordem.id)).eq('estado', 'pendente')
    throw e
  }
}

/** Mudar a gestão de uma posição aberta (trailing, BE, TPs). TPs já atingidos mantêm-se. */
export async function modificarGestao(conta: Conta, positionId: string, pedido: Partial<Gestao> | null) {
  const db = getSupabaseAdmin()
  const { data: linha } = await db.from('funded_positions').select('*').eq('id', positionId).eq('account_id', conta.id).maybeSingle()
  if (!linha) throw new ErroOrdem(404, 'posição não encontrada')
  if (linha.estado !== 'aberta') throw new ErroOrdem(409, 'a posição já está fechada')
  const pos = posicaoDaLinha(linha)
  const simbolo = (await carregarSimbolos([pos.symbol], false))[pos.symbol]
  if (!simbolo) throw new ErroOrdem(400, 'símbolo sem especificação')
  const atual = gestaoDaLinha(linha)
  const volumeInicial = atual.volume_inicial ?? pos.volume
  // Os TPs já atingidos não se validam outra vez (o preço já passou por eles): só os que faltam.
  const atingidos = (atual.tps ?? []).filter((t) => t.atingido)
  const novos = (pedido?.tps ?? []).filter((t) => !atingidos.some((x) => Math.abs(x.preco - Number(t.preco)) < 1e-9))
  const v = validarGestao(simbolo, pos.direcao, atingidos.length ? atingidos[atingidos.length - 1].preco : pos.preco_entrada, volumeInicial, pos.sl, pos.tp, { ...pedido, tps: novos })
  if (!v.ok) throw new ErroOrdem(422, v.erro)
  const tps = [...atingidos, ...(v.gestao.tps ?? [])]
  if (tps.reduce((a, t) => a + t.pct, 0) > 100 + 1e-9) throw new ErroOrdem(422, 'as % dos take-profits somam mais de 100%')
  const { data, error } = await db.from('funded_positions').update({
    trailing_distancia: v.gestao.trailing_distancia, trailing_ativacao: v.gestao.trailing_ativacao,
    be_gatilho: v.gestao.be_gatilho, be_no_tp1: v.gestao.be_no_tp1, be_offset: v.gestao.be_offset,
    tps: tps.length ? tps : null, volume_inicial: volumeInicial,
  }).eq('id', pos.id).eq('estado', 'aberta').select('*')
  if (error) throw new ErroOrdem(500, 'não foi possível guardar a gestão')
  if (!data?.length) throw new ErroOrdem(409, 'a posição fechou entretanto')
  return { posicao: data[0] }
}

/** Fechar em lote: todas, por símbolo, ganhadoras, perdedoras, compras ou vendas. Uma a uma, com o preço de cada. */
export async function fecharLote(conta: Conta, filtro: FiltroLote, symbol?: string | null) {
  const filtros: FiltroLote[] = ['todas', 'simbolo', 'ganhadoras', 'perdedoras', 'compras', 'vendas']
  if (!filtros.includes(filtro)) throw new ErroOrdem(400, 'filtro inválido')
  if (filtro === 'simbolo' && !symbol) throw new ErroOrdem(400, 'falta o símbolo')
  const abertas = (await posicoesAbertas(conta.id)).map((l) => ({ ...posicaoDaLinha(l), id: String(l.id) }))
  const simbolos = await carregarSimbolos(abertas.map((p) => p.symbol), false)
  const { precos } = await carregarPrecos(simbolosParaMedir(Object.values(simbolos)))
  const alvo = selecionarParaFecho(abertas, filtro, simbolos, precos, symbol ? String(symbol).toUpperCase() : null)
  const fechadas: unknown[] = []
  const falhas: Array<{ id: string; symbol: string; erro: string }> = []
  for (const p of alvo) {
    try { fechadas.push((await fecharPosicao(conta, p.id)).fechada) }
    catch (e) { falhas.push({ id: p.id, symbol: p.symbol, erro: (e as Error).message }) }
  }
  return { fechadas, falhas, pedidas: alvo.length }
}

export async function cancelarTodas(conta: Conta, symbol?: string | null) {
  let q = getSupabaseAdmin().from('funded_orders').update({ estado: 'cancelada' }).eq('account_id', conta.id).eq('estado', 'pendente')
  if (symbol) q = q.eq('symbol', String(symbol).toUpperCase())
  const { data, error } = await q.select('id')
  if (error) throw new ErroOrdem(500, 'não foi possível cancelar as ordens')
  return { canceladas: (data ?? []).length }
}

/**
 * Inverter: fecha a posição e abre o lado contrário com o mesmo volume, sem SL/TP (os níveis de
 * um lado não servem ao outro). Não é atómico — se a abertura falhar (margem, mercado), a posição
 * já está fechada e o erro diz isso mesmo.
 */
export async function inverterPosicao(conta: Conta, positionId: string) {
  const fecho = await fecharPosicao(conta, positionId)
  const f = fecho.fechada as Record<string, unknown> | null
  if (!f) throw new ErroOrdem(500, 'fechei a posição mas não a consegui reler para inverter')
  try {
    const aberta = await abrirPosicao(conta, {
      symbol: String(f.symbol), direcao: f.direcao === 'buy' ? 'sell' : 'buy', volume: Number(f.volume), origem: 'manual',
    })
    return { fechada: f, posicao: aberta.posicao, plano: aberta.plano }
  } catch (e) {
    throw new ErroOrdem(e instanceof ErroOrdem ? e.status : 500, `posição fechada, mas a inversão falhou: ${(e as Error).message}`)
  }
}

// ── webhook: fechar tudo / sincronizar ───────────────────────────────────

export async function fecharTodasDoSimbolo(conta: Conta, symbol: string) {
  const abertas = (await posicoesAbertas(conta.id)).filter((p) => p.symbol === symbol)
  const resultados: unknown[] = []
  for (const p of abertas) {
    try { resultados.push((await fecharPosicao(conta, String(p.id))).fechada) }
    catch (e) { resultados.push({ id: p.id, erro: (e as Error).message }) }
  }
  return { fechadas: resultados }
}

export async function sincronizarAlvo(conta: Conta, symbol: string, alvo: number, extra: { sl?: number | null; tp?: number | null; origem?: Origem; ideiaRef?: string }) {
  const abertas = (await posicoesAbertas(conta.id)).filter((p) => p.symbol === symbol).map(posicaoDaLinha)
  const passos = planoSincronizacao(abertas, alvo)
  const feitos: unknown[] = []
  for (const passo of passos) {
    if (passo.tipo === 'fechar') feitos.push((await fecharPosicao(conta, passo.positionId, passo.volume)).fechada)
    else feitos.push((await abrirPosicao(conta, { symbol, direcao: passo.direcao, volume: passo.volume, sl: extra.sl, tp: extra.tp, origem: extra.origem, ideiaRef: extra.ideiaRef })).posicao)
  }
  return { passos, feitos }
}

// ── o estado inteiro de uma conta (GET) ──────────────────────────────────

/**
 * `leve`: sem o histórico (últimas 100 fechadas, `select *`) e sem o desempenho (até 5 000
 * fechadas). É o que o WebTrader pede na releitura de 4 em 4 s — posições, pendentes, saldo e
 * limites continuam completos, que é o que o motor muda sem o ecrã saber. O histórico só muda
 * quando uma posição fecha, e aí o saldo ou a lista de abertas também mudam: o cliente vê isso e
 * pede o estado inteiro (components/funded/estado-leve.ts). Resposta leve leva `parcial: true`.
 */
export async function estadoCompleto(conta: Conta, modo: ModoSessao, opcoes: { leve?: boolean } = {}) {
  const db = getSupabaseAdmin()
  const leve = opcoes.leve === true
  const segue = conta.segue_estrategia ? String(conta.segue_estrategia) : null
  const nada = Promise.resolve({ data: null })
  const [abertas, { data: fechadas }, { data: pendentes }, regras, { data: todasFechadas }, { data: estrategia }] = await Promise.all([
    posicoesAbertas(conta.id),
    leve ? nada : db.from('funded_positions').select('*').eq('account_id', conta.id).eq('estado', 'fechada')
      .order('fechada_em', { ascending: false }).limit(100),
    db.from('funded_orders').select('*').eq('account_id', conta.id).eq('estado', 'pendente')
      .order('criada_em', { ascending: false }),
    regrasDaConta(conta),
    // O desempenho mede a conta INTEIRA, não só as 100 do histórico visível.
    leve ? nada : db.from('funded_positions')
      .select('id, mae_id, symbol, direcao, volume, preco_entrada, preco_fecho, pnl, comissao, swap, fechada_em, origem, comentario')
      .eq('account_id', conta.id).eq('estado', 'fechada').order('fechada_em', { ascending: true }).limit(5000),
    segue
      ? db.from('mtmauto_providers').select('slug, nome, ativo').eq('slug', segue).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const envolvidos = [...abertas.map((p) => String(p.symbol)), ...(pendentes ?? []).map((o) => String(o.symbol))]
  const simbolos = await carregarSimbolos(envolvidos, false)
  const { precos, em } = await carregarPrecos(simbolosParaMedir(Object.values(simbolos)))
  const saldo = Number(conta.sim_saldo ?? 0)
  const doMotor = estadoDaConta(saldo, Number(conta.alavancagem ?? 100), abertas.map(posicaoDaLinha), simbolos, precos)

  /**
   * AS CARTEIRAS DO DONO (173) — equity LIDA, histórico dos movimentos.
   *
   * Nestas contas `funded_positions` está vazia de propósito, e `estadoDaConta` sobre uma tabela
   * vazia devolve flutuante 0 e equity = saldo. Era isso que punha a conta Cripto — 2 632 $ abaixo
   * do contribuído — a aparecer como se estivesse a zero, enquanto a lista do seletor (que lê
   * `sim_equity`) mostrava o número certo. Um ecrã lia, o outro calculava: a divergência era aqui.
   *
   * Sem valor de mercado gravado mantém-se o estado do motor — um `null` honesto em vez de um
   * palpite.
   */
  const ehPortefolio = ehContaPortefolio(conta)
  let movimentos: MovimentoPortefolio[] = []
  let curvaPortefolio: PontoCurvaPortefolio[] = []
  if (ehPortefolio && !leve) {
    /**
     * AOS MIL DE CADA VEZ, e não com um `.limit(10000)`.
     *
     * O PostgREST corta qualquer resposta no `max-rows` do servidor (1 000 linhas): um `limit`
     * maior não levanta o tecto, devolve 1 000 e não se queixa. A conta Cripto tem 2 139
     * movimentos — o histórico vinha cortado a menos de metade e o total comprado dava 2 165 $ em
     * vez de 5 632 $, sem erro nenhum pelo caminho. É o mesmo padrão de lib/mtmcopy/desfecho-unico.ts.
     */
    const PAGINA = 1_000
    const TECTO = 20_000
    const lidos: MovimentoPortefolio[] = []
    for (let inicio = 0; inicio < TECTO; inicio += PAGINA) {
      const { data } = await db.from('portefolio_movimentos')
        .select('id, symbol, tipo, data, unidades, preco, valor, motivo')
        .eq('conta_id', conta.id)
        // Ordem estável (data + id): sem o desempate, duas páginas podiam repetir ou saltar linhas.
        .order('data', { ascending: false }).order('id')
        .range(inicio, inicio + PAGINA - 1)
      const pagina = (data ?? []) as unknown as MovimentoPortefolio[]
      lidos.push(...pagina)
      if (pagina.length < PAGINA) break
    }
    movimentos = lidos
    const { data: cv } = await db.from('portefolio_curva')
      .select('data, contribuido, valor').eq('conta_id', conta.id).order('data')
    curvaPortefolio = (cv ?? []) as unknown as PontoCurvaPortefolio[]
  }
  const estado = (ehPortefolio ? estadoDePortefolio(saldo, conta.sim_equity as number | null) : null) ?? doMotor
  const metricas = (conta.metricas as Record<string, unknown>) ?? {}
  const limites = limitesDaConta(
    regras, Number(conta.saldo_inicial ?? 0), estado.equity,
    conta.sim_ancora_dia == null ? null : Number(conta.sim_ancora_dia), Number(metricas.fase ?? 1),
  )
  /**
   * A trava do TIPO de conta, com a equity do ecrã — é o que o modal de travas mostra.
   *
   * Vem do servidor e não se recalcula no cliente de propósito: o número que o trader vê tem de ser
   * o mesmo que o motor usa para lhe recusar a entrada. Vai também na resposta `leve` (a releitura
   * de 4 em 4 s), porque a trava muda com o flutuante, não com o histórico.
   */
  const { veredictoDoTipo } = await import('./travas-tipo')
  const travas = await veredictoDoTipo(conta as Parameters<typeof veredictoDoTipo>[0], {
    equity: estado.equity, margemLivre: estado.margemLivre,
  })

  // Na leve o desempenho sai vazio (e `parcial` diz ao cliente para manter o que já tinha).
  const desempenho = desempenhoDaConta({
    saldoInicial: Number(conta.saldo_inicial ?? 0),
    equity: estado.equity,
    fechadas: (todasFechadas ?? []) as unknown as LinhaFechada[],
    abertasIds: new Set(abertas.map((p) => String(p.id))),
  })
  return {
    modo,
    parcial: leve,
    desempenho,
    conta: {
      id: conta.id, login: conta.mt5_login, servidor: conta.servidor ?? SERVIDOR_SIMULADO,
      tipo: conta.tipo, estado: conta.estado,
      etiqueta: tipoCurto(String(conta.tipo), metricas), estadoCurto: estadoCurto(String(conta.estado), metricas, (conta.pausada_em as string | null) ?? null),
      pausadaEm: (conta.pausada_em as string | null) ?? null,
      motivo: conta.quebrou_regra ?? null, quebradaEm: conta.quebrada_em ?? null,
      saldoInicial: Number(conta.saldo_inicial ?? 0), alavancagem: Number(conta.alavancagem ?? 100),
      diasNegociados: Number(conta.sim_dias_negociados ?? 0),
      ancoraDia: conta.sim_ancora_dia == null ? null : Number(conta.sim_ancora_dia),
      fase: Number(metricas.fase ?? 1),
      analise: ehContaDeAnalise(conta),
      // Conta real da casa (109): sem regras como a de análise, mas com negociação real.
      contaReal: ehContaRealDaCasa(conta) || ehPortefolio,
      /** 173 — carteira reconstituída: o ecrã troca Histórico/Métricas/Diário pelos movimentos. */
      portefolio: ehPortefolio,
      // Para as barras das regras do painel «A minha conta» (consistência) — as mesmas do admin.
      lucroPorDia: (metricas.lucroPorDia ?? null) as Record<string, number> | null,
      tournamentId: (conta.tournament_id as string | null) ?? null,
      aceitaT2T: Boolean(conta.aceita_t2t),
      segueEstrategia: segue
        ? { slug: segue, nome: String((estrategia as { nome?: string } | null)?.nome ?? segue), ativa: (estrategia as { ativo?: boolean } | null)?.ativo !== false }
        : null,
    },
    estado: { saldo, ...estado },
    limites,
    travas,
    regras,
    posicoes: abertas,
    historico: fechadas ?? [],
    /**
     * A CARTEIRA (173): `null` em todas as outras contas, para nenhum ecrã ter de perguntar duas
     * vezes. Na resposta `leve` vem sem movimentos (como o histórico e o desempenho) — `parcial`
     * já diz ao cliente para manter o que tinha.
     */
    portefolio: ehPortefolio && !leve
      ? {
          movimentos,
          curva: curvaPortefolio,
          resumo: resumoDoPortefolio(movimentos, curvaPortefolio, {
            contribuido: saldo,
            valorDeMercado: conta.sim_equity == null ? null : Number(conta.sim_equity),
          }),
        }
      : null,
    ordens: pendentes ?? [],
    simbolos,
    precos: Object.fromEntries(Object.entries(precos).map(([s, p]) => [s, { ...p, em: em[s] }])),
  }
}

export function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

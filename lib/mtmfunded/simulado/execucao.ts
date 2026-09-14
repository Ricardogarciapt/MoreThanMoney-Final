import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { lerSessao, type ModoSessao } from './credenciais'
import { tipoCurto, estadoCurto } from '@/lib/mtmfunded/etiquetas'
import { SERVIDOR_SIMULADO } from './motor'
import { desempenhoDaConta, type LinhaFechada } from './desempenho'
import { type Direcao, type Simbolo, type MapaPrecos, type Preco, estadoDaConta } from './matematica'
import {
  planearAbertura, planearFecho, validarModificacao, validarPendente, limitesDaConta,
  precoFresco, diaDaCorretora, simbolosParaMedir, simboloDaLinha, posicaoDaLinha,
  planoSincronizacao, type RegrasDeOrdem,
} from './ordens'

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

const CAMPOS_CONTA = 'id, user_id, tipo, estado, motor, program_id, tournament_id, saldo_inicial, alavancagem, mt5_login, servidor, sim_saldo, sim_equity, sim_margem, sim_ancora_dia, sim_pico_equity, sim_dias_negociados, sim_ultimo_dia, quebrou_regra, quebrada_em, metricas, segue_estrategia, aceita_t2t, created_at'
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

export async function lerConta(accountId: string): Promise<Conta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return null
  const { data } = await getSupabaseAdmin().from('mtm_trading_accounts').select(CAMPOS_CONTA).eq('id', accountId).maybeSingle()
  return (data as Conta | null) ?? null
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

export async function carregarPrecos(symbols: string[]): Promise<{ precos: MapaPrecos; em: Record<string, string> }> {
  const lista = [...new Set(symbols.filter(Boolean))]
  const precos: MapaPrecos = {}
  const em: Record<string, string> = {}
  if (!lista.length) return { precos, em }
  const { data } = await getSupabaseAdmin().from('funded_precos').select('symbol, bid, ask, em').in('symbol', lista)
  for (const r of data ?? []) {
    precos[String(r.symbol)] = { symbol: String(r.symbol), bid: Number(r.bid), ask: Number(r.ask) }
    em[String(r.symbol)] = String(r.em)
  }
  return { precos, em }
}

/** O preço para EXECUTAR: tem de existir e ter menos de 5 s. Senão, 409 e nada acontece. */
function precoParaExecutar(symbol: string, precos: MapaPrecos, em: Record<string, string>): Preco {
  const p = precos[symbol]
  if (!p || !precoFresco(em[symbol])) {
    throw new ErroOrdem(409, `sem preço ao vivo para ${symbol} — mercado fechado ou motor parado`)
  }
  return p
}

/** Conta de análise (segue uma estratégia): as regras do programa não se aplicam — ver motor.ts, contaSim. */
export function ehContaDeAnalise(conta: Pick<Conta, 'metricas'>): boolean {
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
}

export async function abrirPosicao(conta: Conta, e: EntradaAbrir) {
  const symbol = String(e.symbol || '').toUpperCase()
  if (e.direcao !== 'buy' && e.direcao !== 'sell') throw new ErroOrdem(400, 'direção inválida')
  const abertas = await posicoesAbertas(conta.id)
  const simbolos = await carregarSimbolos([symbol, ...abertas.map((p) => String(p.symbol))])
  const simbolo = simbolos[symbol]
  if (!simbolo) throw new ErroOrdem(400, `símbolo ${symbol} não disponível`)
  const { precos, em } = await carregarPrecos(simbolosParaMedir(Object.values(simbolos)))
  const preco = precoParaExecutar(symbol, precos, em)
  const regras = ehContaDeAnalise(conta) ? null : ((await regrasDaConta(conta)) as RegrasDeOrdem | null)

  const plano = planearAbertura({
    simbolo, direcao: e.direcao, volume: Number(e.volume), sl: num(e.sl), tp: num(e.tp), preco,
    saldo: Number(conta.sim_saldo ?? 0), alavancagemConta: Number(conta.alavancagem ?? 100),
    posicoesAbertas: abertas.map(posicaoDaLinha), simbolos, precos, regras,
  })
  if (!plano.ok) throw new ErroOrdem(422, plano.erro)

  const agora = new Date().toISOString()
  const { data: pos, error } = await getSupabaseAdmin().from('funded_positions').insert({
    account_id: conta.id, symbol, direcao: e.direcao, volume: plano.volume, preco_entrada: plano.precoExecucao,
    sl: num(e.sl), tp: num(e.tp), comissao: plano.comissao, estado: 'aberta',
    origem: origemValida(e.origem), ideia_ref: e.ideiaRef ? String(e.ideiaRef).slice(0, 200) : null,
    ...(e.comentario ? { comentario: String(e.comentario).slice(0, 64) } : {}),
    tick_entrada: { bid: preco.bid, ask: preco.ask, em: em[symbol] }, aberta_em: agora,
  }).select('*').single()
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
}

export async function criarPendente(conta: Conta, e: EntradaPendente) {
  const symbol = String(e.symbol || '').toUpperCase()
  if (e.direcao !== 'buy' && e.direcao !== 'sell') throw new ErroOrdem(400, 'direção inválida')
  if (e.tipo !== 'limit' && e.tipo !== 'stop') throw new ErroOrdem(400, 'tipo inválido (limit ou stop)')
  const simbolos = await carregarSimbolos([symbol])
  const simbolo = simbolos[symbol]
  if (!simbolo) throw new ErroOrdem(400, `símbolo ${symbol} não disponível`)
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
  const { data, error } = await getSupabaseAdmin().from('funded_orders').insert({
    account_id: conta.id, symbol, direcao: e.direcao, tipo: e.tipo, volume: v.volume, preco: Number(e.preco),
    sl: num(e.sl), tp: num(e.tp), estado: 'pendente', origem: origemValida(e.origem),
    ideia_ref: e.ideiaRef ? String(e.ideiaRef).slice(0, 200) : null, expira_em: expira,
    ...(e.comentario ? { comentario: String(e.comentario).slice(0, 64) } : {}),
  }).select('*').single()
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

export async function estadoCompleto(conta: Conta, modo: ModoSessao) {
  const db = getSupabaseAdmin()
  const segue = conta.segue_estrategia ? String(conta.segue_estrategia) : null
  const [abertas, { data: fechadas }, { data: pendentes }, regras, { data: todasFechadas }, { data: estrategia }] = await Promise.all([
    posicoesAbertas(conta.id),
    db.from('funded_positions').select('*').eq('account_id', conta.id).eq('estado', 'fechada')
      .order('fechada_em', { ascending: false }).limit(100),
    db.from('funded_orders').select('*').eq('account_id', conta.id).eq('estado', 'pendente')
      .order('criada_em', { ascending: false }),
    regrasDaConta(conta),
    // O desempenho mede a conta INTEIRA, não só as 100 do histórico visível.
    db.from('funded_positions')
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
  const estado = estadoDaConta(saldo, Number(conta.alavancagem ?? 100), abertas.map(posicaoDaLinha), simbolos, precos)
  const metricas = (conta.metricas as Record<string, unknown>) ?? {}
  const limites = limitesDaConta(
    regras, Number(conta.saldo_inicial ?? 0), estado.equity,
    conta.sim_ancora_dia == null ? null : Number(conta.sim_ancora_dia), Number(metricas.fase ?? 1),
  )
  const desempenho = desempenhoDaConta({
    saldoInicial: Number(conta.saldo_inicial ?? 0),
    equity: estado.equity,
    fechadas: (todasFechadas ?? []) as unknown as LinhaFechada[],
    abertasIds: new Set(abertas.map((p) => String(p.id))),
  })
  return {
    modo,
    desempenho,
    conta: {
      id: conta.id, login: conta.mt5_login, servidor: conta.servidor ?? SERVIDOR_SIMULADO,
      tipo: conta.tipo, estado: conta.estado,
      etiqueta: tipoCurto(String(conta.tipo), metricas), estadoCurto: estadoCurto(String(conta.estado), metricas),
      motivo: conta.quebrou_regra ?? null, quebradaEm: conta.quebrada_em ?? null,
      saldoInicial: Number(conta.saldo_inicial ?? 0), alavancagem: Number(conta.alavancagem ?? 100),
      diasNegociados: Number(conta.sim_dias_negociados ?? 0),
      ancoraDia: conta.sim_ancora_dia == null ? null : Number(conta.sim_ancora_dia),
      fase: Number(metricas.fase ?? 1),
      analise: ehContaDeAnalise(conta),
      aceitaT2T: Boolean(conta.aceita_t2t),
      segueEstrategia: segue
        ? { slug: segue, nome: String((estrategia as { nome?: string } | null)?.nome ?? segue), ativa: (estrategia as { ativo?: boolean } | null)?.ativo !== false }
        : null,
    },
    estado: { saldo, ...estado },
    limites,
    regras,
    posicoes: abertas,
    historico: fechadas ?? [],
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

/**
 * A AVALIAÇÃO DE UMA CONTA SIMULADA A CADA PREÇO — pura.
 *
 * Recebe a fotografia da conta (saldo, posições, ordens, regras) e os preços, e devolve o que
 * TEM DE ACONTECER: que pendentes disparam, que posições fecham e porquê, se a conta quebrou, se
 * passou. Não lê a base, não escreve, não sabe que horas são a não ser pelo `agora` que recebe.
 *
 * Porquê pura: é aqui que se decide o dinheiro dos alunos. Uma decisão destas tem de se poder
 * reproduzir com um tick falso numa linha de teste — e tem de dar o MESMO resultado no motor e
 * no teste, o que só é possível se não houver nada escondido lá dentro.
 *
 * A matemática (lucro, margem, stop-out, SL/TP, pendentes) é a partilhada com o site
 * (lib/mtmfunded/simulado/matematica.ts) e as regras são as do cron do MT5 (lib/mtmfunded/regras.ts).
 * Nada aqui é reimplementado: se o site e o motor fizessem contas cada um à sua maneira, a mesma
 * conta podia estar viva num e quebrada no outro.
 *
 * A ORDEM dentro de um tick, e porquê:
 *  1. pendentes expiradas saem — uma ordem que expirou não pode disparar no mesmo instante;
 *  2. pendentes que disparam entram — ao preço da ordem, com a comissão debitada;
 *  3. SL/TP — ao nível exacto, sem requotes (regra publicada); se o SL e o TP tocam no mesmo
 *     tick (um gap), vale o SL: na dúvida, o lado que protege a conta;
 *  4. stop-out — nível de margem abaixo de STOP_OUT_PCT fecha a PIOR posição, uma de cada vez,
 *     como uma corretora;
 *  5. regras — perda diária, perda máxima, prazo: quebra fecha tudo;
 *  6. objectivo — só desafios, só se elegível; torneios nunca «passam».
 */
import {
  STOP_OUT_PCT,
  comissaoUsd,
  estadoDaConta,
  lucroUsd,
  margemUsd,
  pendenteDispara,
  precoDeFecho,
  tocaSl,
  tocaTp,
  type Direcao,
  type MapaPrecos,
  type PosicaoAberta,
  type Simbolo,
} from '../../lib/mtmfunded/simulado/matematica'
import { avaliarConta, type RegrasConta, type Veredicto } from '../../lib/mtmfunded/regras'
import { decidirGestao, type Gestao, type TpParcial } from '../../lib/mtmfunded/simulado/avancadas'

export type Origem = 'manual' | 'ideia_mtm' | 'scanner' | 'copia'

export interface PosicaoSim extends PosicaoAberta {
  id: string
  account_id: string
  origem: Origem
  /** Trailing, break-even e TPs parciais (migração 072). Sem gestão = null. */
  gestao?: Gestao | null
}

export interface OrdemSim {
  id: string
  account_id: string
  symbol: string
  direcao: Direcao
  tipo: 'limit' | 'stop'
  volume: number
  preco: number
  sl: number | null
  tp: number | null
  origem: Origem
  expira_em: string | null
  /** Pendentes com o mesmo grupo são OCO: a primeira a disparar cancela as outras. */
  oco_grupo?: string | null
  gestao?: Gestao | null
}

export interface ContaSim {
  id: string
  saldo: number
  saldoInicial: number
  alavancagem: number
  /** Saldo de fecho do dia da corretora anterior (22:00 UTC) — a âncora da perda diária. */
  ancoraDia: number
  picoEquity: number
  diasNegociados: number
  /** Desde quando se contam os dias do prazo (criação da conta, ou início do torneio). */
  inicioEm: string | null
  torneio: boolean
  regras: RegrasConta | null
  /** Objectivo desta fase em % (0 = sem objectivo, e é sempre 0 nos torneios). */
  objetivoPct: number
}

/** Preço de fecho de uma posição com o registo do tick — a resposta a uma contestação. */
export interface Fecho {
  posicaoId: string
  preco: number
  pnl: number
  motivo: 'sl' | 'tp' | 'stop_out' | 'regra_quebrada' | 'fim_de_ciclo'
  symbol: string
}

export interface Execucao {
  ordemId: string
  preco: number
  comissao: number
  symbol: string
}

/** Take-profit parcial executado pelo motor (funded_fechar_parcial com motivo «tp_parcial»). */
export interface Parcial {
  posicaoId: string
  volume: number
  preco: number
  pnl: number
  symbol: string
  indice: number
  /** O estado dos TPs a gravar na mesma transacção (é também a guarda contra repetições). */
  tps: TpParcial[] | null
}

/** SL movido pela gestão (trailing ou break-even). */
export interface Modificacao {
  posicaoId: string
  slAntes: number | null
  sl: number
  motivo: 'trailing' | 'break_even'
  beFeito: boolean
  symbol: string
}

export interface Decisoes {
  expirar: string[]
  /** Pendentes OCO canceladas porque a irmã disparou (a base fá-lo na mesma transacção). */
  cancelarOco: string[]
  parciais: Parcial[]
  modificar: Modificacao[]
  /** Pendentes que dispararam mas a conta não tinha margem para as abrir. */
  cancelarSemMargem: string[]
  executar: Execucao[]
  fechar: Fecho[]
  /** Pendentes canceladas porque a conta quebrou ou passou. */
  cancelarPorFim: string[]
  estado: { saldo: number; equity: number; margem: number; nivelMargemPct: number | null; semPreco: string[] }
  veredicto: Veredicto | null
  quebra: { motivo: string; detalhe?: string } | null
  objetivo: boolean
  /** Houve decisões que só se tomam com uma fotografia CONSISTENTE da conta (ver motor.ts). */
  precisaConfirmacao: boolean
}

export interface EntradaAvaliacao {
  conta: ContaSim
  posicoes: PosicaoSim[]
  ordens: OrdemSim[]
  simbolos: Record<string, Simbolo>
  precos: MapaPrecos
  /** Símbolos com preço E mercado aberto: só nestes há fills (fechado → último preço, sem fills). */
  negociaveis: Set<string>
  agora: Date
  lucroPorDia: Record<string, number>
}

const arred = (x: number) => Math.round(x * 100) / 100

/** Nível de margem sem posições é infinito — nunca stop-out. */
function nivel(saldo: number, alav: number, pos: PosicaoSim[], s: Record<string, Simbolo>, p: MapaPrecos) {
  return estadoDaConta(saldo, alav, pos, s, p)
}

export function avaliarTick(e: EntradaAvaliacao): Decisoes {
  const { conta, simbolos, precos, negociaveis, agora } = e
  const d: Decisoes = {
    expirar: [], cancelarOco: [], parciais: [], modificar: [], cancelarSemMargem: [], executar: [], fechar: [], cancelarPorFim: [],
    estado: { saldo: conta.saldo, equity: conta.saldo, margem: 0, nivelMargemPct: null, semPreco: [] },
    veredicto: null, quebra: null, objetivo: false, precisaConfirmacao: false,
  }
  let saldo = conta.saldo
  let posicoes = [...e.posicoes]
  let ordens = [...e.ordens]

  // ── 1. expiradas ────────────────────────────────────────────────────────────
  ordens = ordens.filter((o) => {
    if (o.expira_em && new Date(o.expira_em).getTime() <= agora.getTime()) {
      d.expirar.push(o.id)
      return false
    }
    return true
  })

  // ── 2. pendentes que disparam ──────────────────────────────────────────────
  for (const o of [...ordens]) {
    const s = simbolos[o.symbol]
    const p = precos[o.symbol]
    if (!s || !p || !negociaveis.has(o.symbol)) continue
    if (!pendenteDispara(o.direcao, o.tipo, o.preco, p)) continue
    ordens = ordens.filter((x) => x.id !== o.id)

    // Margem para a abrir: uma corretora recusa a ordem que não cabe na conta, e o simulador
    // também — senão uma pendente esquecida abria um lote que ninguém podia pagar.
    const m = margemUsd(s, o.volume, o.preco, conta.alavancagem, precos)
    const comissao = comissaoUsd(s, o.volume)
    const antes = nivel(saldo, conta.alavancagem, posicoes, simbolos, precos)
    if (m == null || antes.margemLivre - comissao < m) {
      d.cancelarSemMargem.push(o.id)
      continue
    }
    saldo = arred(saldo - comissao)
    d.executar.push({ ordemId: o.id, preco: o.preco, comissao, symbol: o.symbol })
    posicoes.push({
      id: `ordem:${o.id}`, account_id: o.account_id, symbol: o.symbol, direcao: o.direcao, volume: o.volume,
      preco_entrada: o.preco, sl: o.sl, tp: o.tp, comissao, swap: 0, origem: o.origem,
      gestao: o.gestao ? { ...o.gestao, volume_inicial: o.volume } : null,
    })
    // OCO: as irmãs saem já da lista — não podem disparar no mesmo tick.
    if (o.oco_grupo) {
      for (const irma of ordens.filter((x) => x.oco_grupo === o.oco_grupo)) d.cancelarOco.push(irma.id)
      ordens = ordens.filter((x) => x.oco_grupo !== o.oco_grupo)
    }
  }

  // ── 3. SL / TP ─────────────────────────────────────────────────────────────
  const fechar = (pos: PosicaoSim, preco: number, motivo: Fecho['motivo']): boolean => {
    const s = simbolos[pos.symbol]
    if (!s) return false
    const l = lucroUsd(s, pos.direcao, pos.volume, pos.preco_entrada, preco, precos)
    // Sem conversão para USD não se fecha às cegas: fica para o tick em que houver.
    if (l == null) return false
    const pnl = arred(l + (pos.swap || 0))
    saldo = arred(saldo + pnl)
    posicoes = posicoes.filter((x) => x.id !== pos.id)
    d.fechar.push({ posicaoId: pos.id, preco, pnl, motivo, symbol: pos.symbol })
    return true
  }

  for (const pos of [...posicoes]) {
    const p = precos[pos.symbol]
    if (!p || !negociaveis.has(pos.symbol)) continue
    // Uma posição que nasceu NESTE tick (pendente disparada) só é vista pelo SL/TP no seguinte:
    // fechá-la no mesmo instante em que abriu é um fill e um fecho ao mesmo preço, que ninguém
    // consegue explicar a um aluno. O motor troca o id provisório `ordem:` pelo real.
    if (pos.id.startsWith('ordem:')) continue
    if (tocaSl(pos, p)) { fechar(pos, pos.sl as number, 'sl'); continue }

    // Gestão (072): TPs parciais → break-even → trailing. O SL já foi visto acima: num gap que
    // salta o SL e o TP1 ao mesmo tempo, o SL ganha (a mesma regra do SL e TP no mesmo tick).
    const s = simbolos[pos.symbol]
    let atual = pos
    if (s && pos.gestao) {
      const g = decidirGestao(pos, s, p, precos)
      let fechou = false
      for (const parte of g.parciais) {
        if (parte.fechaTudo) {
          fechou = fechar(atual, parte.preco, 'tp')
          break
        }
        saldo = arred(saldo + parte.pnl)
        d.parciais.push({ posicaoId: pos.id, volume: parte.volume, preco: parte.preco, pnl: parte.pnl, symbol: pos.symbol, indice: parte.indice, tps: g.tps })
        const restante = Math.round((atual.volume - parte.volume) * 100) / 100
        // A comissão fica proporcional na mãe, como em funded_fechar_parcial.
        atual = { ...atual, volume: restante, comissao: arred(atual.comissao * (restante / atual.volume)), gestao: { ...atual.gestao!, tps: g.tps } }
      }
      if (fechou) continue
      if (g.novoSl != null && g.motivoSl) {
        d.modificar.push({ posicaoId: pos.id, slAntes: pos.sl, sl: g.novoSl, motivo: g.motivoSl, beFeito: g.beFeito, symbol: pos.symbol })
        atual = { ...atual, sl: g.novoSl, gestao: { ...atual.gestao!, be_feito: g.beFeito } }
      } else if (g.beFeito && !pos.gestao.be_feito) {
        // BE armado mas o SL já estava melhor: marca-se feito para não voltar a tentar.
        d.modificar.push({ posicaoId: pos.id, slAntes: pos.sl, sl: pos.sl as number, motivo: 'break_even', beFeito: true, symbol: pos.symbol })
        atual = { ...atual, gestao: { ...atual.gestao!, be_feito: true } }
      }
      if (atual !== pos) posicoes = posicoes.map((x) => (x.id === pos.id ? atual : x))
    }
    if (tocaTp(atual, p)) fechar(atual, atual.tp as number, 'tp')
  }

  // ── 4. stop-out ────────────────────────────────────────────────────────────
  for (let guarda = 0; guarda < 100; guarda++) {
    const st = nivel(saldo, conta.alavancagem, posicoes, simbolos, precos)
    if (st.nivelMargemPct == null || st.nivelMargemPct >= STOP_OUT_PCT) break
    // A pior posição: a de maior prejuízo flutuante, com preço.
    let pior: { pos: PosicaoSim; l: number; preco: number } | null = null
    for (const pos of posicoes) {
      const s = simbolos[pos.symbol]
      const p = precos[pos.symbol]
      if (!s || !p) continue
      const preco = precoDeFecho(pos.direcao, p)
      const l = lucroUsd(s, pos.direcao, pos.volume, pos.preco_entrada, preco, precos)
      if (l == null) continue
      if (!pior || l < pior.l) pior = { pos, l, preco }
    }
    if (!pior || !fechar(pior.pos, pior.preco, 'stop_out')) break
    d.precisaConfirmacao = true
  }

  // ── 5 e 6. regras e objectivo ─────────────────────────────────────────────
  const st = nivel(saldo, conta.alavancagem, posicoes, simbolos, precos)
  d.estado = { saldo, equity: st.equity, margem: st.margem, nivelMargemPct: st.nivelMargemPct, semPreco: st.semPreco }

  // Uma posição sem preço conta como flutuante zero: decidir uma quebra (ou uma passagem) com
  // um buraco destes na equity seria decidir sobre um número inventado.
  if (conta.regras && st.semPreco.length === 0) {
    const diasDecorridos = conta.inicioEm
      ? Math.floor((agora.getTime() - new Date(conta.inicioEm).getTime()) / 86_400_000)
      : undefined
    const v = avaliarConta(conta.regras, {
      saldoInicial: conta.saldoInicial,
      equity: st.equity,
      saldoReferenciaDia: conta.ancoraDia,
      lucroPorDia: e.lucroPorDia,
      diasNegociados: conta.diasNegociados,
      diasDecorridos,
    })
    d.veredicto = v

    if (v.quebrou) {
      d.quebra = { motivo: String(v.motivo), detalhe: v.detalhe }
      d.precisaConfirmacao = true
    } else if (!conta.torneio && conta.objetivoPct > 0 && v.elegivel && v.resultadoPct >= conta.objetivoPct) {
      d.objetivo = true
      d.precisaConfirmacao = true
    }

    if (d.quebra || d.objetivo) {
      const motivo: Fecho['motivo'] = d.quebra ? 'regra_quebrada' : 'fim_de_ciclo'
      for (const pos of [...posicoes]) {
        const p = precos[pos.symbol]
        if (p) fechar(pos, precoDeFecho(pos.direcao, p), motivo)
      }
      d.cancelarPorFim = ordens.map((o) => o.id)
      const fim = nivel(saldo, conta.alavancagem, posicoes, simbolos, precos)
      d.estado = { saldo, equity: fim.equity, margem: fim.margem, nivelMargemPct: fim.nivelMargemPct, semPreco: fim.semPreco }
    }
  }

  return d
}

// ── o dia da corretora e a medição dos dias ────────────────────────────────────

/** O dia da corretora vira às 22:00 UTC (convenção fixa, igual no site): 22:00 de dia 1 já é dia 2. */
export function diaCorretora(em: Date | string): string {
  const t = typeof em === 'string' ? new Date(em) : em
  return new Date(t.getTime() + 2 * 3600_000).toISOString().slice(0, 10)
}

export interface FechoHistorico {
  pnl: number
  comissao: number
  fechada_em: string
  origem: Origem
}

/** Lucro LÍQUIDO por dia da corretora, para a regra de consistência. */
export function lucroPorDiaDe(fechos: FechoHistorico[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of fechos) {
    const k = diaCorretora(f.fechada_em)
    out[k] = arred((out[k] ?? 0) + Number(f.pnl ?? 0) - Number(f.comissao ?? 0))
  }
  return out
}

/**
 * O resultado SEM as ideias da casa — para a classificação dos torneios.
 *
 * Decisão do mapa: aceitar uma ideia da MTM numa conta de torneio é permitido, mas não pode
 * contar para o ranking — senão ganhava o torneio quem copiasse mais sinais da casa, e o
 * torneio mede o trader. Tira-se à equity o que as posições `ideia_mtm` fizeram (fechadas,
 * líquidas de comissão, e abertas, a flutuar).
 */
export function resultadoSemIdeiasPct(
  saldoInicial: number,
  equity: number,
  fechosIdeias: FechoHistorico[],
  abertasIdeias: PosicaoSim[],
  simbolos: Record<string, Simbolo>,
  precos: MapaPrecos,
): number {
  if (!(saldoInicial > 0)) return 0
  let contributo = 0
  for (const f of fechosIdeias) contributo += Number(f.pnl ?? 0) - Number(f.comissao ?? 0)
  for (const p of abertasIdeias) {
    const s = simbolos[p.symbol]
    const q = precos[p.symbol]
    contributo -= Number(p.comissao ?? 0)
    if (!s || !q) continue
    contributo += lucroUsd(s, p.direcao, p.volume, p.preco_entrada, precoDeFecho(p.direcao, q), precos) ?? 0
  }
  return arred(((equity - contributo - saldoInicial) / saldoInicial) * 100)
}

// ── sessões de negociação da corretora ─────────────────────────────────────────

export type Sessoes = Record<string, Array<{ from: string; to: string }>>
const DIAS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/**
 * O símbolo está em sessão? As `tradeSessions` vêm em HORA DO SERVIDOR DA CORRETORA, e o desvio
 * (`desvioMin`) mede-se nos próprios ticks (brokerTime − time): assim a mudança de hora de verão
 * da corretora não precisa de ninguém a lembrar-se dela.
 */
export function emSessao(sessoes: Sessoes | null | undefined, agora: Date, desvioMin: number): boolean | null {
  if (!sessoes) return null
  const t = new Date(agora.getTime() + desvioMin * 60_000)
  const lista = sessoes[DIAS[t.getUTCDay()]] ?? []
  const hms = t.toISOString().slice(11, 23)
  return lista.some((s) => hms >= s.from && hms <= s.to)
}

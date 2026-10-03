/**
 * O SELETOR DE CONTAS DO WEBTRADER — de «as contas da pessoa» para as entradas do seletor.
 *
 * Fontes (sincronizadas depois do login MTM):
 *   · MTM Funded simuladas da pessoa (/api/mtmfunded/simulado/contas) — desafios/programas,
 *     torneios e contas que seguem uma estratégia;
 *   · contas abertas com Login + Password MTM Funded neste separador (master ou investor);
 *   · contas reais do ligador (/api/webtrader/contas): TradeLocker e MT5/MT4 (MetaApi), com o
 *     motivo de bloqueio da quota;
 *   · sessões TradeLocker antigas deste separador (antes de o WebTrader ligar pelo ligador).
 *
 * Cada entrada leva a ETIQUETA DO DONO (113, `etiquetaDoDono`): o nome próprio que ele deu à conta,
 * o mesmo campo para as três famílias. `etiqueta` continua a ser o que sempre foi — a fase da conta
 * MTM Funded (F1/F2/Funded/Torneio) ou o nome da plataforma nas reais.
 *
 * Puro: sem React, sem browser — testado em lib/webtrader/__tests__/entrada.check.ts.
 */
import { ehContaMestre, ehContaMinha, ehContaPortefolioDaCasa } from './filtro-contas'
import { ehContaRealDaCasa } from '../mtmfunded/conta-real-casa'

export type PlataformaSeletor = 'mtmfunded' | 'tradelocker' | 'mt5'

export interface FundedDoUtilizador {
  id: string
  /** O tipo da conta na base (desafio/financiada/torneio/real/provider) — `provider` = mestre. */
  tipo?: string | null
  mt5_login: string | null
  etiqueta: string
  /** 113 — a etiqueta que o dono pôs (não confundir com `etiqueta`, que aqui é a fase F1/F2/Funded). */
  etiquetaDoDono?: string | null
  estadoCurto: string
  sim_saldo: number | null
  sim_equity: number | null
  aviso?: string
  programa?: { nome: string } | null
  segueEstrategia?: { slug: string; nome: string } | null
  /**
   * A conta é MESTRE desta estratégia (`mestres_estrategias.conta_mestre_id`). Nada a ver com
   * `segueEstrategia`: uma conta de cliente SEGUE uma estratégia, a mestre É a estratégia — e nas
   * oito mestres vivas `segue_estrategia` está a null, por isso sem este campo a pastilha do
   * seletor ficava muda exactamente nas contas que interessava nomear.
   */
  mestreDe?: { slug: string; nome: string } | null
  /** 'investor' = conta de outra pessoa ligada com a password investor — abre só para ver. */
  modo?: 'master' | 'investor'
  /**
   * As marcas da LINHA, como a base as tem — a rota do seletor devolve a conta inteira (`...c`).
   * São elas que decidem «esta conta é minha?», «leva crachá Real?» e «é uma carteira?»; o seletor
   * não as reinventa (lib/mtmfunded/contas-da-casa.ts e conta-real-casa.ts).
   */
  conta_casa?: boolean | null
  conta_real_casa?: boolean | null
  conta_portefolio?: boolean | null
  recolhe_todos_sinais?: boolean | null
}

export interface SessaoFunded { accountId: string; login: string; etiqueta?: string; estadoCurto?: string; aviso?: string; modo: 'master' | 'investor' }

export interface ContaRealSeletor {
  ref: string
  plataforma: PlataformaSeletor
  rotulo: string | null
  /** 113 — a etiqueta que o dono pôs nesta conta (null = não pôs nenhuma). */
  etiquetaDoDono: string | null
  login: string | null
  servidor: string | null
  demo: boolean
  real: boolean
  bloqueada: string | null
  origem: 'ligador' | 'webtrader' | 'sessao'
  versao?: 'mt4' | 'mt5'
}

export interface SessaoTLSeletor { ref: string; login: string; servidor: string; demo: boolean; rotulo?: string | null }

export interface EntradaSeletor {
  id: string
  plataforma: PlataformaSeletor
  login: string | null
  etiqueta: string
  estadoCurto: string
  modo: 'master' | 'investor'
  saldo?: number | null
  equity?: number | null
  /** false = aberta só neste separador (tem «sair»). */
  propria: boolean
  segue?: string | null
  programa?: string | null
  /** MTM Funded: o aviso fixo da conta (lib/mtmfunded/aviso-conta.ts). */
  aviso?: string | null
  /**
   * 113 — A ETIQUETA DO DONO, o nome que ele deu à conta. Vem das quatro tabelas de contas e é o
   * MESMO campo para as três famílias, para o seletor a mostrar sem saber de onde ela veio.
   * `null` = sem etiqueta: o seletor mostra o que mostrava antes da 113.
   */
  etiquetaDoDono: string | null
  /** false = esta conta não guarda etiqueta (sessão TradeLocker do separador, sem linha na base). */
  podeEtiquetar: boolean
  /**
   * 24/09 — conta MESTRE de uma estratégia do MTM Auto (`tipo = 'provider'`): é da casa, não é
   * para a pessoa negociar. O filtro do seletor esconde-as por omissão (lib/webtrader/filtro-contas.ts).
   */
  mestre: boolean
  /**
   * 01/10 — a conta é do CAPITAL de quem está a olhar. Nasceu separada de `mestre` porque as duas
   * carteiras de portefólio do dono são as duas coisas: mestres (`tipo = 'provider'`) e dele.
   * Ver `ehContaMinha` em lib/mtmfunded/contas-da-casa.ts.
   */
  minha: boolean
  /**
   * 01/10 — conta REAL da casa (109, `conta_real_casa`): é ela que troca o crachá dourado
   * «Funded» por «Real». Nome por extenso para não se confundir com `real`, logo abaixo, que é
   * uma conta na CORRETORA da pessoa (TradeLocker/MT5) e é outra coisa.
   */
  contaRealDaCasa?: boolean
  real?: ContaRealSeletor
}

/**
 * O TEXTO DA PASTILHA DOURADA de uma conta MTM Funded — «Real», «Funded · Wolf», «F1», «Torneio».
 *
 * Porque é que isto não é só `etiqueta`: a fase vem de `lib/mtmfunded/etiquetas.ts::tipoCurto`, que
 * não conhece o tipo `provider` (as mestres) e o deixa cair no ramo das fases — uma mestre saía
 * rotulada «F1», como se fosse a primeira fase de um desafio. Mudar `tipoCurto` não serve: esse
 * ficheiro existe IGUAL na app MTM Auto e está preso pela paridade entre repositórios. A correcção
 * vive aqui, no seletor, que é quem sabe o que é uma mestre (`mestre: true`).
 *
 * 01/10 — «REAL» ANTES DE «FUNDED», e só nas contas com `conta_real_casa = true` (109). As duas
 * carteiras de portefólio do dono são capital real dele e diziam «Funded», que é o nome de um
 * programa de avaliação: a palavra errada numa conta de dinheiro verdadeiro. As contas MTM Funded
 * que são financiadas de verdade continuam a dizer «Funded» — essas não têm a marca.
 *
 * Puro — testado em lib/webtrader/__tests__/entrada.check.ts.
 */
export function pastilhaDaConta(e: Pick<EntradaSeletor, 'etiqueta' | 'mestre' | 'segue'> & { contaRealDaCasa?: boolean }): string {
  const base = e.contaRealDaCasa ? 'Real' : e.mestre ? 'Funded' : e.etiqueta
  const nome = String(e.segue ?? '').replace(/^MTM Auto\s+/i, '').trim()
  return nome ? `${base} · ${nome}` : base
}

const NOME: Record<PlataformaSeletor, string> = { mtmfunded: 'MTM Funded', tradelocker: 'TradeLocker', mt5: 'MT5' }

export function montarSeletor(f: {
  funded: FundedDoUtilizador[] | null | undefined
  sessoesFunded?: Record<string, SessaoFunded>
  reais?: ContaRealSeletor[]
  sessoesTL?: Record<string, SessaoTLSeletor>
}): EntradaSeletor[] {
  const out: EntradaSeletor[] = []
  const ids = new Set<string>()
  const juntar = (e: EntradaSeletor) => {
    if (ids.has(e.id)) return
    ids.add(e.id)
    out.push(e)
  }

  for (const c of f.funded ?? []) {
    juntar({
      id: c.id, plataforma: 'mtmfunded', login: c.mt5_login, etiqueta: c.etiqueta,
      // Ligada com a investor: diz-se no próprio seletor, antes de abrir, que é só para ver.
      estadoCurto: c.modo === 'investor' ? `${c.estadoCurto} · só leitura` : c.estadoCurto,
      modo: c.modo === 'investor' ? 'investor' : 'master',
            saldo: c.sim_saldo, equity: c.sim_equity, propria: true,
      // Numa mestre o nome da estratégia vem de `mestreDe`; numa conta de cliente, de `segueEstrategia`.
      segue: c.segueEstrategia?.nome ?? c.mestreDe?.nome ?? null,
      programa: c.programa?.nome ?? null, aviso: c.aviso ?? null,
      // Só o DONO etiqueta: uma conta ligada com a password investor é de outra pessoa.
      etiquetaDoDono: c.etiquetaDoDono ?? null, podeEtiquetar: c.modo !== 'investor', mestre: ehContaMestre(c),
      // Mestre E minha ao mesmo tempo nas carteiras de portefólio: as duas respostas valem.
      // Uma conta ligada com a password investor é de OUTRA pessoa — nunca é «minha».
      minha: c.modo !== 'investor' && ehContaMinha(c),
      contaRealDaCasa: ehContaRealDaCasa(c) || ehContaPortefolioDaCasa(c),
    })
  }
  for (const s of Object.values(f.sessoesFunded ?? {})) {
    if (!s?.accountId) continue
    juntar({ id: s.accountId, plataforma: 'mtmfunded', login: s.login, etiqueta: s.etiqueta ?? '—', estadoCurto: s.estadoCurto ?? '—', aviso: s.aviso ?? null, modo: s.modo, propria: false, etiquetaDoDono: null, podeEtiquetar: false, mestre: false,
      // Conta aberta com credenciais neste separador: não é mestre, e em «As minhas» é onde ela
      // sempre esteve — mudar isso agora escondia-a de quem a acabou de abrir.
      minha: true })
  }

  // Reais: as do ligador primeiro; sessões TradeLocker antigas só se a mesma conta não estiver ligada.
  const reais: ContaRealSeletor[] = [...(f.reais ?? [])]
  for (const s of Object.values(f.sessoesTL ?? {})) {
    if (!s?.ref || reais.some((r) => r.ref === s.ref)) continue
    const jaLigada = reais.some((r) => r.plataforma === 'tradelocker' && r.origem !== 'sessao' && r.login != null && r.login === s.login &&
      String(r.servidor ?? '').toLowerCase() === String(s.servidor ?? '').toLowerCase() && r.demo === s.demo)
    if (jaLigada) continue
    reais.push({ ref: s.ref, plataforma: 'tradelocker', rotulo: s.rotulo ?? null, etiquetaDoDono: null, login: s.login, servidor: s.servidor, demo: s.demo, real: true, bloqueada: null, origem: 'sessao' })
  }
  for (const r of reais) {
    juntar({
      id: r.ref, plataforma: r.plataforma, login: r.login, etiqueta: r.versao === 'mt4' ? 'MT4' : NOME[r.plataforma] ?? r.plataforma,
      estadoCurto: r.bloqueada ? 'Bloqueada' : r.demo ? 'Demo' : 'Real', modo: 'master', propria: r.origem !== 'sessao', real: r,
      // A sessão do separador não tem linha na base — não há onde guardar a etiqueta.
      etiquetaDoDono: r.etiquetaDoDono ?? null, podeEtiquetar: r.origem !== 'sessao',
      // Uma conta na corretora da pessoa nunca é mestre — as mestres são MTM Funded da casa.
      mestre: false, minha: true,
    })
  }
  return out
}

/** A conta a abrir: a actual se ainda existe; senão a última usada; senão a primeira que abre. */
export function contaInicial(entradas: EntradaSeletor[], atual: string | null | undefined, ultima: string | null | undefined): string | null {
  const abriveis = entradas.filter((e) => !e.real?.bloqueada).map((e) => e.id)
  if (atual && abriveis.includes(atual)) return atual
  if (ultima && abriveis.includes(ultima)) return ultima
  return abriveis[0] ?? null
}

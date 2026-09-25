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
import { ehContaMestre } from './filtro-contas'

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
  /** 'investor' = conta de outra pessoa ligada com a password investor — abre só para ver. */
  modo?: 'master' | 'investor'
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
  real?: ContaRealSeletor
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
      saldo: c.sim_saldo, equity: c.sim_equity, propria: true, segue: c.segueEstrategia?.nome ?? null, programa: c.programa?.nome ?? null, aviso: c.aviso ?? null,
      // Só o DONO etiqueta: uma conta ligada com a password investor é de outra pessoa.
      etiquetaDoDono: c.etiquetaDoDono ?? null, podeEtiquetar: c.modo !== 'investor', mestre: ehContaMestre(c),
    })
  }
  for (const s of Object.values(f.sessoesFunded ?? {})) {
    if (!s?.accountId) continue
    juntar({ id: s.accountId, plataforma: 'mtmfunded', login: s.login, etiqueta: s.etiqueta ?? '—', estadoCurto: s.estadoCurto ?? '—', aviso: s.aviso ?? null, modo: s.modo, propria: false, etiquetaDoDono: null, podeEtiquetar: false, mestre: false })
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
      mestre: false,
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

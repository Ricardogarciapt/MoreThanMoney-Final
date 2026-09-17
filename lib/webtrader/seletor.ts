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
 * Puro: sem React, sem browser — testado em lib/webtrader/__tests__/entrada.check.ts.
 */

export type PlataformaSeletor = 'mtmfunded' | 'tradelocker' | 'mt5'

export interface FundedDoUtilizador {
  id: string
  mt5_login: string | null
  etiqueta: string
  estadoCurto: string
  sim_saldo: number | null
  sim_equity: number | null
  aviso?: string
  programa?: { nome: string } | null
  segueEstrategia?: { slug: string; nome: string } | null
}

export interface SessaoFunded { accountId: string; login: string; etiqueta?: string; estadoCurto?: string; aviso?: string; modo: 'master' | 'investor' }

export interface ContaRealSeletor {
  ref: string
  plataforma: PlataformaSeletor
  rotulo: string | null
  login: string | null
  servidor: string | null
  demo: boolean
  real: boolean
  bloqueada: string | null
  origem: 'ligador' | 'webtrader' | 'sessao'
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
      id: c.id, plataforma: 'mtmfunded', login: c.mt5_login, etiqueta: c.etiqueta, estadoCurto: c.estadoCurto, modo: 'master',
      saldo: c.sim_saldo, equity: c.sim_equity, propria: true, segue: c.segueEstrategia?.nome ?? null, programa: c.programa?.nome ?? null, aviso: c.aviso ?? null,
    })
  }
  for (const s of Object.values(f.sessoesFunded ?? {})) {
    if (!s?.accountId) continue
    juntar({ id: s.accountId, plataforma: 'mtmfunded', login: s.login, etiqueta: s.etiqueta ?? '—', estadoCurto: s.estadoCurto ?? '—', aviso: s.aviso ?? null, modo: s.modo, propria: false })
  }

  // Reais: as do ligador primeiro; sessões TradeLocker antigas só se a mesma conta não estiver ligada.
  const reais: ContaRealSeletor[] = [...(f.reais ?? [])]
  for (const s of Object.values(f.sessoesTL ?? {})) {
    if (!s?.ref || reais.some((r) => r.ref === s.ref)) continue
    const jaLigada = reais.some((r) => r.plataforma === 'tradelocker' && r.origem !== 'sessao' && r.login != null && r.login === s.login &&
      String(r.servidor ?? '').toLowerCase() === String(s.servidor ?? '').toLowerCase() && r.demo === s.demo)
    if (jaLigada) continue
    reais.push({ ref: s.ref, plataforma: 'tradelocker', rotulo: s.rotulo ?? null, login: s.login, servidor: s.servidor, demo: s.demo, real: true, bloqueada: null, origem: 'sessao' })
  }
  for (const r of reais) {
    juntar({
      id: r.ref, plataforma: r.plataforma, login: r.login, etiqueta: NOME[r.plataforma] ?? r.plataforma,
      estadoCurto: r.bloqueada ? 'Bloqueada' : r.demo ? 'Demo' : 'Real', modo: 'master', propria: r.origem !== 'sessao', real: r,
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

/**
 * EQUIDADE DAS CONTAS DA CASA — as contas MTM Funded simuladas marcadas `conta_casa` (082 espelho
 * provider, 092 estratégias por sinais e contas do dono): saldo, equity e flutuante, no total e por
 * estratégia. SÓ ADMIN: em dinheiro. Para fora (clientes, landing) só pips e %, nunca euros/dólares.
 *
 * Soma o valor NOMINAL (o que a conta mostra). A `contribuicao` usa a regra oficial de
 * lib/equidade-mtm.ts (`planoDaEquidade`): financiadas e mestres a 10%; contas REAIS da casa (109) de
 * 1K a 100%, espelhos reais de 10K a 10% e a mestre representada por um espelho real a 0%.
 * Entram também as contas reais da casa sem `conta_casa` (a de T2T do dono).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { factorNaEquidade, planoDaEquidade, type EstrategiaComEspelho, type LinhaContaEquidade } from '@/lib/equidade-mtm'

export interface LinhaCasa {
  id: string
  tipo: string
  estrategia: string | null
  sim_saldo: number | null
  sim_equity: number | null
  saldo_inicial: number | null
  recolhe_todos_sinais?: boolean | null
  /** Factor já decidido por `planoDaEquidade`; sem ele, a regra por tipo (+ conta real, se vier). */
  factor?: number
  conta_real_casa?: boolean | null
}

export interface GrupoEquidade {
  chave: string
  contas: number
  saldoInicial: number
  saldo: number
  equity: number
  flutuante: number
  resultadoPct: number
  contribuicao: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Agrega (puro). Chave do grupo: estratégia seguida, slug da mestre, «todos» ou «outras». */
export function agregarEquidadeCasa(linhas: LinhaCasa[]): { total: GrupoEquidade; porEstrategia: GrupoEquidade[] } {
  const grupos = new Map<string, GrupoEquidade>()
  const somar = (g: GrupoEquidade, l: LinhaCasa) => {
    const inicial = Number(l.saldo_inicial ?? 0)
    const saldo = Number(l.sim_saldo ?? inicial)
    const equity = Number(l.sim_equity ?? saldo)
    g.contas++
    g.saldoInicial += inicial
    g.saldo += saldo
    g.equity += equity
    g.flutuante += equity - saldo
    const factor = l.factor ?? factorNaEquidade({
      tipo: l.tipo === 'provider' ? 'provider' : l.tipo === 'financiada' ? 'financiada' : 'cliente',
      contaReal: l.conta_real_casa === true,
    })
    g.contribuicao += equity * factor
  }
  const vazio = (chave: string): GrupoEquidade => ({ chave, contas: 0, saldoInicial: 0, saldo: 0, equity: 0, flutuante: 0, resultadoPct: 0, contribuicao: 0 })
  const total = vazio('total')
  for (const l of linhas) {
    const chave = l.recolhe_todos_sinais ? 'todos-os-sinais' : (l.estrategia || 'outras')
    if (!grupos.has(chave)) grupos.set(chave, vazio(chave))
    somar(grupos.get(chave)!, l)
    somar(total, l)
  }
  const fechar = (g: GrupoEquidade): GrupoEquidade => ({
    ...g, saldoInicial: r2(g.saldoInicial), saldo: r2(g.saldo), equity: r2(g.equity), flutuante: r2(g.flutuante), contribuicao: r2(g.contribuicao),
    resultadoPct: g.saldoInicial > 0 ? r2(((g.equity - g.saldoInicial) / g.saldoInicial) * 100) : 0,
  })
  return { total: fechar(total), porEstrategia: [...grupos.values()].map(fechar).sort((a, b) => b.equity - a.equity) }
}

export async function equidadeDasContasDaCasa() {
  const db = getSupabaseAdmin()
  const colunas = 'id, tipo, mt5_login, segue_estrategia, provider_slug, metaapi_account_id, sim_saldo, sim_equity, saldo_inicial, recolhe_todos_sinais'
  // Com a 109: as da casa OU reais da casa. Sem ela (coluna em falta), como antes: só `conta_casa`.
  let r = await db.from('mtm_trading_accounts').select(`${colunas}, conta_casa, conta_real_casa`)
    .or('conta_casa.eq.true,conta_real_casa.eq.true').eq('motor', 'sim').eq('estado', 'ativa').limit(2000)
  if (r.error) {
    r = await db.from('mtm_trading_accounts').select(`${colunas}, conta_casa`)
      .eq('conta_casa', true).eq('motor', 'sim').eq('estado', 'ativa').limit(2000) as typeof r
  }
  if (r.error) return { disponivel: false as const, motivo: 'migração 082/092 por aplicar (conta_casa)', total: null, porEstrategia: [] }
  const data = (r.data ?? []) as unknown as Array<Record<string, unknown>>
  // A mestre representada (0%) e o espelho real (10%) decidem-se com as ligações das estratégias.
  // Aqui só entram contas `motor='sim'`: as mestres MetaApi não estão nesta vista, mas o espelho
  // real de 10K continua a 10% (não a 100%) porque o plano o reconhece como espelho.
  const { data: estrategias } = await db.from('mtmauto_providers').select('slug, metaapi_account_id, espelho_funded_account_id')
  const plano = planoDaEquidade(data as unknown as LinhaContaEquidade[], (estrategias ?? []) as EstrategiaComEspelho[])
  const linhas: LinhaCasa[] = data.map((c) => ({
    id: String(c.id), tipo: String(c.tipo), estrategia: (c.segue_estrategia as string) ?? (c.provider_slug as string) ?? null,
    sim_saldo: c.sim_saldo == null ? null : Number(c.sim_saldo), sim_equity: c.sim_equity == null ? null : Number(c.sim_equity),
    saldo_inicial: c.saldo_inicial == null ? null : Number(c.saldo_inicial), recolhe_todos_sinais: c.recolhe_todos_sinais === true,
    conta_real_casa: c.conta_real_casa === true, factor: plano.get(String(c.id))?.factor,
  }))
  return { disponivel: true as const, lidoEm: new Date().toISOString(), ...agregarEquidadeCasa(linhas) }
}

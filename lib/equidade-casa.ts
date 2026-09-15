/**
 * EQUIDADE DAS CONTAS DA CASA — as contas MTM Funded simuladas marcadas `conta_casa` (082 espelho
 * provider, 092 estratégias por sinais e contas do dono): saldo, equity e flutuante, no total e por
 * estratégia. SÓ ADMIN: em dinheiro. Para fora (clientes, landing) só pips e %, nunca euros/dólares.
 *
 * Soma o valor NOMINAL (o que a conta mostra). O que conta para a equidade oficial da MTM continua a
 * ser a regra de lib/equidade-mtm.ts (financiadas e mestres a 10%) — esta vista não a substitui, mostra
 * de onde vem a parte simulada da casa.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { factorDaConta } from '@/lib/equidade-mtm'

export interface LinhaCasa {
  id: string
  tipo: string
  estrategia: string | null
  sim_saldo: number | null
  sim_equity: number | null
  saldo_inicial: number | null
  recolhe_todos_sinais?: boolean | null
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
    g.contribuicao += equity * factorDaConta(l.tipo === 'provider' ? 'provider' : l.tipo === 'financiada' ? 'financiada' : 'cliente')
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
  const { data, error } = await getSupabaseAdmin().from('mtm_trading_accounts')
    .select('id, tipo, segue_estrategia, provider_slug, sim_saldo, sim_equity, saldo_inicial, recolhe_todos_sinais')
    .eq('conta_casa', true).eq('motor', 'sim').eq('estado', 'ativa').limit(2000)
  if (error) return { disponivel: false as const, motivo: 'migração 082/092 por aplicar (conta_casa)', total: null, porEstrategia: [] }
  const linhas: LinhaCasa[] = (data ?? []).map((c) => ({
    id: String(c.id), tipo: String(c.tipo), estrategia: (c.segue_estrategia as string) ?? (c.provider_slug as string) ?? null,
    sim_saldo: c.sim_saldo == null ? null : Number(c.sim_saldo), sim_equity: c.sim_equity == null ? null : Number(c.sim_equity),
    saldo_inicial: c.saldo_inicial == null ? null : Number(c.saldo_inicial), recolhe_todos_sinais: c.recolhe_todos_sinais === true,
  }))
  return { disponivel: true as const, lidoEm: new Date().toISOString(), ...agregarEquidadeCasa(linhas) }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { inicioDoCiclo } from './ciclos-estrategia'
import { agruparTrades, metricasAuditoria, type MetricasAuditoria, type PernaAuditoria, type SinalLigado, type TradeAuditoria } from './auditoria'

/**
 * LEITURA DA AUDITORIA PÚBLICA (migração 249, `funded_auditoria_links`).
 *
 * Só sai o que um link público pode mostrar: tipo de conta, saldo inicial, estratégia seguida e as
 * operações. Nunca o nome, o email, o user_id ou as passwords. O login só aparece se o dono o
 * escolheu (`mostrar_login`). Trades `fora_estatisticas` (testes internos) não entram.
 */

export interface AuditoriaPublica {
  token: string
  conta: {
    tipo: string
    etiqueta: string | null
    login: string | null
    estado: string
    saldoInicial: number
    saldoAtual: number
    equityAtual: number
    estrategiaSeguida: string | null
    criadaEm: string | null
    contaCasa: boolean
    /** Conta-mestre com novo ciclo: só contam as trades abertas desde aqui. */
    cicloDesde: string | null
  }
  abertas: number
  geradoEm: string
  metricas: MetricasAuditoria
  trades: TradeAuditoria[]
}

export async function lerAuditoriaPorToken(db: SupabaseClient, token: string): Promise<AuditoriaPublica | null> {
  const t = String(token ?? '').trim()
  if (!/^[A-Za-z0-9]{16,64}$/.test(t)) return null
  const { data: link } = await db.from('funded_auditoria_links')
    .select('account_id, mostrar_login, ativo, revogado_em').eq('token', t).maybeSingle()
  if (!link || !link.ativo || link.revogado_em) return null

  const id = String(link.account_id)
  const [{ data: conta }, { data: pernas }, { data: sinais }, { data: ajustes }, { count: abertas }] = await Promise.all([
    db.from('mtm_trading_accounts')
      .select('tipo, etiqueta, mt5_login, estado, saldo_inicial, sim_saldo, sim_equity, segue_estrategia, provider_slug, created_at, conta_casa, motor')
      .eq('id', id).maybeSingle(),
    db.from('funded_positions')
      .select('id, mae_id, symbol, direcao, volume, preco_entrada, preco_fecho, pnl, comissao, swap, aberta_em, fechada_em, origem, risco_inicial')
      .eq('account_id', id).eq('estado', 'fechada').is('fora_estatisticas', null)
      .order('fechada_em', { ascending: true }).limit(20000),
    db.from('funded_sinal_posicoes')
      .select('funded_position_id, estrategia, created_at, entrada, funded_order_id')
      .eq('account_id', id).not('funded_position_id', 'is', null).limit(20000),
    db.from('mtm_funded_ajustes_saldo').select('aplicado_em, criado_em, delta')
      .eq('account_id', id).eq('estado', 'aplicado'),
    db.from('funded_positions').select('id', { count: 'exact', head: true }).eq('account_id', id).eq('estado', 'aberta'),
  ])
  if (!conta || conta.motor !== 'sim') return null

  // Novo ciclo (só na conta-mestre da estratégia): as trades abertas antes ficam de fora e o saldo
  // de partida passa a ser o saldo nesse dia (o que elas renderam e os ajustes de antes entram nele).
  const ciclo = conta.tipo === 'provider' ? inicioDoCiclo(conta.provider_slug as string | null) : null
  const todas = (pernas ?? []) as PernaAuditoria[]
  const antes = new Set<string>()
  if (ciclo) for (const p of todas) if (!p.mae_id && Date.parse(String(p.aberta_em)) < Date.parse(ciclo)) antes.add(String(p.id))
  const dentro = todas.filter((p) => !antes.has(String(p.mae_id ? p.mae_id : p.id)))
  const foraDoCiclo = todas.filter((p) => antes.has(String(p.mae_id ? p.mae_id : p.id)))
  const todosAjustes = (ajustes ?? []).map((a) => ({ em: String(a.aplicado_em ?? a.criado_em), delta: Number(a.delta ?? 0) }))
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const saldoInicial = Number(conta.saldo_inicial ?? 0)
    + foraDoCiclo.reduce((a, p) => a + n(p.pnl) + n(p.swap) - n(p.comissao), 0)
    + (ciclo ? todosAjustes.filter((a) => Date.parse(a.em) < Date.parse(ciclo)).reduce((s, a) => s + a.delta, 0) : 0)

  const trades = agruparTrades(dentro, (sinais ?? []) as SinalLigado[])
  const metricas = metricasAuditoria(trades, {
    saldoInicial,
    ajustes: ciclo ? todosAjustes.filter((a) => Date.parse(a.em) >= Date.parse(ciclo)) : todosAjustes,
  })
  return {
    token: t,
    conta: {
      tipo: String(conta.tipo ?? ''),
      etiqueta: (conta.etiqueta as string | null) ?? null,
      login: link.mostrar_login ? String(conta.mt5_login ?? '') : null,
      estado: String(conta.estado ?? ''),
      saldoInicial,
      saldoAtual: Number(conta.sim_saldo ?? saldoInicial),
      equityAtual: Number(conta.sim_equity ?? conta.sim_saldo ?? saldoInicial),
      estrategiaSeguida: (conta.segue_estrategia as string | null) ?? (conta.provider_slug as string | null) ?? null,
      criadaEm: (conta.created_at as string | null) ?? null,
      contaCasa: !!conta.conta_casa,
      cicloDesde: ciclo,
    },
    abertas: abertas ?? 0,
    geradoEm: new Date().toISOString(),
    metricas,
    trades,
  }
}

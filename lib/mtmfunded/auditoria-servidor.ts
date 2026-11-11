import type { SupabaseClient } from '@supabase/supabase-js'
import { inicioDoCiclo } from './ciclos-estrategia'
import { adaptadorDoDono, listarContasReais } from '@/lib/webtrader/contas'
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
    /** De onde vêm as operações: o motor simulado ou uma conta real ligada (250). */
    fonte: 'mtmfunded' | 'mt5' | 'tradelocker'
    /** false = a corretora não dá o lucro por operação (TradeLocker): só pips. */
    comValor: boolean
    /** Conta real: servidor da corretora (ex.: «PUPrime-Live») e se é demo. */
    servidor: string | null
    demo: boolean
    versao: 'mt4' | 'mt5' | null
    /** Conta real que não se conseguiu ler agora (corretora/MetaApi em baixo, conta desligada). */
    indisponivel: string | null
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
    .select('account_id, mostrar_login, ativo, revogado_em, conta_ref, dono_id').eq('token', t).maybeSingle()
  if (!link || !link.ativo || link.revogado_em) return null
  if (!link.account_id && link.conta_ref && link.dono_id) return lerAuditoriaReal(t, String(link.conta_ref), String(link.dono_id))

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
      fonte: 'mtmfunded', comValor: true, servidor: null, demo: false, versao: null, indisponivel: null,
    },
    abertas: abertas ?? 0,
    geradoEm: new Date().toISOString(),
    metricas,
    trades,
  }
}

/** Janela do histórico de uma conta real: um ano (o que a MetaApi devolve sem paginar sem fim). */
const DIAS_REAL = 365

/**
 * CONTA REAL LIGADA (MT5 pela MetaApi ou TradeLocker). A posse volta a verificar-se aqui: a conta
 * abre-se com o user_id do dono, pelos mesmos filtros do WebTrader — se deixou de ser dele, ou saiu
 * da quota, a página diz que não está disponível em vez de mostrar dados.
 */
async function lerAuditoriaReal(token: string, ref: string, donoId: string): Promise<AuditoriaPublica> {
  const plataforma = ref.startsWith('tradelocker:') ? 'tradelocker' : 'mt5'
  const vazia = (motivo: string): AuditoriaPublica => ({
    token,
    conta: {
      tipo: 'real', etiqueta: null, login: null, estado: 'indisponivel', saldoInicial: 0, saldoAtual: 0, equityAtual: 0,
      estrategiaSeguida: null, criadaEm: null, contaCasa: false, cicloDesde: null,
      fonte: plataforma, comValor: plataforma === 'mt5', servidor: null, demo: false, versao: null, indisponivel: motivo,
    },
    abertas: 0, geradoEm: new Date().toISOString(), metricas: metricasAuditoria([], { saldoInicial: 0 }), trades: [],
  })
  try {
    const ad = await adaptadorDoDono(donoId, plataforma, ref)
    if (!ad.historicoAuditoria) return vazia('Esta corretora ainda não tem histórico para auditoria.')
    const [conta, hist, posicoes, listadas] = await Promise.all([
      ad.conta(), ad.historicoAuditoria(DIAS_REAL), ad.posicoes().catch(() => []), listarContasReais(donoId).catch(() => []),
    ])
    const info = listadas.find((c) => c.ref === ref)
    const saldoAtual = Number(conta.saldo ?? 0)
    // Saldo no início da janela: o de agora menos tudo o que entrou e saiu desde então.
    const saldoInicial = hist.comValor ? Math.round((saldoAtual - hist.variacaoSaldo) * 100) / 100 : 0
    const trades = agruparTrades(hist.pernas)
    const metricas = metricasAuditoria(trades, { saldoInicial, ajustes: hist.ajustes, criterio: hist.comValor ? 'resultado' : 'movimento' })
    return {
      token,
      conta: {
        tipo: 'real', etiqueta: null, login: null, estado: 'ligada',
        saldoInicial, saldoAtual, equityAtual: Number(conta.equity ?? saldoAtual),
        estrategiaSeguida: null, criadaEm: null, contaCasa: false, cicloDesde: null,
        fonte: plataforma, comValor: hist.comValor, servidor: info?.servidor ?? null, demo: !!info?.demo,
        versao: plataforma === 'mt5' ? (info?.versao ?? 'mt5') : null, indisponivel: null,
      },
      abertas: posicoes.length,
      geradoEm: new Date().toISOString(),
      metricas,
      trades,
    }
  } catch (e) {
    console.warn('[auditoria-real]', e instanceof Error ? e.message : e)
    return vazia('Não foi possível ler a conta na corretora neste momento. Tenta daqui a uns minutos.')
  }
}

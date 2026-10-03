import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { computePerformance, type ClosedTradeRow } from '@/lib/mtmcopy/performance'
import { MASTER_STRATEGIES } from '@/lib/mtmcopy/history-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Visão GLOBAL do sistema — performance agregada de TODAS as contas/utilizadores.
 *  Só admin. Usa o mesmo cálculo de /api/mtmcopy/metrics (curva de equity, drawdown,
 *  profit factor, por conta, mensal, red-flags), mas sobre todas as trades fechadas. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const supabase = getSupabaseAdmin()

  const [{ data: closedTrades }, { data: connections }, { count: usersWithTrades }] = await Promise.all([
    supabase
      .from('trading_plan_trades')
      .select('pnl, lot_size, symbol, direction, opened_at, closed_at, trade_source, risk_amount, mtmcopy_connection_id, setup_type, entry_price, exit_price')
      .eq('execution_mode', 'executed')
      .eq('status', 'closed')
      .not('pnl', 'is', null)
      .order('closed_at', { ascending: true, nullsFirst: false })
      .limit(20000),
    supabase
      .from('mtmcopy_connections')
      .select('id, account_label, mt5_login, mt5_login_last4, audit_label, is_audited, metrics_excluded, metrics_from'),
    supabase
      .from('trading_plan_trades')
      .select('user_id', { count: 'exact', head: true })
      .eq('execution_mode', 'executed')
      .eq('status', 'closed'),
  ])

  /**
   * O `metrics_excluded` NÃO excluía nada.
   *
   * A consulta filtrava as ligações só para montar os RÓTULOS; as trades vinham todas e
   * entravam na conta na mesma — a ligação excluída limitava-se a aparecer sem nome. Uma conta
   * demo marcada como fora das métricas continuava a puxar os números para baixo (ou para cima),
   * e ninguém via porquê. Agora exclui a sério.
   *
   * O `metrics_from` é o segundo filtro: uma ligação reapontada para outra conta MT5 arrasta o
   * histórico da anterior, e essas trades não são desta conta.
   */
  const excluidas = new Set<string>()
  const desde = new Map<string, number>()
  for (const c of connections ?? []) {
    if (c.metrics_excluded) excluidas.add(c.id as string)
    if (c.metrics_from) desde.set(c.id as string, new Date(c.metrics_from as string).getTime())
  }
  const trades = ((closedTrades ?? []) as Array<Record<string, unknown>>).filter((t) => {
    const cid = t.mtmcopy_connection_id as string | null
    if (!cid) return true // trade sem ligação (plano manual) — fora do âmbito desta regra
    if (excluidas.has(cid)) return false
    const marco = desde.get(cid)
    if (marco == null) return true
    const fechada = t.closed_at ? new Date(t.closed_at as string).getTime() : 0
    return fechada >= marco
  })

  const labelById = new Map<string, string>()
  for (const c of connections ?? []) {
    if (c.metrics_excluded) continue
    let label = 'Conta MT5'
    if (c.is_audited && c.audit_label?.trim()) label = c.audit_label.trim()
    else if (c.account_label?.trim() && c.account_label.toLowerCase() !== 'null') label = c.account_label.trim()
    else if (c.mt5_login?.trim()) label = c.mt5_login.trim()
    else if (c.mt5_login_last4) label = `****${c.mt5_login_last4}`
    labelById.set(c.id, label)
  }
  // Track record por estratégia (contas-mestre): agrupa por setup_type (em memória, sem FK)
  // com rótulo legível — aparecem como "contas" próprias no breakdown.
  for (const m of MASTER_STRATEGIES) labelById.set(`strat:${m.strategy}`, m.strategy)
  for (const r of trades) {
    if (r.trade_source === 'strategy' && r.setup_type) r.mtmcopy_connection_id = `strat:${r.setup_type as string}`
  }

  const performance = computePerformance(trades as ClosedTradeRow[], labelById)

  /**
   * A DATA DO RECOMEÇO VAI NA RESPOSTA, e não fica só na base de dados.
   *
   * Uma contagem reiniciada que ninguém vê não se distingue de números maquilhados. Quem lê
   * "63% de acerto" tem de poder ver desde quando se está a contar e quantas trades ficaram
   * de fora — senão o número diz mais do que sabe.
   */
  const marcos = (connections ?? [])
    .map((c) => (c.metrics_from ? new Date(c.metrics_from as string).getTime() : null))
    .filter((x): x is number => x != null)
  const contagemDesde = marcos.length ? new Date(Math.min(...marcos)).toISOString() : null

  return NextResponse.json({
    performance,
    totalTrades: trades.length,
    tradesForaDasMetricas: (closedTrades?.length ?? 0) - trades.length,
    contagemDesde,
    contagemReiniciada: marcos.length > 0,
    accountsTracked: labelById.size,
    sampledUserRows: usersWithTrades ?? null,
  })
}

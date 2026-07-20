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
      .select('pnl, lot_size, symbol, direction, opened_at, closed_at, trade_source, risk_amount, mtmcopy_connection_id, setup_type')
      .eq('execution_mode', 'executed')
      .eq('status', 'closed')
      .not('pnl', 'is', null)
      .order('closed_at', { ascending: true, nullsFirst: false })
      .limit(20000),
    supabase
      .from('mtmcopy_connections')
      .select('id, account_label, mt5_login, mt5_login_last4, audit_label, is_audited'),
    supabase
      .from('trading_plan_trades')
      .select('user_id', { count: 'exact', head: true })
      .eq('execution_mode', 'executed')
      .eq('status', 'closed'),
  ])

  const labelById = new Map<string, string>()
  for (const c of connections ?? []) {
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
  for (const r of (closedTrades ?? []) as Array<Record<string, unknown>>) {
    if (r.trade_source === 'strategy' && r.setup_type) r.mtmcopy_connection_id = `strat:${r.setup_type as string}`
  }

  const performance = computePerformance((closedTrades ?? []) as ClosedTradeRow[], labelById)

  return NextResponse.json({
    performance,
    totalTrades: closedTrades?.length ?? 0,
    accountsTracked: labelById.size,
    sampledUserRows: usersWithTrades ?? null,
  })
}

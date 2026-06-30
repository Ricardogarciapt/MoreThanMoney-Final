/**
 * Ingestão do HISTÓRICO REAL de trades fechados das contas ligadas (T2T, MTM Copy e
 * contas AUDITADAS) para `trading_plan_trades`, para o plano de trading do utilizador
 * mostrar as métricas reais a par das trades manuais. Dedup por (conta, posição do broker).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getHistoryDeals, type MetaApiDeal } from './metaapi'

const HISTORY_DAYS = 90

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** O SDK devolve `time` como Date (ou string). Normaliza para ms e ISO. */
function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime()
  const t = new Date(v as string).getTime()
  return Number.isFinite(t) ? t : 0
}
function toIso(v: unknown): string | null {
  const ms = toMs(v)
  return ms ? new Date(ms).toISOString() : null
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

async function getOrCreatePlanId(supabase: SupabaseAdmin, userId: string): Promise<string | null> {
  const { data: plan } = await supabase
    .from('trading_plans')
    .select('id')
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (plan?.id) return plan.id as string
  const { data: created, error } = await supabase
    .from('trading_plans')
    .insert({ user_id: userId, plan_name: 'O meu plano', trading_style: 'swing', is_active: true })
    .select('id')
    .single()
  if (error) console.error('[history-ingest] criar plano falhou:', userId, error.message)
  return (created?.id as string) ?? null
}

interface IngestConn {
  id: string
  user_id: string
  metaapi_account_id: string | null
  is_audited?: boolean | null
}

/** Ingere os trades fechados (últimos 90 dias) de UMA conta. */
export async function ingestClosedTradesForConnection(
  conn: IngestConn,
): Promise<{ ingested: number; openSkipped: number }> {
  if (!conn.metaapi_account_id) return { ingested: 0, openSkipped: 0 }
  const supabase = getSupabaseAdmin()

  const from = new Date(Date.now() - HISTORY_DAYS * 86_400_000)
  const deals = await getHistoryDeals(conn.metaapi_account_id, from)
  if (!deals.length) return { ingested: 0, openSkipped: 0 }

  // Agrupar deals por posição do broker (ignora deals de saldo/crédito).
  const byPosition = new Map<string, MetaApiDeal[]>()
  for (const d of deals) {
    if (!d.positionId) continue
    if (d.type !== 'DEAL_TYPE_BUY' && d.type !== 'DEAL_TYPE_SELL') continue
    const arr = byPosition.get(d.positionId) ?? []
    arr.push(d)
    byPosition.set(d.positionId, arr)
  }
  if (!byPosition.size) return { ingested: 0, openSkipped: 0 }

  const planId = await getOrCreatePlanId(supabase, conn.user_id)
  const tradeSource = conn.is_audited ? 'audited' : 'copy'

  const rows: Record<string, unknown>[] = []
  let openSkipped = 0

  for (const [positionId, posDeals] of byPosition) {
    posDeals.sort((a, b) => toMs(a.time) - toMs(b.time))
    const inDeal = posDeals.find((d) => d.entryType === 'DEAL_ENTRY_IN') ?? posDeals[0]
    const outDeals = posDeals.filter(
      (d) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_INOUT',
    )
    if (!outDeals.length) {
      openSkipped++ // ainda aberta — só ingerimos fechadas
      continue
    }
    const lastOut = outDeals[outDeals.length - 1]
    const direction = inDeal.type === 'DEAL_TYPE_BUY' ? 'long' : 'short'
    const pnl = posDeals.reduce(
      (s, d) => s + num(d.profit) + num(d.commission) + num(d.swap),
      0,
    )

    rows.push({
      user_id: conn.user_id,
      plan_id: planId,
      mtmcopy_connection_id: conn.id,
      broker_position_id: positionId,
      symbol: inDeal.symbol ?? '',
      direction,
      entry_price: num(inDeal.price),
      exit_price: num(lastOut.price) || null,
      lot_size: num(inDeal.volume),
      risk_amount: 0, // histórico: risco real desconhecido (foco no P&L realizado)
      pnl: Math.round(pnl * 100) / 100,
      status: 'closed',
      trade_source: tradeSource,
      execution_mode: 'executed',
      opened_at: toIso(inDeal.time),
      closed_at: toIso(lastOut.time),
    })
  }

  if (!rows.length) return { ingested: 0, openSkipped }

  const { error } = await supabase
    .from('trading_plan_trades')
    .upsert(rows, { onConflict: 'mtmcopy_connection_id,broker_position_id', ignoreDuplicates: false })
  if (error) {
    console.error('[history-ingest] upsert falhou:', conn.id, error.message)
    return { ingested: 0, openSkipped }
  }
  return { ingested: rows.length, openSkipped }
}

/** Ingere o histórico de TODAS as contas ligadas (T2T + MTM Copy + auditadas). */
export async function ingestClosedTradesForAllConnections(): Promise<{
  connections: number
  ingested: number
}> {
  const supabase = getSupabaseAdmin()
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, user_id, metaapi_account_id, is_audited')
    .neq('mt5_status', 'disconnected')
    .not('metaapi_account_id', 'is', null)

  let ingested = 0
  for (const c of conns ?? []) {
    try {
      const r = await ingestClosedTradesForConnection(c as IngestConn)
      ingested += r.ingested
    } catch (e) {
      console.error('[history-ingest] conta', (c as IngestConn).id, e instanceof Error ? e.message : e)
    }
  }
  return { connections: conns?.length ?? 0, ingested }
}

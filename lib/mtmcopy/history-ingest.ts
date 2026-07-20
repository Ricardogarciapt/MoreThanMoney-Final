/**
 * Ingestão do HISTÓRICO REAL de trades fechados das contas ligadas (T2T, MTM Copy e
 * contas AUDITADAS) para `trading_plan_trades`, para o plano de trading do utilizador
 * mostrar as métricas reais a par das trades manuais. Dedup por (conta, posição do broker).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getHistoryDeals, type MetaApiDeal } from './metaapi'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_GOLDKILLER_ACCOUNT_ID,
  CANONICAL_BOOSTER_ACCOUNT_ID,
} from './provider-constants'

const HISTORY_DAYS = 90

/** Contas-mestre canónicas → TRACK RECORD agregado por estratégia (não são conexões de
 *  utilizador; ingeridas para um plano dedicado, com connId sintético estável p/ dedup). */
export const MASTER_STRATEGIES: Array<{ strategy: string; accountId: string; connId: string }> = [
  { strategy: 'MTM Auto Premium', accountId: CANONICAL_PREMIUM_ACCOUNT_ID, connId: 'a0000000-0000-4000-8000-000000000001' },
  { strategy: 'MTM Auto Forex', accountId: CANONICAL_TRADE_IDEAS_ACCOUNT_ID, connId: 'a0000000-0000-4000-8000-000000000002' },
  { strategy: 'MTM Auto Sensei', accountId: CANONICAL_SENSEI_ACCOUNT_ID, connId: 'a0000000-0000-4000-8000-000000000003' },
  { strategy: 'MTM Auto GoldKiller', accountId: CANONICAL_GOLDKILLER_ACCOUNT_ID, connId: 'a0000000-0000-4000-8000-000000000004' },
  { strategy: 'MTM 20X Booster', accountId: CANONICAL_BOOSTER_ACCOUNT_ID, connId: 'a0000000-0000-4000-8000-000000000005' },
]
/** Dono do track record das estratégias (morethanmoneypt@gmail.com). */
const STRATEGY_OWNER_USER_ID = 'e8d2d7e0-b30d-4465-8159-75e2d4afc534'
const STRATEGY_PLAN_NAME = 'MTM Estratégias — mestre'

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

async function getOrCreateStrategyPlanId(supabase: SupabaseAdmin): Promise<string | null> {
  const { data } = await supabase
    .from('trading_plans')
    .select('id')
    .eq('user_id', STRATEGY_OWNER_USER_ID)
    .eq('plan_name', STRATEGY_PLAN_NAME)
    .maybeSingle()
  if (data?.id) return data.id as string
  const { data: created, error } = await supabase
    .from('trading_plans')
    .insert({ user_id: STRATEGY_OWNER_USER_ID, plan_name: STRATEGY_PLAN_NAME, trading_style: 'swing', is_active: false })
    .select('id')
    .single()
  if (error) console.error('[history-ingest] criar plano estratégias falhou:', error.message)
  return (created?.id as string) ?? null
}

/**
 * TRACK RECORD por ESTRATÉGIA: ingere os trades fechados das contas-mestre canónicas
 * (Premium/Forex/Sensei/GoldKiller/Booster) para um plano dedicado, com label por
 * estratégia (setup_type) e connId sintético estável (dedup). NÃO são conexões de
 * utilizador — servem o registo agregado das estratégias (admin/marketing).
 */
export async function ingestMasterStrategyTrades(): Promise<{ strategies: number; ingested: number }> {
  const supabase = getSupabaseAdmin()
  const planId = await getOrCreateStrategyPlanId(supabase)
  if (!planId) return { strategies: 0, ingested: 0 }
  const from = new Date(Date.now() - HISTORY_DAYS * 86_400_000)
  let ingested = 0
  for (const m of MASTER_STRATEGIES) {
    try {
      const deals = await getHistoryDeals(m.accountId, from)
      const byPosition = new Map<string, MetaApiDeal[]>()
      for (const d of deals) {
        if (!d.positionId) continue
        if (d.type !== 'DEAL_TYPE_BUY' && d.type !== 'DEAL_TYPE_SELL') continue
        const arr = byPosition.get(d.positionId) ?? []
        arr.push(d)
        byPosition.set(d.positionId, arr)
      }
      const rows: Record<string, unknown>[] = []
      for (const [positionId, posDeals] of byPosition) {
        posDeals.sort((a, b) => toMs(a.time) - toMs(b.time))
        const inDeal = posDeals.find((d) => d.entryType === 'DEAL_ENTRY_IN') ?? posDeals[0]
        const outDeals = posDeals.filter((d) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_INOUT')
        if (!outDeals.length) continue // ainda aberta
        const lastOut = outDeals[outDeals.length - 1]
        const pnl = posDeals.reduce((s, d) => s + num(d.profit) + num(d.commission) + num(d.swap), 0)
        rows.push({
          user_id: STRATEGY_OWNER_USER_ID,
          plan_id: planId,
          mtmcopy_connection_id: m.connId,
          broker_position_id: positionId,
          symbol: inDeal.symbol ?? '',
          direction: inDeal.type === 'DEAL_TYPE_BUY' ? 'long' : 'short',
          entry_price: num(inDeal.price),
          exit_price: num(lastOut.price) || null,
          lot_size: num(inDeal.volume),
          risk_amount: 0,
          pnl: Math.round(pnl * 100) / 100,
          status: 'closed',
          trade_source: 'strategy',
          execution_mode: 'executed',
          setup_type: m.strategy,
          opened_at: toIso(inDeal.time),
          closed_at: toIso(lastOut.time),
        })
      }
      if (!rows.length) continue
      const { error } = await supabase
        .from('trading_plan_trades')
        .upsert(rows, { onConflict: 'mtmcopy_connection_id,broker_position_id', ignoreDuplicates: false })
      if (error) { console.error('[history-ingest] master', m.strategy, error.message); continue }
      ingested += rows.length
    } catch (e) {
      console.error('[history-ingest] master', m.strategy, e instanceof Error ? e.message : e)
    }
  }
  return { strategies: MASTER_STRATEGIES.length, ingested }
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

  const runPass = async (): Promise<number> => {
    let n = 0
    for (const c of conns ?? []) {
      try {
        n += (await ingestClosedTradesForConnection(c as IngestConn)).ingested
      } catch (e) {
        console.error('[history-ingest] conta', (c as IngestConn).id, e instanceof Error ? e.message : e)
      }
    }
    // Track record agregado por estratégia (contas-mestre canónicas).
    try {
      n += (await ingestMasterStrategyTrades()).ingested
    } catch (e) {
      console.error('[history-ingest] estratégias-mestre:', e instanceof Error ? e.message : e)
    }
    return n
  }

  let ingested = await runPass()
  // Guarda de COLD-START: o getHistoryDeals falha na 1ª invocação de um lambda frio
  // (import esm-node/conexão MetaApi ainda não prontos → devolve [] instantâneo). Como o
  // cron corre de 6h em 6h, cada execução é fria. Se a 1ª passagem ingeriu 0 mas há contas,
  // repete com o lambda já quente — foi isto que manteve trading_plan_trades congelado.
  if (ingested === 0 && (conns?.length ?? 0) > 0) {
    console.warn('[history-ingest] 1ª passagem 0 (cold-start provável) — a repetir com lambda quente')
    ingested = await runPass()
  }
  return { connections: conns?.length ?? 0, ingested }
}

/**
 * DIAGNÓSTICO (read-only): corre getHistoryDeals nas contas slave ligadas E nas contas
 * mestre canónicas, reportando quantos deals/posições fechadas cada uma devolve. Serve
 * para perceber porque a ingestão está a 0 (getHistoryDeals partido = todas 0; ou só as
 * slaves vazias = ingerir as mestres). NÃO escreve nada.
 */
export async function diagnoseIngestion(): Promise<{
  env: Record<string, unknown>
  accounts: Array<{ label: string; mt5: string | null; account: string; dealsFetched: number; closedPositions: number; ms: number }>
}> {
  // Diagnóstico do ambiente: token + os dois imports do SDK (o esm-node é o suspeito).
  const env: Record<string, unknown> = { tokenPresent: Boolean(process.env.METAAPI_TOKEN) }
  try {
    const m = (await import(/* webpackIgnore: true */ 'metaapi.cloud-sdk/esm-node')) as { default?: unknown }
    env.esmNodeImport = m ? 'ok' : 'empty'
    env.esmNodeHasDefault = Boolean(m?.default)
  } catch (e) {
    env.esmNodeImport = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }
  try {
    const m2 = (await import('metaapi.cloud-sdk')) as { default?: unknown }
    env.defaultImport = m2 ? 'ok' : 'empty'
    env.defaultHasDefault = Boolean(m2?.default)
  } catch (e) {
    env.defaultImport = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }

  const supabase = getSupabaseAdmin()
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('account_label, audit_label, metaapi_account_id, mt5_status')
    .not('metaapi_account_id', 'is', null)

  const masters: Array<[string, string]> = [
    ['MASTER Premium', CANONICAL_PREMIUM_ACCOUNT_ID],
    ['MASTER Forex/TradeIdeas', CANONICAL_TRADE_IDEAS_ACCOUNT_ID],
    ['MASTER Sensei', CANONICAL_SENSEI_ACCOUNT_ID],
    ['MASTER GoldKiller', CANONICAL_GOLDKILLER_ACCOUNT_ID],
    ['MASTER Booster', CANONICAL_BOOSTER_ACCOUNT_ID],
  ]
  const targets: Array<{ label: string; accountId: string; mt5: string | null }> = [
    ...((conns ?? []) as Array<Record<string, unknown>>).map((c) => ({
      label: `slave ${(c.account_label as string) ?? (c.audit_label as string) ?? '?'}`,
      accountId: c.metaapi_account_id as string,
      mt5: (c.mt5_status as string) ?? null,
    })),
    ...masters.map(([label, accountId]) => ({ label, accountId, mt5: null })),
  ]

  const from = new Date(Date.now() - HISTORY_DAYS * 86_400_000)
  const out: Array<{ label: string; mt5: string | null; account: string; dealsFetched: number; closedPositions: number; ms: number }> = []
  for (const t of targets) {
    const t0 = Date.now()
    const deals = await getHistoryDeals(t.accountId, from)
    const closed = new Set<string>()
    for (const d of deals) {
      if (d.positionId && (d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_INOUT')) {
        closed.add(d.positionId)
      }
    }
    out.push({
      label: t.label,
      mt5: t.mt5,
      account: `${t.accountId.slice(0, 8)}…`,
      dealsFetched: deals.length,
      closedPositions: closed.size,
      ms: Date.now() - t0,
    })
  }
  return { env, accounts: out }
}

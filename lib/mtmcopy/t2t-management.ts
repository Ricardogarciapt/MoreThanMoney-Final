/**
 * Gestão contínua das posições abertas via Tap to Trade.
 *
 * O T2T abre a posição na conta dedicada do membro (mtmcopy_connections.purpose='tap_to_trade')
 * e grava o broker_position_id em mtmcopy_signal_log (status='open'). Quando o MESTRE faz
 * gestão (mover SL, breakeven, trailing, fecho parcial/total), o processManagementUpdate
 * estende a mesma ação às contas T2T com posição aberta nesse canal+símbolo — desde que a
 * estratégia esteja ATIVA no Tap to Trade.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  listOpenPositions,
  listPendingOrders,
  closePositionById,
  modifyPositionSlTp,
} from './metaapi'
import { tapToTradeEnabledChannels, T2T_SENDER_TO_CHAT } from './tap-to-trade-channels'

const supabase = getSupabaseAdmin()

export interface OpenT2TPosition {
  rowId: string
  accountId: string
  symbol: string
  brokerPositionId: string | null
}

/**
 * Posições T2T ABERTAS para um canal de gestão + símbolo, apenas se o provider está
 * ATIVO no Tap to Trade. Devolve as contas a incluir no loop de gestão do mestre.
 */
export async function openT2TRowsForManagement(
  channel: string,
  symbol?: string | null,
): Promise<OpenT2TPosition[]> {
  const slugs = T2T_SENDER_TO_CHAT[channel] ?? []
  if (!slugs.length) return []

  const enabled = await tapToTradeEnabledChannels()
  const activeSlugs = enabled ? slugs.filter((s) => enabled.has(s)) : slugs
  if (!activeSlugs.length) return []

  const { data: rows } = await supabase
    .from('mtmcopy_signal_log')
    .select('id, connection_id, symbol, broker_position_id')
    .eq('status', 'open')
    .not('broker_position_id', 'is', null)
    .in('channel_key', activeSlugs)
    .limit(500)
  if (!rows?.length) return []

  const sym = symbol?.trim().toUpperCase() || ''
  const matched = sym
    ? rows.filter((r) => {
        const rs = ((r.symbol as string | null) ?? '').toUpperCase()
        return rs.includes(sym) || sym.includes(rs)
      })
    : rows
  if (!matched.length) return []

  const connIds = [...new Set(matched.map((r) => r.connection_id as string))]
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id')
    .in('id', connIds)
  const accById = new Map(
    (conns ?? []).map((c) => [c.id as string, (c.metaapi_account_id as string | null) ?? null]),
  )

  const out: OpenT2TPosition[] = []
  for (const r of matched) {
    const accountId = accById.get(r.connection_id as string)
    if (accountId) {
      out.push({
        rowId: r.id as string,
        accountId,
        symbol: ((r.symbol as string | null) ?? '').toString(),
        brokerPositionId: (r.broker_position_id as string | null) ?? null,
      })
    }
  }
  return out
}

/** Resolve posições T2T abertas por canal de chat (slug direto) + símbolo. */
async function resolveOpenT2TByChannelSlug(
  channelSlug: string,
  symbol?: string | null,
): Promise<OpenT2TPosition[]> {
  const { data: rows } = await supabase
    .from('mtmcopy_signal_log')
    .select('id, connection_id, symbol, broker_position_id')
    .eq('status', 'open')
    .not('broker_position_id', 'is', null)
    .eq('channel_key', channelSlug)
    .limit(500)
  if (!rows?.length) return []

  const sym = symbol?.trim().toUpperCase() || ''
  const matched = sym
    ? rows.filter((r) => {
        const rs = ((r.symbol as string | null) ?? '').toUpperCase()
        return rs.includes(sym) || sym.includes(rs)
      })
    : rows
  if (!matched.length) return []

  const connIds = [...new Set(matched.map((r) => r.connection_id as string))]
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id')
    .in('id', connIds)
  const accById = new Map(
    (conns ?? []).map((c) => [c.id as string, (c.metaapi_account_id as string | null) ?? null]),
  )

  const out: OpenT2TPosition[] = []
  for (const r of matched) {
    const accountId = accById.get(r.connection_id as string)
    if (accountId) {
      out.push({
        rowId: r.id as string,
        accountId,
        symbol: ((r.symbol as string | null) ?? '').toString(),
        brokerPositionId: (r.broker_position_id as string | null) ?? null,
      })
    }
  }
  return out
}

/** Master FECHOU (detetado por polling) → fecha as posições T2T slave correspondentes. */
export async function closeT2TForSlaves(channelSlug: string, symbol: string): Promise<number> {
  const rows = await resolveOpenT2TByChannelSlug(channelSlug, symbol)
  let n = 0
  for (const r of rows) {
    if (!r.brokerPositionId) continue
    try {
      await closePositionById(r.accountId, r.brokerPositionId)
      await supabase
        .from('mtmcopy_signal_log')
        .update({ status: 'closed' })
        .eq('id', r.rowId)
        .then(undefined, () => {})
      n++
    } catch (e) {
      console.warn('[t2t-management] close slave falhou', r.accountId, e)
    }
  }
  return n
}

/** Master EDITOU SL/TP (detetado por polling) → aplica nas posições T2T slave. */
export async function editT2TForSlaves(
  channelSlug: string,
  symbol: string,
  sl: number | null,
  tp: number | null,
): Promise<number> {
  const rows = await resolveOpenT2TByChannelSlug(channelSlug, symbol)
  let n = 0
  for (const r of rows) {
    if (!r.brokerPositionId) continue
    try {
      await modifyPositionSlTp(r.accountId, r.brokerPositionId, sl, tp, null, r.symbol)
      n++
    } catch (e) {
      console.warn('[t2t-management] edit slave falhou', r.accountId, e)
    }
  }
  return n
}

/**
 * Após a gestão, marca 'closed' as posições T2T cujo símbolo já não tem posição aberta
 * nem ordem pendente na conta (fecho total do mestre ou SL/TP atingido).
 */
export async function reconcileT2TPositionsClosed(rows: OpenT2TPosition[]): Promise<void> {
  if (!rows.length) return

  const byAccount = new Map<string, OpenT2TPosition[]>()
  for (const r of rows) {
    const arr = byAccount.get(r.accountId) ?? []
    arr.push(r)
    byAccount.set(r.accountId, arr)
  }

  const closedRowIds: string[] = []
  for (const [accountId, accRows] of byAccount) {
    try {
      const [positions, pending] = await Promise.all([
        listOpenPositions(accountId),
        listPendingOrders(accountId),
      ])
      const openSymbols = [
        ...positions.map((p) => p.symbol?.toUpperCase()).filter(Boolean),
        ...pending.map((p) => p.symbol?.toUpperCase()).filter(Boolean),
      ] as string[]

      for (const r of accRows) {
        const sym = r.symbol?.toUpperCase()
        const stillOpen = sym
          ? openSymbols.some((s) => s.includes(sym) || sym.includes(s))
          : false
        if (!stillOpen) closedRowIds.push(r.rowId)
      }
    } catch (e) {
      console.warn('[t2t-management] reconcile falhou para conta', accountId, e)
    }
  }

  if (closedRowIds.length) {
    await supabase
      .from('mtmcopy_signal_log')
      .update({ status: 'closed' })
      .in('id', closedRowIds)
      .then(undefined, (e) => console.warn('[t2t-management] update closed falhou:', e))
  }
}

import {
  DEFAULT_COPYFACTORY_SYMBOL_MAPPINGS,
  getCopyStrategyId,
  subscribeToStrategies,
  unsubscribeFromStrategy,
  type CopyFactoryTradeSizeScaling,
} from './copyfactory'
import { connectionCopyMethod } from './copy-limits'
import {
  getMasterConnection,
  resolveOrCreateMasterStrategyId,
  resolveStrategyIdsForConnectionAsync,
} from './user-copy-context'
import type { MTMcopierConnection } from './types'

export function lotMultiplierFromConnection(conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value'>): number {
  if (conn.lot_mode === 'multiplier') return Number(conn.lot_value) || 1
  if (conn.lot_mode === 'fixed') return Number(conn.lot_value) || 0.01
  return 1
}

export function tradeSizeScalingFromConnection(
  conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value'>,
): CopyFactoryTradeSizeScaling | undefined {
  const value = Number(conn.lot_value) || 0.01
  if (conn.lot_mode === 'risk_percent') {
    return {
      mode: 'fixedRisk',
      riskFraction: Math.min(0.5, Math.max(0.001, value / 100)),
    }
  }
  if (conn.lot_mode === 'fixed') {
    return {
      mode: 'fixedVolume',
      fixedVolume: Math.min(50, Math.max(0.01, value)),
    }
  }
  return undefined
}

export async function syncConnectionCopyFactory(
  conn: Pick<
    MTMcopierConnection,
    | 'account_role'
    | 'sender_mode'
    | 'copy_method'
    | 'copyfactory_strategy_id'
    | 'copyfactory_strategy_pick'
    | 'telegram_group'
    | 'telegram_groups'
    | 'metaapi_account_id'
    | 'lot_mode'
    | 'lot_value'
    | 'reverse_signals'
    | 'symbols_whitelist'
    | 'copy_sl'
    | 'copy_tp'
    | 'mt5_login_last4'
    | 'mt5_server'
  >,
  userLabel: string,
  allConnections?: MTMcopierConnection[],
): Promise<{ ok: boolean; error?: string }> {
  if (!conn.metaapi_account_id) return { ok: false, error: 'Conta MetaAPI em falta' }
  if (conn.account_role === 'master') {
    return { ok: true }
  }

  let master = allConnections ? getMasterConnection(allConnections) : null
  const method = connectionCopyMethod(conn as MTMcopierConnection)

  if (method === 'telegram_group') {
    return { ok: true }
  }

  if (method === 'strategy') {
    return syncMtmStrategyReplication(conn, userLabel)
  }

  if (method === 'master_slave' && master?.metaapi_account_id) {
    const resolved = await resolveOrCreateMasterStrategyId(master as MTMcopierConnection)
    if (!resolved.ok) {
      return { ok: false, error: resolved.error ?? 'Estratégia da conta mestre em falta' }
    }
    if (resolved.strategyId && resolved.strategyId !== master.copyfactory_strategy_id) {
      master = { ...master, copyfactory_strategy_id: resolved.strategyId }
    }
  }

  let strategyIds = await resolveStrategyIdsForConnectionAsync(conn, master)

  if (!strategyIds.length) {
    const id = (await getCopyStrategyId()) ?? process.env.METAAPI_COPY_STRATEGY_ID ?? ''
    if (id) strategyIds = [id]
  }
  if (!strategyIds.length) return { ok: false, error: 'Estratégia de cópia não configurada' }

  const name =
    userLabel ||
    `MTMcopier · ****${conn.mt5_login_last4 ?? '?'} ${conn.mt5_server ?? ''}`.trim()

  const tradeSizeScaling = tradeSizeScalingFromConnection(conn)

  return subscribeToStrategies({
    accountId: conn.metaapi_account_id,
    name,
    strategyIds,
    multiplier: lotMultiplierFromConnection(conn),
    tradeSizeScaling,
    reverse: conn.reverse_signals ?? false,
    symbolWhitelist: conn.symbols_whitelist,
    copySl: conn.copy_sl !== false,
    copyTp: conn.copy_tp !== false,
    skipPendingOrders: method === 'master_slave' ? false : undefined,
  })
}

export async function removeConnectionCopyFactory(metaapiAccountId: string | null | undefined) {
  if (!metaapiAccountId) return { ok: true }
  return unsubscribeFromStrategy(metaapiAccountId)
}

/** Subscrição CopyFactory para método «Estratégia MTM» (replica do provider com symbol mapping). */
export async function syncMtmStrategyReplication(
  conn: Pick<
    MTMcopierConnection,
    | 'metaapi_account_id'
    | 'copyfactory_strategy_pick'
    | 'lot_mode'
    | 'lot_value'
    | 'reverse_signals'
    | 'symbols_whitelist'
    | 'copy_sl'
    | 'copy_tp'
    | 'mt5_login_last4'
    | 'mt5_server'
    | 'account_label'
  >,
  userLabel: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!conn.metaapi_account_id) return { ok: false, error: 'Conta MetaAPI em falta' }

  const strategyId = conn.copyfactory_strategy_pick?.trim()
  if (!strategyId) return { ok: false, error: 'Estratégia MTM não escolhida' }

  const name =
    userLabel ||
    conn.account_label ||
    `MTMcopier · ****${conn.mt5_login_last4 ?? '?'} ${conn.mt5_server ?? ''}`.trim()

  return subscribeToStrategies({
    accountId: conn.metaapi_account_id,
    name,
    strategyIds: [strategyId],
    multiplier: lotMultiplierFromConnection(conn),
    tradeSizeScaling: tradeSizeScalingFromConnection(conn),
    reverse: conn.reverse_signals ?? false,
    symbolWhitelist: conn.symbols_whitelist,
    copySl: conn.copy_sl !== false,
    copyTp: conn.copy_tp !== false,
    skipPendingOrders: true,
    symbolMapping: DEFAULT_COPYFACTORY_SYMBOL_MAPPINGS,
  })
}

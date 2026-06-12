import {
  ensureCopyTraderStrategy,
  getCopyStrategyId,
  subscribeToStrategies,
  unsubscribeFromStrategy,
  type CopyFactoryTradeSizeScaling,
} from './copyfactory'
import { connectionCopyMethod } from './copy-limits'
import { getMasterConnection, resolveStrategyIdsForConnectionAsync } from './user-copy-context'
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

  const master = allConnections ? getMasterConnection(allConnections) : null
  const method = connectionCopyMethod(conn as MTMcopierConnection)

  if (method === 'telegram_group' || method === 'strategy') {
    return { ok: true }
  }

  if (
    method === 'master_slave' &&
    master?.copyfactory_strategy_id &&
    master.metaapi_account_id
  ) {
    const strat = await ensureCopyTraderStrategy({
      strategyId: master.copyfactory_strategy_id,
      accountId: master.metaapi_account_id,
      name: `MTMcopier · mestre ****${master.mt5_login_last4 ?? '?'}`,
      description: 'Copy trader pessoal · limit, stop e market',
    })
    if (!strat.ok) {
      console.warn('[mtmcopy] estratégia mestre:', strat.error)
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

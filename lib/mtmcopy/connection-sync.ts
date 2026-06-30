import {
  getCopyStrategyId,
  subscribeToStrategies,
  unsubscribeFromStrategy,
  type CopyFactoryTradeSizeScaling,
} from './copyfactory'
import { buildSubscriberSymbolMapping } from './copyfactory-symbol-map'
import { connectionCopyMethod } from './copy-limits'
import {
  getMasterConnection,
  resolveOrCreateMasterStrategyId,
  resolveStrategyIdsForConnectionAsync,
} from './user-copy-context'
import { getPropFirmPreset } from './prop-firm-presets'
import type { MTMcopierConnection } from './types'

function copyFactoryOptsFromConnection(
  conn: Pick<
    MTMcopierConnection,
    'prop_firm_type' | 'copy_sl' | 'copy_tp' | 'lot_mode' | 'lot_value' | 'reverse_signals' | 'symbols_whitelist'
  >,
) {
  const preset = getPropFirmPreset(conn.prop_firm_type)
  return {
    copySl: preset ? preset.copySl : conn.copy_sl !== false,
    copyTp: preset ? preset.copyTp : conn.copy_tp !== false,
    skipPendingOrders: preset?.skipPendingOrders ?? false,
    riskLimits: preset?.riskLimits,
    multiplier: lotMultiplierFromConnection(conn),
    tradeSizeScaling: tradeSizeScalingFromConnection(conn),
    reverse: conn.reverse_signals ?? false,
    symbolWhitelist: conn.symbols_whitelist,
  }
}

export function lotMultiplierFromConnection(conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value'>): number {
  if (conn.lot_mode === 'multiplier') return Number(conn.lot_value) || 1
  // fixed / risk_percent usam tradeSizeScaling — multiplier CF deve ser 1
  return 1
}

/**
 * Round-up ao lote mínimo (forceTinyTrades) com coeficiente alto → contas abrem
 * sempre no mínimo do broker, mantendo o cálculo de scaling.
 */
const COPYFACTORY_MAX_RISK_COEFFICIENT = 100
/** Abaixo deste saldo, o scaling não chega ao lote mínimo de forma fiável → lote fixo. */
const MICRO_ACCOUNT_BALANCE = 1000
const MICRO_ACCOUNT_FIXED_LOT = 0.01

export function tradeSizeScalingFromConnection(
  conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value'>,
): CopyFactoryTradeSizeScaling {
  const value = Number(conn.lot_value) || 0.01
  const tiny = {
    forceTinyTrades: true,
    maxRiskCoefficient: COPYFACTORY_MAX_RISK_COEFFICIENT,
  }
  if (conn.lot_mode === 'risk_percent') {
    return { mode: 'fixedRisk', riskFraction: Math.min(0.5, Math.max(0.001, value / 100)), ...tiny }
  }
  if (conn.lot_mode === 'fixed') {
    return { mode: 'fixedVolume', tradeVolume: Math.min(50, Math.max(0.01, value)), ...tiny }
  }
  // multiplier / default → scaling por saldo + round-up ao mínimo
  return { mode: 'balance', ...tiny }
}

/**
 * Regra automática por saldo: contas pequenas (< MICRO_ACCOUNT_BALANCE) usam lote
 * fixo mínimo (abrem sempre, independentemente do tamanho do provider); as restantes
 * usam o scaling normal. Aplica-se a todos os subscritores, agora e no futuro.
 */
export async function resolveScalingForConnection(
  conn: Pick<MTMcopierConnection, 'lot_mode' | 'lot_value' | 'metaapi_account_id'>,
): Promise<CopyFactoryTradeSizeScaling> {
  const tiny = { forceTinyTrades: true, maxRiskCoefficient: COPYFACTORY_MAX_RISK_COEFFICIENT }
  if (conn.metaapi_account_id) {
    const { getAccountBalance } = await import('./metaapi')
    const balance = await getAccountBalance(conn.metaapi_account_id)
    if (balance != null && balance > 0 && balance < MICRO_ACCOUNT_BALANCE) {
      return { mode: 'fixedVolume', tradeVolume: MICRO_ACCOUNT_FIXED_LOT, ...tiny }
    }
  }
  return tradeSizeScalingFromConnection(conn)
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
    | 'prop_firm_type'
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

  const cf = copyFactoryOptsFromConnection(conn)
  const symbolMapping = await buildSubscriberSymbolMapping(conn.metaapi_account_id)
  const tradeSizeScaling = await resolveScalingForConnection(conn)

  return subscribeToStrategies({
    accountId: conn.metaapi_account_id,
    name,
    strategyIds,
    multiplier: cf.multiplier,
    tradeSizeScaling,
    reverse: cf.reverse,
    symbolWhitelist: cf.symbolWhitelist,
    symbolMapping,
    copySl: cf.copySl,
    copyTp: cf.copyTp,
    skipPendingOrders: method === 'master_slave' ? false : cf.skipPendingOrders,
    riskLimits: cf.riskLimits,
    freshSubscribe: false,
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
    | 'prop_firm_type'
    | 'mt5_login_last4'
    | 'mt5_server'
    | 'account_label'
  >,
  userLabel: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!conn.metaapi_account_id) return { ok: false, error: 'Conta MetaAPI em falta' }

  const strategyId = conn.copyfactory_strategy_pick?.trim()
  if (!strategyId) return { ok: false, error: 'Estratégia MTM não escolhida' }

  // Só mantém a subscrição se a ROTA dessa estratégia estiver ATIVA. Se o admin pausar a
  // rota (toggle enabled=false em /admin/mtmcopy), DESINSCREVE → o CopyFactory deixa de
  // copiar NOVAS trades dessa estratégia (as posições já abertas mantêm-se). É isto que
  // faz o toggle do provider ter efeito real nas contas subscriber.
  try {
    const { getSignalSourcesConfig } = await import('./signal-sources-config')
    const { normalizeProviderRoutes } = await import('./provider-routes')
    const routes = normalizeProviderRoutes(await getSignalSourcesConfig())
    const route = routes.find((r) => r.strategy_id?.trim() === strategyId)
    if (route && route.enabled === false) {
      await unsubscribeFromStrategy(conn.metaapi_account_id).catch(() => {})
      return { ok: false, error: 'Pausado: provider desativado pelo admin' }
    }
  } catch {
    /* se a config falhar, segue e tenta subscrever normalmente */
  }

  const name =
    userLabel ||
    conn.account_label ||
    `MTMcopier · ****${conn.mt5_login_last4 ?? '?'} ${conn.mt5_server ?? ''}`.trim()

  const cf = copyFactoryOptsFromConnection(conn)
  const symbolMapping = await buildSubscriberSymbolMapping(conn.metaapi_account_id)
  const tradeSizeScaling = await resolveScalingForConnection(conn)

  return subscribeToStrategies({
    accountId: conn.metaapi_account_id,
    name,
    strategyIds: [strategyId],
    multiplier: cf.multiplier,
    tradeSizeScaling,
    reverse: cf.reverse,
    symbolWhitelist: cf.symbolWhitelist,
    copySl: cf.copySl,
    copyTp: cf.copyTp,
    skipPendingOrders: false,
    riskLimits: cf.riskLimits,
    symbolMapping,
    freshSubscribe: true,
  })
}

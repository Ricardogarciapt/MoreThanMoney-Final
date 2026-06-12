import {
  parseTelegramGroups,
  strategyIdsForTelegramGroups,
  strategyIdsForTelegramGroupsAsync,
  type MtmcopyCopyMethod,
} from './copy-methods'
import type { MTMcopierConnection, MtmcopyAccountRole, MtmcopySenderMode } from './types'
import {
  connectionCopyMethod,
  countCopyTraderSlaves,
  countMtmSignalSlaves,
  countTotalActive,
  copyTraderSlaveLimitMessage,
  maxCopyTraderSlaves,
} from './copy-limits'
import type { MtmcopyUserLimits } from './account-limits'
import { MAX_MTMCOPY_ACCOUNTS_MEMBER } from './account-limits'

export function deriveSenderMode(connections: MTMcopierConnection[]): MtmcopySenderMode {
  const master = connections.find((c) => c.account_role === 'master')
  if (master) return 'master_account'
  const explicit = connections.find((c) => c.sender_mode)?.sender_mode
  return explicit ?? 'telegram'
}

export function getMasterConnection(
  connections: MTMcopierConnection[],
): MTMcopierConnection | null {
  return connections.find((c) => c.account_role === 'master') ?? null
}

/** Mestre pronta para adicionar slaves (ligada na MetaAPI ou com estratégia CF criada). */
export function isMasterReadyForCopySlaves(master: MTMcopierConnection | null | undefined): boolean {
  if (!master || master.mt5_status === 'disconnected') return false
  if (master.copyfactory_strategy_id) return true
  return master.mt5_status === 'connected' && Boolean(master.metaapi_account_id)
}

export function countByRole(connections: MTMcopierConnection[], role: MtmcopyAccountRole): number {
  return connections.filter((c) => (c.account_role ?? 'slave') === role).length
}

export function canAddConnection(
  connections: MTMcopierConnection[],
  senderMode: MtmcopySenderMode,
  accountRole: MtmcopyAccountRole,
  options?: {
    isAdmin?: boolean
    limits?: MtmcopyUserLimits
    copyMethod?: MtmcopyCopyMethod
    copyfactoryStrategyPick?: string | null
  },
): { ok: boolean; error?: string } {
  const limits = options?.limits
  if (options?.isAdmin || limits?.unlimited) return { ok: true }

  const active = connections.filter((c) => c.mt5_status !== 'disconnected')
  const copyMethod =
    options?.copyMethod ??
    (senderMode === 'master_account' ? 'master_slave' : ('telegram_group' as MtmcopyCopyMethod))

  const maxAccounts = limits?.maxAccounts ?? MAX_MTMCOPY_ACCOUNTS_MEMBER
  const maxMasters = limits?.maxMasters ?? 1
  const maxSignalSlaves = limits?.maxSignalSlaves ?? 2
  const maxCopySlaves = limits?.maxCopyTraderSlaves ?? maxCopyTraderSlaves(active)

  if (countTotalActive(active) >= maxAccounts) {
    const tierHint = limits?.tier === 'vip' ? ' (VIP)' : ''
    return {
      ok: false,
      error: `Limite de ${maxAccounts} contas MTMcopier ligadas${tierHint}`,
    }
  }

  if (accountRole === 'master') {
    if (copyMethod !== 'master_slave' && senderMode !== 'master_account') {
      return { ok: false, error: 'Conta mestre só está disponível no copy trader pessoal' }
    }
    if (countByRole(active, 'master') >= maxMasters) {
      return { ok: false, error: 'Já tens uma conta mestre ligada' }
    }
    return { ok: true }
  }

  if (copyMethod === 'master_slave' || senderMode === 'master_account') {
    const master = getMasterConnection(active)
    if (!isMasterReadyForCopySlaves(master)) {
      return {
        ok: false,
        error: master
          ? 'Aguarda a conta mestre ficar ligada (estado: ligada) antes de adicionar slaves'
          : 'Liga primeiro a conta mestre antes de adicionar slaves',
      }
    }
    if (countCopyTraderSlaves(active) >= maxCopySlaves) {
      return { ok: false, error: copyTraderSlaveLimitMessage(maxCopySlaves) }
    }
    return { ok: true }
  }

  if (copyMethod === 'telegram_group' || copyMethod === 'strategy') {
    if (countMtmSignalSlaves(active) >= maxSignalSlaves) {
      return {
        ok: false,
        error: `Limite de ${maxSignalSlaves} contas em grupos MTM / estratégia (no total)`,
      }
    }
    const pick = options?.copyfactoryStrategyPick?.trim()
    if (copyMethod === 'strategy' && pick) {
      const dup = active.find(
        (c) =>
          connectionCopyMethod(c) === 'strategy' &&
          c.copyfactory_strategy_pick === pick,
      )
      if (dup) {
        return { ok: false, error: 'Já tens uma conta com esta estratégia MTM — uma estratégia por conta' }
      }
    }
    return { ok: true }
  }

  return { ok: true }
}

export function resolveStrategyForConnection(
  conn: Pick<MTMcopierConnection, 'account_role' | 'sender_mode' | 'copyfactory_strategy_id'>,
  master: Pick<MTMcopierConnection, 'copyfactory_strategy_id'> | null,
): string | null {
  const ids = resolveStrategyIdsForConnection(conn, master)
  return ids[0] ?? null
}

export function resolveStrategyIdsForConnection(
  conn: Pick<
    MTMcopierConnection,
    | 'account_role'
    | 'sender_mode'
    | 'copy_method'
    | 'copyfactory_strategy_id'
    | 'copyfactory_strategy_pick'
    | 'telegram_group'
    | 'telegram_groups'
  >,
  master: Pick<MTMcopierConnection, 'copyfactory_strategy_id'> | null,
): string[] {
  if (conn.account_role === 'master') return []

  const mode = conn.sender_mode ?? 'telegram'
  const method = conn.copy_method ?? (mode === 'master_account' ? 'master_slave' : 'telegram_group')

  if (method === 'master_slave' || mode === 'master_account') {
    const id = master?.copyfactory_strategy_id ?? conn.copyfactory_strategy_id
    return id ? [id] : []
  }

  if (method === 'strategy' && conn.copyfactory_strategy_pick) {
    return [conn.copyfactory_strategy_pick]
  }

  if (method === 'telegram_group') {
    return strategyIdsForTelegramGroups(parseTelegramGroups(conn))
  }

  return []
}

export async function resolveStrategyIdsForConnectionAsync(
  conn: Pick<
    MTMcopierConnection,
    | 'account_role'
    | 'sender_mode'
    | 'copy_method'
    | 'copyfactory_strategy_id'
    | 'copyfactory_strategy_pick'
    | 'telegram_group'
    | 'telegram_groups'
  >,
  master: Pick<MTMcopierConnection, 'copyfactory_strategy_id'> | null,
): Promise<string[]> {
  if (conn.account_role === 'master') return []

  const mode = conn.sender_mode ?? 'telegram'
  const method = conn.copy_method ?? (mode === 'master_account' ? 'master_slave' : 'telegram_group')

  if (method === 'master_slave' || mode === 'master_account') {
    const id = master?.copyfactory_strategy_id ?? conn.copyfactory_strategy_id
    return id ? [id] : []
  }

  if (method === 'strategy' && conn.copyfactory_strategy_pick) {
    return [conn.copyfactory_strategy_pick]
  }

  if (method === 'telegram_group') {
    return strategyIdsForTelegramGroupsAsync(parseTelegramGroups(conn))
  }

  return []
}

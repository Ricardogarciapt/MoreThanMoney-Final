import type { MtmcopyCopyMethod } from './copy-methods'
import type { MTMcopierConnection } from './types'
import { MAX_MTMCOPY_COPY_SLAVES } from './types'

export function connectionCopyMethod(conn: MTMcopierConnection): MtmcopyCopyMethod {
  if (conn.copy_method === 'telegram_group' || conn.copy_method === 'strategy' || conn.copy_method === 'master_slave') {
    return conn.copy_method
  }
  if (conn.account_role === 'master' || conn.sender_mode === 'master_account') {
    return 'master_slave'
  }
  return 'telegram_group'
}

/**
 * Execução directa MetaAPI (parser → conta do utilizador).
 * Apenas `telegram_group` — método Estratégia MTM replica só via CopyFactory (sem parser duplicado).
 */
export function prefersDirectExecution(
  conn: Pick<MTMcopierConnection, 'copy_method' | 'sender_mode' | 'account_role'>,
): boolean {
  if ((conn.account_role ?? 'slave') === 'master') return false
  if (conn.sender_mode === 'master_account' || conn.copy_method === 'master_slave') return false
  if (conn.copy_method === 'strategy') return false
  return conn.copy_method === 'telegram_group' || conn.copy_method == null
}

export function countTotalActive(connections: MTMcopierConnection[]): number {
  return connections.filter((c) => c.mt5_status !== 'disconnected').length
}

export function countSlavesForMethod(
  connections: MTMcopierConnection[],
  method: MtmcopyCopyMethod,
): number {
  return connections.filter(
    (c) =>
      c.mt5_status !== 'disconnected' &&
      (c.account_role ?? 'slave') === 'slave' &&
      connectionCopyMethod(c) === method,
  ).length
}

/** Slaves em grupos Telegram MTM (método 1 — parser directo). */
export function countMtmSignalSlaves(connections: MTMcopierConnection[]): number {
  return connections.filter(
    (c) =>
      c.mt5_status !== 'disconnected' &&
      (c.account_role ?? 'slave') === 'slave' &&
      connectionCopyMethod(c) === 'telegram_group',
  ).length
}

/** Slaves no copy trader pessoal (método 3). */
export function countCopyTraderSlaves(connections: MTMcopierConnection[]): number {
  return connections.filter(
    (c) =>
      c.mt5_status !== 'disconnected' &&
      (c.account_role ?? 'slave') === 'slave' &&
      connectionCopyMethod(c) === 'master_slave',
  ).length
}

export function maxCopyTraderSlaves(_connections: MTMcopierConnection[]): number {
  return MAX_MTMCOPY_COPY_SLAVES
}

export function copyTraderSlaveLimitMessage(max: number): string {
  return `Limite de ${max} contas slave no copy trader pessoal`
}

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { connectionCopyMethod } from './copy-limits'
import { normalizeTelegramChannel } from './copy-methods'
import { syncMtmStrategyReplication, syncConnectionCopyFactory } from './connection-sync'
import type { MTMcopierConnection } from './types'

const TELEGRAM_CHANNEL_ERROR_RE = /Canal não encontrado|administrador do canal/i

export function isTelegramChannelErrorMessage(msg: string | null | undefined): boolean {
  return Boolean(msg && TELEGRAM_CHANNEL_ERROR_RE.test(msg))
}

export function connectionUsesTelegramChannel(
  conn: Pick<MTMcopierConnection, 'copy_method' | 'sender_mode' | 'account_role'>,
): boolean {
  if ((conn.account_role ?? 'slave') === 'master') return false
  if (conn.sender_mode === 'master_account') return false
  return connectionCopyMethod(conn as MTMcopierConnection) === 'telegram_group'
}

/** Estado «Método» no UI — estratégia MTM usa CopyFactory, não Telegram. */
export function connectionMethodStatus(conn: MTMcopierConnection): string {
  const method = connectionCopyMethod(conn)
  if (method === 'strategy') {
    if (conn.mt5_status !== 'connected') return conn.mt5_status
    return conn.copyfactory_subscribed ? 'connected' : 'pending'
  }
  if (method === 'master_slave' || conn.account_role === 'master') return 'connected'
  return conn.telegram_status
}

export function sanitizeConnectionForClient(conn: MTMcopierConnection): MTMcopierConnection {
  const method = connectionCopyMethod(conn)
  const channel = normalizeTelegramChannel(conn.telegram_channel)

  if (method === 'strategy') {
    return {
      ...conn,
      telegram_channel: null,
      telegram_status: 'connected',
      last_error: isTelegramChannelErrorMessage(conn.last_error) ? null : conn.last_error,
    }
  }

  return { ...conn, telegram_channel: channel }
}

/** Repara registos strategy com telegram_channel «null» ou erro de canal indevido. */
export async function repairStrategyConnectionIfNeeded(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  conn: MTMcopierConnection,
  userLabel: string,
  opts?: { forceResync?: boolean },
): Promise<MTMcopierConnection> {
  if (connectionCopyMethod(conn) !== 'strategy') {
    return sanitizeConnectionForClient(conn)
  }

  const badChannel = normalizeTelegramChannel(conn.telegram_channel) !== null
  const badTelegram =
    conn.telegram_status === 'error' || isTelegramChannelErrorMessage(conn.last_error)
  const needsCf =
    conn.metaapi_account_id &&
    conn.mt5_status === 'connected' &&
    (!conn.copyfactory_subscribed || opts?.forceResync === true)

  if (!badChannel && !badTelegram && !needsCf) {
    return sanitizeConnectionForClient(conn)
  }

  const patch: Record<string, unknown> = {
    telegram_channel: null,
    telegram_status: 'connected',
    updated_at: new Date().toISOString(),
  }

  if (isTelegramChannelErrorMessage(conn.last_error)) {
    patch.last_error = null
  }

  if (needsCf) {
    const sync = opts?.forceResync
      ? await syncConnectionCopyFactory(conn, userLabel)
      : await syncMtmStrategyReplication(conn, userLabel)
    if (sync.ok) {
      patch.copyfactory_subscribed = true
      patch.last_error = null
    } else if (!conn.last_error || isTelegramChannelErrorMessage(conn.last_error)) {
      patch.last_error = sync.error ?? 'Falha ao sincronizar estratégia CopyFactory'
    }
  }

  const { data } = await supabase
    .from('mtmcopy_connections')
    .update(patch)
    .eq('id', conn.id)
    .select()
    .single()

  return sanitizeConnectionForClient((data ?? { ...conn, ...patch }) as MTMcopierConnection)
}

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { connectionCopyMethod } from './copy-limits'
import { normalizeTelegramChannel } from './copy-methods'
import {
  syncMtmStrategyReplication,
  syncConnectionCopyFactory,
  removeConnectionCopyFactory,
} from './connection-sync'
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

  // Conta em PAUSA (is_active=false): a cópia CopyFactory tem de ficar desligada.
  // NUNCA (re)subscrever enquanto pausada — este resync era o bug de dinheiro real
  // (a pausa removia a subscrição, mas o próximo GET/​system-sync re-subscrevia e as
  // trades voltavam a abrir). A conta MetaApi mantém-se ligada (mt5) só p/ estatísticas.
  const paused = conn.is_active === false
  const badChannel = normalizeTelegramChannel(conn.telegram_channel) !== null
  const badTelegram =
    conn.telegram_status === 'error' || isTelegramChannelErrorMessage(conn.last_error)
  const needsCf =
    !paused &&
    conn.metaapi_account_id &&
    conn.mt5_status === 'connected' &&
    (!conn.copyfactory_subscribed || opts?.forceResync === true)
  // Auto-cura: pausada mas ainda com subscrição viva (bug antigo, ou pausa não removeu
  // por causa do método) → remove agora a subscrição CopyFactory.
  const needsUnsub = paused && conn.copyfactory_subscribed === true && !!conn.metaapi_account_id

  if (!badChannel && !badTelegram && !needsCf && !needsUnsub) {
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
  } else if (needsUnsub) {
    await removeConnectionCopyFactory(conn.metaapi_account_id).catch(() => {})
    patch.copyfactory_subscribed = false
  }

  const { data } = await supabase
    .from('mtmcopy_connections')
    .update(patch)
    .eq('id', conn.id)
    .select()
    .single()

  return sanitizeConnectionForClient((data ?? { ...conn, ...patch }) as MTMcopierConnection)
}

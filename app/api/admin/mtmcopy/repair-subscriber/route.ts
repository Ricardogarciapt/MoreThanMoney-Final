import { type NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  parseTelegramGroups,
  strategyIdsForTelegramGroupsAsync,
  type MtmcopyTelegramGroup,
} from '@/lib/mtmcopy/copy-methods'
import { connectionCopyMethod, prefersDirectExecution } from '@/lib/mtmcopy/copy-limits'
import { subscribeToStrategies } from '@/lib/mtmcopy/copyfactory'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { getAccountSnapshot } from '@/lib/mtmcopy/metaapi'
import {
  syncConnectionCopyFactory,
  syncMtmStrategyReplication,
  tradeSizeScalingFromConnection,
} from '@/lib/mtmcopy/connection-sync'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ??
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

async function fetchMetaAccount(accountId: string) {
  const token = process.env.METAAPI_TOKEN?.trim()
  if (!token) return null
  const res = await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}`, {
    headers: { 'auth-token': token, Accept: 'application/json' },
  })
  if (!res.ok) return null
  return res.json() as Promise<Record<string, unknown>>
}

/**
 * Liga subscriber MetaAPI ↔ mtmcopy_connections e sincroniza estratégias CF
 * conforme grupos Telegram (Premium 9gsL · Trade Ideas 5IHE).
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const metaapiAccountId = String(body.metaapi_account_id ?? '').trim()
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id.trim() : ''
  const groupsInput = body.telegram_groups as MtmcopyTelegramGroup[] | undefined

  if (!metaapiAccountId) {
    return NextResponse.json({ success: false, error: 'metaapi_account_id obrigatório' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const account = await fetchMetaAccount(metaapiAccountId)
  if (!account) {
    return NextResponse.json({ success: false, error: 'Conta MetaAPI não encontrada' }, { status: 404 })
  }

  const metadata = (account.metadata ?? {}) as { mtmUserId?: string }
  const resolvedUserId = userId || metadata.mtmUserId || ''
  if (!resolvedUserId) {
    return NextResponse.json(
      { success: false, error: 'user_id em falta (nem em metadata.mtmUserId)' },
      { status: 400 },
    )
  }

  const login = String(account.login ?? '')
  const server = String(account.server ?? '')
  const connectionStatus = String(account.connectionStatus ?? '')
  const mt5Status =
    connectionStatus === 'CONNECTED' ? 'connected' : connectionStatus === 'DISCONNECTED' ? 'error' : 'pending'

  let connection: MTMcopierConnection | null = null

  if (connectionId) {
    const { data } = await supabase
      .from('mtmcopy_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', resolvedUserId)
      .maybeSingle()
    connection = data as MTMcopierConnection | null
  }

  if (!connection) {
    const { data } = await supabase
      .from('mtmcopy_connections')
      .select('*')
      .eq('metaapi_account_id', metaapiAccountId)
      .maybeSingle()
    connection = data as MTMcopierConnection | null
  }

  const groups: MtmcopyTelegramGroup[] =
    groupsInput?.length
      ? groupsInput.filter((g) => g === 'premium' || g === 'trade_ideas')
      : connection
        ? parseTelegramGroups(connection)
        : ['trade_ideas']

  const patch: Record<string, unknown> = {
    user_id: resolvedUserId,
    metaapi_account_id: metaapiAccountId,
    mt5_login: login || null,
    mt5_login_last4: login.slice(-4) || null,
    mt5_server: server || null,
    mt5_platform: 'mt5',
    mt5_status: mt5Status,
    telegram_groups: groups,
    telegram_group: groups[0] ?? 'trade_ideas',
    copy_method: connection?.copy_method === 'strategy' ? 'strategy' : 'telegram_group',
    sender_mode: 'telegram',
    account_role: 'slave',
    is_active: true,
    updated_at: new Date().toISOString(),
    last_error:
      mt5Status === 'error'
        ? 'Conta MetaAPI desligada — religa em /mtmcopy com password MT5'
        : null,
  }

  if (!connection) {
    patch.account_label = String(account.name ?? 'MTMcopier').replace(/^MTMcopier · /, '')
    patch.telegram_status = 'connected'
    patch.lot_mode = 'risk_percent'
    patch.lot_value = 1
    patch.max_risk_percent = 2
    patch.copy_sl = true
    patch.copy_tp = true
    patch.auto_trailing_stop = true
    patch.trailing_stop_points = 200
    patch.reverse_signals = false
    patch.copyfactory_subscribed = false

    const { data: inserted, error } = await supabase
      .from('mtmcopy_connections')
      .insert(patch)
      .select()
      .single()
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    connection = inserted as MTMcopierConnection
  } else {
    const { data: updated, error } = await supabase
      .from('mtmcopy_connections')
      .update(patch)
      .eq('id', connection.id)
      .select()
      .single()
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    connection = updated as MTMcopierConnection
  }

  invalidateCopyConnectionsCache()

  const strategyIds = await strategyIdsForTelegramGroupsAsync(groups)
  let cfSync: { ok: boolean; error?: string } = { ok: true }

  if (connection.copy_method === 'strategy') {
    cfSync = await syncMtmStrategyReplication(
      connection,
      connection.account_label || `MTMcopier · ${login.slice(-4)}`,
    )
    if (cfSync.ok) {
      await supabase
        .from('mtmcopy_connections')
        .update({ copyfactory_subscribed: true, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
      connection = { ...connection, copyfactory_subscribed: true }
    }
  } else if (prefersDirectExecution(connection)) {
    await supabase
      .from('mtmcopy_connections')
      .update({ copyfactory_subscribed: false, updated_at: new Date().toISOString() })
      .eq('id', connection.id)
    connection = { ...connection, copyfactory_subscribed: false }
  } else if (strategyIds.length) {
    cfSync = await subscribeToStrategies({
      accountId: metaapiAccountId,
      name: connection.account_label || `MTMcopier · ${login.slice(-4)}`,
      strategyIds,
      multiplier: 1,
      copySl: connection.copy_sl,
      copyTp: connection.copy_tp,
      tradeSizeScaling: tradeSizeScalingFromConnection(connection),
    })
    if (cfSync.ok) {
      await supabase
        .from('mtmcopy_connections')
        .update({ copyfactory_subscribed: true, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
    }
  }

  const snap = await getAccountSnapshot(metaapiAccountId)

  return NextResponse.json({
    success: true,
    connection_id: connection.id,
    metaapi_account_id: metaapiAccountId,
    user_id: resolvedUserId,
    telegram_groups: groups,
    strategy_ids: strategyIds,
    connection_status: connectionStatus,
    balance: snap?.balance ?? null,
    copyfactory_sync: cfSync,
    copy_method: connectionCopyMethod(connection),
    execution_mode: prefersDirectExecution(connection) ? 'direct_metaapi' : 'copyfactory',
    message:
      mt5Status === 'error'
        ? 'Ligação criada/actualizada mas conta MetaAPI está DISCONNECTED — religa em /mtmcopy'
        : strategyIds.length
          ? `Subscriber sincronizado · estratégias: ${strategyIds.join(', ')}`
          : 'Ligação actualizada (sem estratégias CF para estes grupos)',
  })
}

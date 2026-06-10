import { after, NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCopyFactoryEnabled, isMtmTelegramStrategyConfigured } from '@/lib/mtmcopy/copyfactory'
import { isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'
import { last4, provisionMasterAccount, provisionSlaveAccount } from '@/lib/mtmcopy/metaapi-provision'
import type { MtmcopyAccountRole, MtmcopySenderMode } from '@/lib/mtmcopy/types'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'
import { normalizeTelegramGroups, type MtmcopyCopyMethod } from '@/lib/mtmcopy/copy-methods'
import {
  canAddConnection,
  getMasterConnection,
  resolveStrategyIdsForConnectionAsync,
} from '@/lib/mtmcopy/user-copy-context'

const supabaseAdmin = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

async function listActiveConnections(userId: string) {
  const { data } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .eq('user_id', userId)
    .neq('mt5_status', 'disconnected')
  return data ?? []
}

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  if (!isMetaApiConfigured() || !isCopyFactoryEnabled()) {
    return NextResponse.json({ error: 'MetaAPI / CopyFactory não configurado no servidor' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const copyMethod: MtmcopyCopyMethod =
    body.copy_method === 'strategy' || body.copy_method === 'master_slave'
      ? body.copy_method
      : body.copy_method === 'telegram_group'
        ? 'telegram_group'
        : body.sender_mode === 'master_account'
          ? 'master_slave'
          : 'telegram_group'

  const senderMode: MtmcopySenderMode =
    copyMethod === 'master_slave' ? 'master_account' : 'telegram'
  const accountRole: MtmcopyAccountRole =
    body.account_role === 'master' ? 'master' : 'slave'

  if (copyMethod !== 'master_slave' && accountRole === 'master') {
    return NextResponse.json(
      { error: 'Conta mestre só está disponível no copy trader pessoal' },
      { status: 400 },
    )
  }

  if (copyMethod !== 'master_slave' && !isMtmTelegramStrategyConfigured()) {
    return NextResponse.json(
      { error: 'Serviço de cópia MTM temporariamente indisponível. Tenta mais tarde.' },
      { status: 503 },
    )
  }

  const {
    mt5_login,
    mt5_password,
    mt5_server,
    mt5_platform,
    telegram_channel,
    account_label,
    lot_mode,
    lot_value,
    max_risk_percent,
    symbols_whitelist,
    copy_sl,
    copy_tp,
    auto_trailing_stop,
    trailing_stop_points,
    reverse_signals,
    copy_method: _copyMethodBody,
    telegram_group,
    telegram_groups,
    exit_pct_tp1,
    exit_pct_tp2,
    exit_pct_tp3,
    copyfactory_strategy_pick,
  } = body

  const login = String(mt5_login ?? '').trim()
  const password = String(mt5_password ?? '')
  const server = String(mt5_server ?? '').trim()
  const platform = mt5_platform === 'mt4' ? 'mt4' : 'mt5'
  const loginDigits = login.replace(/\D/g, '')

  if (!loginDigits || !password || !server) {
    return NextResponse.json(
      { error: 'Preenche login, password e servidor da conta de trading' },
      { status: 400 },
    )
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('user_type, full_name, username, email')
    .eq('id', user.id)
    .maybeSingle()

  const subscription = await getMtmcopySubscription(user.id, profileRow?.user_type)

  const normalizedGroups = normalizeTelegramGroups(telegram_groups, telegram_group)

  if (copyMethod === 'telegram_group' && accountRole === 'slave' && !normalizedGroups.length) {
    return NextResponse.json({ error: 'Escolhe pelo menos um grupo de sinais' }, { status: 400 })
  }

  if (copyMethod === 'strategy' && accountRole === 'slave' && !copyfactory_strategy_pick?.trim()) {
    return NextResponse.json({ error: 'Escolhe uma estratégia MTM' }, { status: 400 })
  }

  const activeConnections = await listActiveConnections(user.id)
  const limitCheck = canAddConnection(activeConnections, senderMode, accountRole, {
    isAdmin: subscription.reason === 'admin',
    copyMethod,
  })
  if (!limitCheck.ok) {
    return NextResponse.json({ error: limitCheck.error }, { status: 400 })
  }

  const { data: duplicate } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('mt5_login', loginDigits)
    .eq('mt5_server', server)
    .neq('mt5_status', 'disconnected')
    .maybeSingle()

  if (duplicate) {
    return NextResponse.json({ error: 'Esta conta MT5 já está ligada' }, { status: 409 })
  }

  const label =
    String(account_label ?? '').trim() ||
    profileRow?.full_name ||
    profileRow?.username ||
    profileRow?.email ||
    `MTM-${user.id.slice(0, 8)}`

  const masterConn = getMasterConnection(activeConnections)

  const connectionPayload: Record<string, unknown> = {
    user_id: user.id,
    account_role: accountRole,
    sender_mode: senderMode,
    mt5_login: loginDigits,
    mt5_login_last4: last4(login),
    mt5_server: server,
    mt5_platform: platform,
    mt5_status: 'pending',
    telegram_channel: senderMode === 'telegram' ? (telegram_channel?.trim() || null) : null,
    account_label: String(account_label ?? '').trim() || null,
    is_active: subscription.active,
    copy_method: copyMethod,
    telegram_groups: normalizedGroups,
    telegram_group: normalizedGroups[0] ?? null,
    exit_pct_tp1: exit_pct_tp1 ?? 33,
    exit_pct_tp2: exit_pct_tp2 ?? 33,
    exit_pct_tp3: exit_pct_tp3 ?? 34,
    copyfactory_strategy_pick: copyfactory_strategy_pick?.trim() || null,
    updated_at: new Date().toISOString(),
    telegram_status: senderMode === 'master_account' ? 'connected' : 'pending',
  }

  if (accountRole === 'slave') {
    if (lot_mode) connectionPayload.lot_mode = lot_mode
    if (lot_value != null) connectionPayload.lot_value = lot_value
    if (max_risk_percent != null) connectionPayload.max_risk_percent = max_risk_percent
    if (symbols_whitelist !== undefined) connectionPayload.symbols_whitelist = symbols_whitelist
    if (typeof copy_sl === 'boolean') connectionPayload.copy_sl = copy_sl
    if (typeof copy_tp === 'boolean') connectionPayload.copy_tp = copy_tp
    if (typeof auto_trailing_stop === 'boolean') connectionPayload.auto_trailing_stop = auto_trailing_stop
    if (trailing_stop_points != null) {
      const pts = parseInt(String(trailing_stop_points), 10)
      if (Number.isFinite(pts) && pts > 0) connectionPayload.trailing_stop_points = pts
    }
    if (typeof reverse_signals === 'boolean') connectionPayload.reverse_signals = reverse_signals
  } else {
    connectionPayload.lot_mode = 'multiplier'
    connectionPayload.lot_value = 1
    connectionPayload.copy_sl = true
    connectionPayload.copy_tp = true
    connectionPayload.reverse_signals = false
  }

  const { data: connection, error: insertError } = await supabaseAdmin
    .from('mtmcopy_connections')
    .insert(connectionPayload)
    .select()
    .single()

  if (insertError) {
    console.error('[mtmcopy/provision] insert:', insertError)
    return NextResponse.json({ error: 'Erro ao criar ligação' }, { status: 500 })
  }

  const connectionId = connection.id
  const lotMultiplier =
    lot_mode === 'multiplier' ? Number(lot_value) || 1 : lot_mode === 'fixed' ? Number(lot_value) || 0.01 : 1

  after(async () => {
    const userLabel = `MTMcopier · ${label}`

    const strategyIdsForSlave =
      accountRole === 'slave'
        ? await resolveStrategyIdsForConnectionAsync(
            {
              account_role: accountRole,
              sender_mode: senderMode,
              copy_method: copyMethod,
              copyfactory_strategy_pick: copyfactory_strategy_pick?.trim() || null,
              telegram_group: normalizedGroups[0] ?? null,
              telegram_groups: normalizedGroups,
              copyfactory_strategy_id: null,
            },
            masterConn,
          )
        : []

    const result =
      accountRole === 'master'
        ? await provisionMasterAccount({
            login,
            password,
            server,
            platform,
            userId: user.id,
            userLabel,
          })
        : await provisionSlaveAccount({
            login,
            password,
            server,
            platform,
            userId: user.id,
            userLabel,
            lotMultiplier,
            reverse: reverse_signals ?? connection.reverse_signals,
            symbolWhitelist: symbols_whitelist ?? connection.symbols_whitelist,
            senderMode,
            strategyId: masterConn?.copyfactory_strategy_id ?? null,
            strategyIds: strategyIdsForSlave.length ? strategyIdsForSlave : undefined,
          })

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (result.success && result.accountId) {
      patch.metaapi_account_id = result.accountId
      patch.mt5_status = 'connected'
      const subNow = await getMtmcopySubscription(user.id, profileRow?.user_type)
      patch.is_active = subNow.active
      patch.last_error = null

      if (accountRole === 'master' && result.strategyId) {
        patch.copyfactory_strategy_id = result.strategyId
        patch.copyfactory_subscribed = false
        patch.telegram_status = 'connected'
      } else {
        patch.copyfactory_subscribed = result.copyfactorySubscribed ?? false
        patch.telegram_status = connection.telegram_channel ? connection.telegram_status : 'connected'
      }

      if (senderMode === 'master_account' && accountRole === 'slave') {
        await supabaseAdmin
          .from('mtmcopy_connections')
          .update({ sender_mode: 'master_account' })
          .eq('user_id', user.id)
          .eq('account_role', 'master')
      }
    } else {
      patch.mt5_status = 'error'
      patch.last_error = result.error ?? 'Falha ao ligar conta via MetaAPI'
      if (result.accountId) patch.metaapi_account_id = result.accountId
      if (result.strategyId) patch.copyfactory_strategy_id = result.strategyId
    }

    await supabaseAdmin.from('mtmcopy_connections').update(patch).eq('id', connectionId)

    if (senderMode === 'master_account' && accountRole === 'master' && result.strategyId) {
      await supabaseAdmin
        .from('mtmcopy_connections')
        .update({ sender_mode: 'master_account' })
        .eq('user_id', user.id)
        .neq('mt5_status', 'disconnected')
    }
  })

  const message =
    accountRole === 'master'
      ? 'A ligar a tua conta mestre via MetaAPI CopyFactory. As trades desta conta serão o sender para as slaves.'
      : senderMode === 'master_account'
        ? 'A ligar conta slave à estratégia da tua conta mestre. Isto pode demorar 1–3 minutos.'
        : 'A ligar a tua conta à cópia MTM via MetaAPI. Isto pode demorar 1–3 minutos.'

  return NextResponse.json({
    success: true,
    status: 'provisioning',
    message,
    connection: { ...connection, mt5_status: 'pending' },
  })
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connection_id')

  let query = supabaseAdmin
    .from('mtmcopy_connections')
    .select(
      'id, mt5_status, metaapi_account_id, copyfactory_subscribed, copyfactory_strategy_id, account_role, sender_mode, last_error, mt5_platform, mt5_login_last4, mt5_server, account_label',
    )
    .eq('user_id', user.id)

  if (connectionId) {
    query = query.eq('id', connectionId)
  } else {
    query = query.neq('mt5_status', 'disconnected').order('created_at', { ascending: false }).limit(1)
  }

  const { data } = await query.maybeSingle()

  return NextResponse.json({
    connection: data,
    copyfactory: isCopyFactoryEnabled(),
    metaapi: isMetaApiConfigured(),
  })
}

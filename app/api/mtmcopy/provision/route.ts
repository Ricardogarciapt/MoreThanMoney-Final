import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCopyFactoryEnabled, isMtmTelegramStrategyConfigured } from '@/lib/mtmcopy/copyfactory'
import { isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'
import { last4 } from '@/lib/mtmcopy/metaapi-provision'
import { lotMultiplierFromConnection } from '@/lib/mtmcopy/connection-sync'
import { runProvisionJob } from '@/lib/mtmcopy/run-provision-job'
import type { MtmcopyAccountRole, MtmcopySenderMode } from '@/lib/mtmcopy/types'
import { resolveMtmcopyUserLimits } from '@/lib/mtmcopy/account-limits'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'
import { normalizeTelegramGroups, normalizeTelegramChannel, strategyIdsForTelegramGroupsAsync, type MtmcopyCopyMethod } from '@/lib/mtmcopy/copy-methods'
import {
  canAddConnection,
  getMasterConnection,
} from '@/lib/mtmcopy/user-copy-context'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'

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
  return (data ?? []) as MTMcopierConnection[]
}

export const maxDuration = 120

function parseCopyMethod(body: Record<string, unknown>): MtmcopyCopyMethod {
  if (body.copy_method === 'strategy' || body.copy_method === 'master_slave') {
    return body.copy_method
  }
  if (body.copy_method === 'telegram_group') return 'telegram_group'
  if (body.sender_mode === 'master_account') return 'master_slave'
  return 'telegram_group'
}

function ensureMetaApiReady() {
  if (!isMetaApiConfigured() || !isCopyFactoryEnabled()) {
    return NextResponse.json({ error: 'MetaAPI / CopyFactory não configurado no servidor' }, { status: 503 })
  }
  return null
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const notReady = ensureMetaApiReady()
  if (notReady) return notReady

  const body = await request.json().catch(() => ({}))
  let copyMethod = parseCopyMethod(body)

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
    telegram_group,
    telegram_groups,
    exit_pct_tp1,
    exit_pct_tp2,
    exit_pct_tp3,
    copyfactory_strategy_pick,
    purpose,
    symbol_suffix,
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

  // Tap to Trade: apenas corretoras permitidas (whitelist T2T_BROKERS) e 1 conta.
  if (purpose === 'tap_to_trade') {
    const { isAllowedT2TServer, T2T_BROKERS } = await import('@/lib/mtmcopy/t2t-brokers')
    if (!isAllowedT2TServer(server)) {
      const names = T2T_BROKERS.map((b) => b.label).join(', ')
      return NextResponse.json(
        { error: `No Tap to Trade só podes ligar contas destas corretoras: ${names}.` },
        { status: 400 },
      )
    }
    const { data: existingT2T } = await supabaseAdmin
      .from('mtmcopy_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('purpose', 'tap_to_trade')
      .neq('mt5_status', 'disconnected')
      .maybeSingle()
    if (existingT2T) {
      return NextResponse.json(
        { error: 'Já tens uma conta Tap to Trade ligada. Remove-a primeiro para ligar outra.', code: 't2t_account_exists' },
        { status: 409 },
      )
    }
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('user_type, member_category, full_name, username, email')
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

  // Ativar cópia REAL: se um slave MTM Copy escolhe grupo(s) que mapeiam para estratégia(s)
  // canónica(s) do CopyFactory, provisiona como 'strategy' (conta ganha role SUBSCRIBER +
  // subscreve no CopyFactory → copia mesmo). Antes o defeito 'telegram_group' provisionava
  // directOnly (sem role) → a conta ligava mas NÃO copiava. Grupos sem estratégia canónica
  // mantêm 'telegram_group' (execução direta por sinais).
  let resolvedPick = copyfactory_strategy_pick?.trim() || null
  let resolvedStrategyLots: Record<string, number> | null = null
  if (purpose !== 'tap_to_trade' && accountRole === 'slave' && copyMethod === 'telegram_group' && normalizedGroups.length) {
    try {
      const stratIds = await strategyIdsForTelegramGroupsAsync(normalizedGroups)
      if (stratIds.length === 1) {
        copyMethod = 'strategy'
        resolvedPick = resolvedPick ?? stratIds[0]
      } else if (stratIds.length > 1) {
        copyMethod = 'strategy'
        resolvedPick = resolvedPick ?? stratIds[0]
        const lot = lot_value != null && Number(lot_value) > 0 ? Number(lot_value) : 0.01
        resolvedStrategyLots = Object.fromEntries(stratIds.map((id) => [id, lot]))
      }
    } catch {
      /* resolução falhou → mantém telegram_group */
    }
  }

  const activeConnections = await listActiveConnections(user.id)
  const limits = resolveMtmcopyUserLimits(profileRow?.user_type, profileRow?.member_category)
  const limitCheck = canAddConnection(activeConnections, senderMode, accountRole, {
    isAdmin: subscription.reason === 'admin',
    limits,
    copyMethod,
    copyfactoryStrategyPick: resolvedPick,
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

  const connectionPayload: Record<string, unknown> = {
    user_id: user.id,
    account_role: accountRole,
    sender_mode: senderMode,
    mt5_login: loginDigits,
    mt5_login_last4: last4(login),
    mt5_server: server,
    mt5_platform: platform,
    mt5_status: 'pending',
    telegram_channel:
      copyMethod === 'strategy'
        ? null
        : senderMode === 'telegram'
          ? normalizeTelegramChannel(telegram_channel)
          : null,
    account_label: String(account_label ?? '').trim() || null,
    is_active: subscription.active,
    copy_method: copyMethod,
    telegram_groups: normalizedGroups,
    telegram_group: normalizedGroups[0] ?? null,
    exit_pct_tp1: exit_pct_tp1 ?? 33,
    exit_pct_tp2: exit_pct_tp2 ?? 33,
    exit_pct_tp3: exit_pct_tp3 ?? 34,
    copyfactory_strategy_pick: resolvedPick,
    strategy_lots: resolvedStrategyLots,
    updated_at: new Date().toISOString(),
    telegram_status:
      copyMethod === 'strategy' || senderMode === 'master_account' ? 'connected' : 'pending',
    // Conta independente do T2T (não interfere com a conta MTMcopy)
    purpose: purpose === 'tap_to_trade' ? 'tap_to_trade' : 'mtmcopy',
    // Sufixo do broker do seguidor (ex.: '.s' PU Prime, '-STD' VT Markets) → symbolMapping CopyFactory
    symbol_suffix: String(symbol_suffix ?? '').trim() || null,
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

  const lotMultiplier = lotMultiplierFromConnection({
    lot_mode: lot_mode ?? 'multiplier',
    lot_value: lot_value ?? 1,
  })

  const finalConnection = await runProvisionJob({
    userId: user.id,
    connectionId: connection.id,
    connection: connection as MTMcopierConnection,
    accountRole,
    senderMode,
    copyMethod,
    login,
    password,
    server,
    platform,
    label,
    userType: profileRow?.user_type,
    lotMultiplier,
    reverseSignals: reverse_signals,
    symbolsWhitelist: symbols_whitelist,
    copySl: copy_sl,
    copyTp: copy_tp,
    copyfactoryStrategyPick: resolvedPick,
    normalizedGroups,
  })

  const message =
    accountRole === 'master'
      ? 'Conta mestre ligada via MetaAPI CopyFactory.'
      : senderMode === 'master_account'
        ? 'Conta slave ligada à estratégia da tua conta mestre.'
        : 'Conta ligada à cópia MTM via MetaAPI.'

  return NextResponse.json({
    success: finalConnection.mt5_status === 'connected',
    status: finalConnection.mt5_status,
    message:
      finalConnection.mt5_status === 'connected'
        ? message
        : finalConnection.last_error ?? 'Falha ao ligar conta',
    connection: finalConnection,
  })
}

/** Religar conta em pending/erro (password obrigatória). */
export async function PUT(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const notReady = ensureMetaApiReady()
  if (notReady) return notReady

  const body = await request.json().catch(() => ({}))
  const connectionId = String(body.connection_id ?? '').trim()
  const password = String(body.mt5_password ?? '')

  if (!connectionId || !password) {
    return NextResponse.json(
      { error: 'connection_id e mt5_password são obrigatórios para religar' },
      { status: 400 },
    )
  }

  const { data: existing } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  }

  if (existing.mt5_status === 'disconnected') {
    return NextResponse.json({ error: 'Conta desligada — cria uma nova ligação' }, { status: 400 })
  }

  const conn = existing as MTMcopierConnection
  const accountRole: MtmcopyAccountRole = conn.account_role === 'master' ? 'master' : 'slave'
  const copyMethod =
    conn.copy_method ??
    (conn.sender_mode === 'master_account' ? 'master_slave' : 'telegram_group')
  const senderMode: MtmcopySenderMode =
    copyMethod === 'master_slave' ? 'master_account' : 'telegram'

  if (accountRole === 'slave' && copyMethod === 'master_slave') {
    const active = await listActiveConnections(user.id)
    const master = getMasterConnection(active)
    if (!master?.copyfactory_strategy_id || master.mt5_status !== 'connected') {
      return NextResponse.json(
        { error: 'Religa primeiro a conta mestre (tem de estar ligada com estratégia activa)' },
        { status: 400 },
      )
    }
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('user_type, full_name, username, email')
    .eq('id', user.id)
    .maybeSingle()

  const label =
    conn.account_label ||
    profileRow?.full_name ||
    profileRow?.username ||
    profileRow?.email ||
    `MTM-${user.id.slice(0, 8)}`

  await supabaseAdmin
    .from('mtmcopy_connections')
    .update({ mt5_status: 'pending', last_error: null, updated_at: new Date().toISOString() })
    .eq('id', connectionId)

  const normalizedGroups = normalizeTelegramGroups(conn.telegram_groups, conn.telegram_group)
  const lotMultiplier = lotMultiplierFromConnection(conn)

  const finalConnection = await runProvisionJob({
    userId: user.id,
    connectionId,
    connection: conn,
    accountRole,
    senderMode,
    copyMethod,
    login: conn.mt5_login ?? '',
    password,
    server: conn.mt5_server ?? '',
    platform: conn.mt5_platform === 'mt4' ? 'mt4' : 'mt5',
    label,
    userType: profileRow?.user_type,
    lotMultiplier,
    reverseSignals: conn.reverse_signals,
    symbolsWhitelist: conn.symbols_whitelist,
    copySl: conn.copy_sl,
    copyTp: conn.copy_tp,
    copyfactoryStrategyPick: conn.copyfactory_strategy_pick,
    normalizedGroups,
  })

  return NextResponse.json({
    success: finalConnection.mt5_status === 'connected',
    status: finalConnection.mt5_status,
    message:
      finalConnection.mt5_status === 'connected'
        ? 'Conta religada com sucesso'
        : finalConnection.last_error ?? 'Falha ao religar conta',
    connection: finalConnection,
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

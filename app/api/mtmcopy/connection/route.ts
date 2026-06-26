import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { connectionCopyMethod } from '@/lib/mtmcopy/copy-limits'
import { removeConnectionCopyFactory, syncConnectionCopyFactory, syncMtmStrategyReplication } from '@/lib/mtmcopy/connection-sync'
import { verifyTelegramChannel } from '@/lib/mtmcopy/telegram-bot'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'
import { normalizeTelegramGroups, normalizeTelegramChannel } from '@/lib/mtmcopy/copy-methods'
import { attachConnectionBalances } from '@/lib/mtmcopy/connection-balances'
import {
  repairStrategyConnectionIfNeeded,
  sanitizeConnectionForClient,
} from '@/lib/mtmcopy/connection-sanitize'
import { mtmcopyLimitsLabel, resolveMtmcopyUserLimits } from '@/lib/mtmcopy/account-limits'
import { deriveSenderMode } from '@/lib/mtmcopy/user-copy-context'
import type { MTMcopierConnection, MtmcopySenderMode } from '@/lib/mtmcopy/types'

const supabaseAdmin = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

async function getOwnedConnection(userId: string, connectionId: string) {
  const { data } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('id')

  if (connectionId) {
    const conn = await getOwnedConnection(user.id, connectionId)
    if (!conn) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    const [enriched] = await attachConnectionBalances([conn])
    return NextResponse.json({ connection: enriched })
  }

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[mtmcopy] erro ao obter ligações:', error)
    return NextResponse.json({ error: 'Erro ao obter configuração' }, { status: 500 })
  }

  const connections = await attachConnectionBalances(data ?? [])
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, username, email, user_type, member_category')
    .eq('id', user.id)
    .maybeSingle()
  const userLabel =
    profile?.full_name || profile?.username || profile?.email || `MTM-${user.id.slice(0, 8)}`
  const repaired = await Promise.all(
    (connections as MTMcopierConnection[]).map((c) =>
      connectionCopyMethod(c) === 'strategy'
        ? repairStrategyConnectionIfNeeded(supabaseAdmin, c, c.account_label || userLabel)
        : Promise.resolve(sanitizeConnectionForClient(c)),
    ),
  )
  const subscription = await getMtmcopySubscription(user.id, profile?.user_type)
  const limits = resolveMtmcopyUserLimits(profile?.user_type, profile?.member_category)

  // ?purpose=tap_to_trade → devolve a conta INDEPENDENTE do T2T como `connection`
  const purposeParam = searchParams.get('purpose')
  let primary = repaired[0] ?? null
  if (purposeParam) {
    const matchIds = new Set(
      (data ?? []).filter((c) => (c.purpose ?? 'mtmcopy') === purposeParam).map((c) => c.id),
    )
    primary = repaired.find((c) => matchIds.has((c as { id: string }).id)) ?? null
  }

  return NextResponse.json({
    connections: repaired,
    connection: primary,
    sender_mode: deriveSenderMode(repaired),
    master: repaired.find((c) => c.account_role === 'master') ?? null,
    subscribed: subscription.active,
    can_activate: subscription.active,
    limits,
    limits_label: mtmcopyLimitsLabel(limits),
    subscription_reason: subscription.reason,
  })
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const connectionId = body.connection_id as string | undefined
  if (!connectionId) {
    return NextResponse.json({ error: 'connection_id obrigatório para actualizar' }, { status: 400 })
  }

  const existing = await getOwnedConnection(user.id, connectionId)
  if (!existing) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const {
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
    copy_method,
    telegram_group,
    telegram_groups,
    exit_pct_tp1,
    exit_pct_tp2,
    exit_pct_tp3,
    copyfactory_strategy_pick,
    is_audited,
    audit_label,
    prop_firm_type,
    apply_prop_firm_preset,
    copy_as_manual,
  } = body

  if (lot_mode && !['fixed', 'risk_percent', 'multiplier'].includes(lot_mode)) {
    return NextResponse.json({ error: 'lot_mode inválido' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (telegram_channel !== undefined) {
    payload.telegram_channel = normalizeTelegramChannel(telegram_channel)
  }
  if (account_label !== undefined) {
    const label = String(account_label).trim()
    payload.account_label = label && label.toLowerCase() !== 'null' ? label : null
  }
  if (lot_mode !== undefined) payload.lot_mode = lot_mode
  if (lot_value !== undefined) payload.lot_value = lot_value
  if (max_risk_percent !== undefined) payload.max_risk_percent = max_risk_percent
  if (symbols_whitelist !== undefined) payload.symbols_whitelist = symbols_whitelist
  if (copy_sl !== undefined) payload.copy_sl = copy_sl
  if (copy_tp !== undefined) payload.copy_tp = copy_tp
  if (typeof auto_trailing_stop === 'boolean') payload.auto_trailing_stop = auto_trailing_stop
  if (trailing_stop_points !== undefined) {
    const pts = parseInt(String(trailing_stop_points), 10)
    if (Number.isFinite(pts) && pts > 0) payload.trailing_stop_points = pts
  }
  if (reverse_signals !== undefined) payload.reverse_signals = reverse_signals
  if (copy_method === 'telegram_group' || copy_method === 'strategy' || copy_method === 'master_slave') {
    payload.copy_method = copy_method
  }
  if (telegram_groups !== undefined || telegram_group !== undefined) {
    const groups = normalizeTelegramGroups(telegram_groups, telegram_group)
    payload.telegram_groups = groups
    payload.telegram_group = groups[0] ?? null
  }
  if (exit_pct_tp1 != null) payload.exit_pct_tp1 = exit_pct_tp1
  if (exit_pct_tp2 != null) payload.exit_pct_tp2 = exit_pct_tp2
  if (exit_pct_tp3 != null) payload.exit_pct_tp3 = exit_pct_tp3
  if (copyfactory_strategy_pick !== undefined) {
    payload.copyfactory_strategy_pick = copyfactory_strategy_pick?.trim() || null
  }
  if (typeof is_audited === 'boolean') payload.is_audited = is_audited
  if (audit_label !== undefined) payload.audit_label = String(audit_label).trim() || null

  if (apply_prop_firm_preset === true && prop_firm_type) {
    const { applyPropFirmToConnectionPatch } = await import('@/lib/mtmcopy/prop-firm-presets')
    if (prop_firm_type === 'ftmo' || prop_firm_type === 'fundednext') {
      Object.assign(payload, applyPropFirmToConnectionPatch(prop_firm_type))
    }
  } else if (prop_firm_type !== undefined) {
    payload.prop_firm_type =
      prop_firm_type === 'ftmo' || prop_firm_type === 'fundednext' ? prop_firm_type : null
  }
  if (typeof copy_as_manual === 'boolean') payload.copy_as_manual = copy_as_manual

  const effectiveMethod =
    copy_method === 'telegram_group' || copy_method === 'strategy' || copy_method === 'master_slave'
      ? copy_method
      : connectionCopyMethod(existing)

  if (effectiveMethod === 'telegram_group') {
    payload.copyfactory_subscribed = false
    if (existing.metaapi_account_id && existing.copyfactory_subscribed) {
      await removeConnectionCopyFactory(existing.metaapi_account_id)
    }
  }

  if (effectiveMethod === 'strategy') {
    payload.telegram_channel = null
    payload.telegram_status = 'connected'
  }

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update(payload)
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[mtmcopy] erro ao guardar ligação:', error)
    return NextResponse.json({ error: 'Erro ao guardar configuração' }, { status: 500 })
  }

  let connection = data
  let telegram_verify

  const channelTrimmed =
    telegram_channel !== undefined
      ? normalizeTelegramChannel(telegram_channel)
      : normalizeTelegramChannel(connection?.telegram_channel)

  const isMaster = existing.account_role === 'master'
  const isMasterMode = (existing.sender_mode ?? 'telegram') === 'master_account'
  const needsTelegramChannel = effectiveMethod === 'telegram_group'

  if (telegram_channel !== undefined && !isMaster && !isMasterMode && needsTelegramChannel) {
    if (channelTrimmed) {
      telegram_verify = await verifyTelegramChannel(channelTrimmed)
      const telegram_status = telegram_verify.ok
        ? 'connected'
        : telegram_verify.botIsAdmin === false
          ? 'pending'
          : 'error'
      const { data: updated } = await supabaseAdmin
        .from('mtmcopy_connections')
        .update({
          telegram_status,
          last_error: telegram_verify.ok ? null : telegram_verify.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .select()
        .single()
      if (updated) connection = updated
    } else {
      const { data: updated } = await supabaseAdmin
        .from('mtmcopy_connections')
        .update({
          telegram_channel: null,
          telegram_status: 'connected',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .select()
        .single()
      if (updated) connection = updated
      telegram_verify = { ok: true, title: 'Grupos MTM (predefinição)' }
    }
  } else if (effectiveMethod === 'strategy' && connection) {
    const { data: updated } = await supabaseAdmin
      .from('mtmcopy_connections')
      .update({
        telegram_channel: null,
        telegram_status: 'connected',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
      .select()
      .single()
    if (updated) connection = updated
  }

  const connMethod = connection ? connectionCopyMethod(connection) : effectiveMethod
  if (
    connection?.metaapi_account_id &&
    connection.account_role !== 'master' &&
    connMethod === 'strategy' &&
    !connection.copyfactory_subscribed
  ) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, username, email')
      .eq('id', user.id)
      .maybeSingle()
    const label =
      connection.account_label ||
      profile?.full_name ||
      profile?.username ||
      profile?.email ||
      `MTM-${user.id.slice(0, 8)}`
    const sync = await syncMtmStrategyReplication(connection, label)
    if (sync.ok) {
      const { data: updated } = await supabaseAdmin
        .from('mtmcopy_connections')
        .update({
          copyfactory_subscribed: true,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .select()
        .single()
      if (updated) connection = updated
    } else {
      await supabaseAdmin
        .from('mtmcopy_connections')
        .update({ last_error: sync.error ?? 'Falha ao sincronizar estratégia CopyFactory' })
        .eq('id', connectionId)
    }
  }

  if (
    connection?.metaapi_account_id &&
    connection.account_role !== 'master' &&
    connection.copyfactory_subscribed &&
    connMethod === 'master_slave'
  ) {
    const { data: allConns } = await supabaseAdmin
      .from('mtmcopy_connections')
      .select('*')
      .eq('user_id', user.id)
      .neq('mt5_status', 'disconnected')

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, username, email')
      .eq('id', user.id)
      .maybeSingle()
    const label =
      connection.account_label ||
      profile?.full_name ||
      profile?.username ||
      profile?.email ||
      `MTM-${user.id.slice(0, 8)}`
    const sync = await syncConnectionCopyFactory(connection, label, allConns ?? [])
    if (!sync.ok) {
      await supabaseAdmin
        .from('mtmcopy_connections')
        .update({ last_error: sync.error ?? 'Falha ao sincronizar CopyFactory' })
        .eq('id', connectionId)
    }
  }

  return NextResponse.json({
    success: true,
    connection,
    telegram_verify,
    signal_source: channelTrimmed ? 'custom' : 'default',
  })
}

export async function PATCH(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { connection_id, is_active, sender_mode, copy_method } = body

  if (
    copy_method === 'telegram_group' ||
    copy_method === 'strategy' ||
    copy_method === 'master_slave'
  ) {
    const mode = copy_method === 'master_slave' ? 'master_account' : 'telegram'
    const { data: existing } = await supabaseAdmin
      .from('mtmcopy_connections')
      .select('id, account_role')
      .eq('user_id', user.id)
      .neq('mt5_status', 'disconnected')

    // Só actualiza ligações do mesmo «tipo» (não mistura mestre/copy-trader com grupos MTM)
    const roleFilter =
      copy_method === 'master_slave'
        ? (c: { account_role?: string | null }) =>
            c.account_role === 'master' || c.account_role === 'slave'
        : (c: { account_role?: string | null }) => (c.account_role ?? 'slave') !== 'master'

    const targets = (existing ?? []).filter(roleFilter)
    if (!targets.length) {
      return NextResponse.json({ success: true, copy_method, sender_mode: mode })
    }

    await supabaseAdmin
      .from('mtmcopy_connections')
      .update({
        copy_method,
        sender_mode: mode,
        updated_at: new Date().toISOString(),
      })
      .in(
        'id',
        targets.map((c) => c.id),
      )

    return NextResponse.json({ success: true, copy_method, sender_mode: mode })
  }

  if (sender_mode === 'telegram' || sender_mode === 'master_account') {
    const mode = sender_mode as MtmcopySenderMode
    const { data: existing } = await supabaseAdmin
      .from('mtmcopy_connections')
      .select('id, account_role')
      .eq('user_id', user.id)
      .neq('mt5_status', 'disconnected')

    await supabaseAdmin
      .from('mtmcopy_connections')
      .update({ sender_mode: mode, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .neq('mt5_status', 'disconnected')

    return NextResponse.json({ success: true, sender_mode: mode })
  }

  if (!connection_id) {
    return NextResponse.json({ error: 'connection_id obrigatório' }, { status: 400 })
  }
  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'Campo is_active (boolean) obrigatório' }, { status: 400 })
  }

  if (is_active) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .maybeSingle()
    const sub = await getMtmcopySubscription(user.id, profile?.user_type)
    if (!sub.active) {
      return NextResponse.json(
        { error: 'Activa a subscrição MTMcopier (+20€/mês) antes de ligar a cópia.' },
        { status: 402 },
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', connection_id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[mtmcopy] erro ao atualizar estado:', error)
    return NextResponse.json({ error: 'Erro ao atualizar estado' }, { status: 500 })
  }

  return NextResponse.json({ success: true, connection: data })
}

export async function DELETE(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('id') || (await request.json().catch(() => ({}))).connection_id

  if (!connectionId) {
    return NextResponse.json({ error: 'id da conta obrigatório' }, { status: 400 })
  }

  const existing = await getOwnedConnection(user.id, String(connectionId))
  if (!existing) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  if (existing.metaapi_account_id && existing.copyfactory_subscribed) {
    await removeConnectionCopyFactory(existing.metaapi_account_id)
  }

  if (existing.account_role === 'master') {
    const { data: slaves } = await supabaseAdmin
      .from('mtmcopy_connections')
      .select('id, metaapi_account_id, copyfactory_subscribed')
      .eq('user_id', user.id)
      .eq('account_role', 'slave')
      .neq('mt5_status', 'disconnected')

    for (const slave of slaves ?? []) {
      if (slave.metaapi_account_id && slave.copyfactory_subscribed) {
        await removeConnectionCopyFactory(slave.metaapi_account_id)
      }
      await supabaseAdmin
        .from('mtmcopy_connections')
        .update({
          copyfactory_subscribed: false,
          last_error: 'Conta mestre removida — volta a ligar as slaves após nova mestre',
          updated_at: new Date().toISOString(),
        })
        .eq('id', slave.id)
    }
  }

  const { error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[mtmcopy] erro ao apagar ligação:', error)
    return NextResponse.json({ error: 'Erro ao remover conta' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

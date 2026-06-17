import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import {
  TELEGRAM_SIGNAL_CHANNELS,
  getSignalSourcesConfig,
  saveSignalSourcesConfig,
  type MtmcopyChannelProviderConfig,
  type MtmcopySignalSourcesConfig,
  type MtmcopyTelegramChannelKey,
  type ProviderExecutionProfile,
} from '@/lib/mtmcopy/signal-sources-config'
import {
  DEFAULT_PROVIDER_EXECUTION,
  normalizeProviderExecutionProfile,
} from '@/lib/mtmcopy/provider-execution'
import { normalizeProviderRoutes, syncChannelProvidersFromRoutes } from '@/lib/mtmcopy/provider-routes'
import { ensureMtmProviderStrategyScaling } from '@/lib/mtmcopy/copyfactory'
import type { ProviderRoute } from '@/lib/mtmcopy/signal-sources-config'
import { MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'
import { CANONICAL_TELEGRAM_CHANNELS } from '@/lib/telegram-channel-ids'

const supabase = getSupabaseAdmin()

const VALID_CHANNELS: MtmcopyTelegramChannelKey[] = ['trade-ideas', 'premium-signals']

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const config = await getSignalSourcesConfig()

  const { data: discovered } = await supabase
    .from('mtmcopy_telegram_discovered')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100)

  const channelSources = VALID_CHANNELS.map((key) => {
    const meta = TELEGRAM_SIGNAL_CHANNELS[key]
    const chatId = meta.envChatId()?.trim() ?? null
    const canonical =
      key === 'trade-ideas'
        ? CANONICAL_TELEGRAM_CHANNELS.tradeIdeas
        : CANONICAL_TELEGRAM_CHANNELS.premiumSignals
    return {
      kind: 'channel' as const,
      id: key,
      label: meta.label,
      description: meta.description,
      env_var: meta.envVar,
      chat_id: chatId,
      canonical_chat_id: canonical.chatId,
      telegram_link: canonical.link,
      telegram_username: 'username' in canonical ? canonical.username : null,
      configured: Boolean(chatId),
      enabled: config.enabled_channels.includes(key),
    }
  })

  const discoveredChannels = (discovered ?? []).map((row) => ({
    kind: 'discovered' as const,
    id: row.chat_id,
    label: row.title || row.username || row.chat_id,
    chat_id: row.chat_id,
    username: row.username,
    chat_type: row.chat_type,
    last_message_at: row.last_message_at,
    enabled: config.enabled_chat_ids.includes(row.chat_id),
  }))

  const provider_routes = normalizeProviderRoutes(config)

  return NextResponse.json({
    bot_username: MTMCOPY_BOT_USERNAME(),
    config: { ...config, provider_routes },
    default_execution: DEFAULT_PROVIDER_EXECUTION,
    sources: [...channelSources, ...discoveredChannels],
  })
}

function parseExecutionProfile(raw: unknown): ProviderExecutionProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Partial<ProviderExecutionProfile>
  if (o.lot_mode !== 'fixed' && o.lot_mode !== 'risk_percent' && o.lot_mode !== 'multiplier') {
    return undefined
  }
  return normalizeProviderExecutionProfile(o)
}

function parseChannelProviders(
  raw: unknown,
  current?: MtmcopySignalSourcesConfig['channel_providers'],
): MtmcopySignalSourcesConfig['channel_providers'] {
  if (!raw || typeof raw !== 'object') return current
  const out: NonNullable<MtmcopySignalSourcesConfig['channel_providers']> = { ...current }
  for (const key of VALID_CHANNELS) {
    const row = (raw as Record<string, unknown>)[key]
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const account_id = typeof r.account_id === 'string' ? r.account_id.trim() : ''
    if (!account_id) {
      delete out[key]
      continue
    }
    const cfg: MtmcopyChannelProviderConfig = {
      account_id,
      strategy_id: typeof r.strategy_id === 'string' ? r.strategy_id.trim() || null : null,
      tag: typeof r.tag === 'string' ? r.tag.trim() : undefined,
    }
    const execution = parseExecutionProfile(r.execution)
    if (execution) cfg.execution = execution
    out[key] = cfg
  }
  return Object.keys(out).length ? out : undefined
}

function parseProviderRoutes(raw: unknown): ProviderRoute[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const routes: ProviderRoute[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const account_id = typeof r.account_id === 'string' ? r.account_id.trim() : ''
    if (!account_id) continue
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `route-${routes.length + 1}`
    const sender_channel = r.sender_channel
    routes.push({
      id,
      label: typeof r.label === 'string' ? r.label.trim() : undefined,
      sender_channel:
        sender_channel === 'premium-signals' || sender_channel === 'trade-ideas'
          ? sender_channel
          : null,
      sender_chat_id:
        typeof r.sender_chat_id === 'string' && r.sender_chat_id.trim()
          ? r.sender_chat_id.trim()
          : null,
      account_id,
      strategy_id: typeof r.strategy_id === 'string' ? r.strategy_id.trim() || null : null,
      ai_strategy_prompt:
        typeof r.ai_strategy_prompt === 'string' ? r.ai_strategy_prompt.trim() || null : null,
      tag: typeof r.tag === 'string' ? r.tag.trim() : undefined,
      execution: parseExecutionProfile(r.execution),
      enabled: r.enabled !== false,
    })
  }
  return routes
}

export async function PUT(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const current = await getSignalSourcesConfig()

  const enabled_channels = Array.isArray(body.enabled_channels)
    ? body.enabled_channels.filter((k: string): k is MtmcopyTelegramChannelKey =>
        VALID_CHANNELS.includes(k as MtmcopyTelegramChannelKey),
      )
    : current.enabled_channels

  const chatIdSet = new Set(
    Array.isArray(body.enabled_chat_ids)
      ? body.enabled_chat_ids.map(String)
      : current.enabled_chat_ids,
  )
  const channels = enabled_channels.length ? enabled_channels : current.enabled_channels
  if (channels.includes('trade-ideas')) chatIdSet.add(CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.chatId)
  if (channels.includes('premium-signals')) {
    chatIdSet.add(CANONICAL_TELEGRAM_CHANNELS.premiumSignals.chatId)
  }

  const parsedRoutes =
    body.provider_routes !== undefined
      ? parseProviderRoutes(body.provider_routes)
      : undefined

  const provider_routes =
    parsedRoutes ??
    (body.channel_providers !== undefined
      ? undefined
      : current.provider_routes)

  const channelFromRoutes = provider_routes
    ? syncChannelProvidersFromRoutes(provider_routes)
    : undefined

  const next: MtmcopySignalSourcesConfig = {
    enabled_chat_ids: [...chatIdSet],
    enabled_channels: channels,
    provider_strategy_id:
      body.provider_strategy_id !== undefined
        ? body.provider_strategy_id || null
        : current.provider_strategy_id,
    provider_account_id:
      body.provider_account_id !== undefined
        ? body.provider_account_id || null
        : current.provider_account_id,
    provider_routes: provider_routes ?? current.provider_routes,
    channel_providers:
      channelFromRoutes ??
      (body.channel_providers !== undefined
        ? parseChannelProviders(body.channel_providers, current.channel_providers)
        : current.channel_providers),
    provider_execution:
      body.provider_execution !== undefined
        ? parseExecutionProfile(body.provider_execution) ?? current.provider_execution
        : current.provider_execution,
    provider_execution_profiles: current.provider_execution_profiles,
  }

  if (next.provider_routes?.length) {
    next.channel_providers = syncChannelProvidersFromRoutes(next.provider_routes)
    const first = next.provider_routes.find((r) => r.enabled !== false && r.strategy_id)
    if (first && !next.provider_strategy_id) {
      next.provider_strategy_id = first.strategy_id ?? null
    }
    if (first && !next.provider_account_id) {
      next.provider_account_id = first.account_id
    }
  }

  await saveSignalSourcesConfig(next)

  const routesForScaling = normalizeProviderRoutes(next)
  const scalingResults: Array<{ strategy_id: string; ok: boolean; error?: string }> = []
  for (const route of routesForScaling) {
    if (route.enabled === false || !route.strategy_id?.trim() || !route.account_id?.trim()) continue
    const scaled = await ensureMtmProviderStrategyScaling({
      strategyId: route.strategy_id.trim(),
      accountId: route.account_id.trim(),
      name: route.tag ?? route.label ?? 'MTM Provider',
      description: `MTM Auto · ${route.sender_channel ?? 'provider'}`,
    })
    scalingResults.push({
      strategy_id: route.strategy_id.trim(),
      ok: scaled.ok,
      error: scaled.error,
    })
  }

  return NextResponse.json({
    success: true,
    config: { ...next, provider_routes: normalizeProviderRoutes(next) },
    provider_scaling: scalingResults,
  })
}

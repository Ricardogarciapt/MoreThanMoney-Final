import { NextRequest, NextResponse } from 'next/server'

// Pausar/retomar uma rota re-sincroniza as subscrições CopyFactory (pode ser lento).
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
import {
  getMtmcopyBotInfo,
  getMtmcopyWebhookInfo,
  MTMCOPY_BOT_USERNAME,
  registerMtmcopyTelegramWebhook,
} from '@/lib/mtmcopy/telegram-bot'
import { CANONICAL_TELEGRAM_CHANNELS } from '@/lib/telegram-channel-ids'
import { getSiteOrigin } from '@/lib/site-url'

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

  const [bot_info, webhook] = await Promise.all([getMtmcopyBotInfo(), getMtmcopyWebhookInfo()])

  return NextResponse.json({
    bot_username: MTMCOPY_BOT_USERNAME(),
    bot_info,
    webhook,
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
    // account_id VAZIO é válido: "— (nenhuma)" — a rota existe (chat/T2T) sem conta mestre,
    // e a execução/scaling é saltada onde a conta é exigida. Antes, gravar sem conta APAGAVA a rota.
    const account_id = typeof r.account_id === 'string' ? r.account_id.trim() : ''
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
      tap_to_trade: r.tap_to_trade === true,
      // Antes não eram lidos e cada gravação do admin APAGAVA-os da config (bug).
      signal_source: r.signal_source === 'webhook' ? 'webhook' : r.signal_source === 'telegram' ? 'telegram' : undefined,
      app_channel: typeof r.app_channel === 'string' && r.app_channel.trim() ? r.app_channel.trim() : undefined,
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
    // Preserva a lista de canais T2T extra — antes era omitida e cada gravação limpava-a.
    t2t_extra_channels: current.t2t_extra_channels,
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

  // Cria/apaga os canais de chat dedicados conforme as rotas ativas (instantâneo)
  const { syncProviderRouteChannels } = await import('@/lib/mtmcopy/provider-channels-sync')
  await syncProviderRouteChannels().catch((e) =>
    console.warn('[telegram-sources] sync canais falhou:', e),
  )

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

  // Se alguma rota mudou de estado (pausar/retomar provider), re-sincroniza as
  // subscrições CopyFactory dos subscribers: a lista de estratégias é recalculada só
  // das rotas ATIVAS, por isso a estratégia da rota desativada é removida da subscrição
  // → o CopyFactory deixa de copiar NOVAS trades dessa rota (as posições abertas mantêm-se).
  let subscribersResynced = false
  try {
    const prevRoutes = normalizeProviderRoutes(current)
    // Indexa por route ID (não account_id) — rotas que partilham conta (Premium 0.01 +
    // Trade Ideas 0.02) têm de registar mudança individualmente.
    const prevEnabled = new Map(prevRoutes.map((r) => [r.id, r.enabled !== false]))
    const nowById = new Map(routesForScaling.map((r) => [r.id, r]))

    // Rotas que passaram de ATIVA → PAUSADA: pára o CopyFactory dessa estratégia JÁ
    // (autoritário, não depende do re-subscribe). Deixa posições abertas a correr.
    const { removeProviderStrategy } = await import('@/lib/mtmcopy/copyfactory')
    for (const [id, wasEnabled] of prevEnabled) {
      const nowRoute = nowById.get(id)
      const nowEnabled = nowRoute ? nowRoute.enabled !== false : false // removida = pausada
      if (wasEnabled && !nowEnabled) {
        const stratId = (nowRoute?.strategy_id ?? prevRoutes.find((r) => r.id === id)?.strategy_id ?? '').trim()
        if (stratId) {
          await removeProviderStrategy(stratId).catch((e) =>
            console.warn('[telegram-sources] removeProviderStrategy falhou:', stratId, e),
          )
        }
      }
    }

    const enabledChanged =
      prevRoutes.length !== routesForScaling.length ||
      routesForScaling.some((r) => prevEnabled.get(r.id) !== (r.enabled !== false)) ||
      prevRoutes.some((r) => !nowById.has(r.id))
    if (enabledChanged) {
      const { runMtmcopySystemSync } = await import('@/lib/mtmcopy/system-sync')
      await runMtmcopySystemSync()
      subscribersResynced = true
    }
  } catch (e) {
    console.warn('[telegram-sources] resync de subscribers falhou:', e)
  }

  return NextResponse.json({
    success: true,
    config: { ...next, provider_routes: normalizeProviderRoutes(next) },
    provider_scaling: scalingResults,
    subscribers_resynced: subscribersResynced,
  })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  if (body.action !== 'register_webhook') {
    return NextResponse.json({ ok: false, error: 'action inválida' }, { status: 400 })
  }

  const registered = await registerMtmcopyTelegramWebhook(getSiteOrigin())
  const [bot_info, webhook] = await Promise.all([getMtmcopyBotInfo(), getMtmcopyWebhookInfo()])

  return NextResponse.json({
    ok: registered.ok,
    description: registered.description,
    webhook_url: registered.webhook_url,
    bot_username: MTMCOPY_BOT_USERNAME(),
    bot_info,
    webhook,
  })
}

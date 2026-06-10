import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import {
  TELEGRAM_SIGNAL_CHANNELS,
  getSignalSourcesConfig,
  saveSignalSourcesConfig,
  type MtmcopySignalSourcesConfig,
  type MtmcopyTelegramChannelKey,
} from '@/lib/mtmcopy/signal-sources-config'
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

  return NextResponse.json({
    bot_username: MTMCOPY_BOT_USERNAME(),
    config,
    sources: [...channelSources, ...discoveredChannels],
  })
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
  }

  await saveSignalSourcesConfig(next)
  return NextResponse.json({ success: true, config: next })
}

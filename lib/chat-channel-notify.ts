import { getSiteOrigin } from '@/lib/site-url'
import {
  tapToTradeEnabledChannels,
  T2T_SIGNAL_CHANNELS,
} from '@/lib/mtmcopy/tap-to-trade-channels'

type ChatChannelNotifyOptions = {
  channelSlug: string
  title: string
  body: string
  messageId?: string
  /** Por omissão usa chat_message (categoria Chat nas preferências) */
  notificationType?: string
  excludeUserId?: string
}

/** Envia push + in-app para membros activos (respeita preferências). */
export async function notifyChatChannelMessage(
  options: ChatChannelNotifyOptions,
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> }> {
  const siteUrl = getSiteOrigin()
  let type = options.notificationType ?? 'chat_message'
  let url = `/app-mobile?tab=chat&channel=${encodeURIComponent(options.channelSlug)}`
  let tag = `chat_${options.channelSlug}`

  // Se o sinal vem de um provider ativo no Tap to Trade, a notificação leva
  // directamente ao T2T para aceitar a trade num toque.
  if (options.messageId && T2T_SIGNAL_CHANNELS.includes(options.channelSlug)) {
    const enabled = await tapToTradeEnabledChannels()
    if (enabled?.has(options.channelSlug)) {
      url = `/app-mobile?tab=tap-to-trade&signal=${encodeURIComponent(options.messageId)}`
      type = 'tap_to_trade'
      tag = `t2t_${options.channelSlug}`
    }
  }

  const res = await fetch(`${siteUrl}/api/notifications/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      all: true,
      excludeUserId: options.excludeUserId,
      title: options.title,
      body: options.body,
      url,
      data: {
        type,
        channel: options.channelSlug,
        url,
        ...(options.messageId ? { message_id: options.messageId } : {}),
      },
      tag,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

/** Canais da app-mobile que disparam push quando um membro publica. */
export const MEMBER_CHAT_PUSH_CHANNELS = ['geral', 'trading', 'cripto', 'etf-stocks'] as const

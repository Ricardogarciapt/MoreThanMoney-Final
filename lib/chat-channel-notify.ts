import { getSiteOrigin } from '@/lib/site-url'

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
  // Sinais com canal de chat abrem o CHAT (o cliente toca no botão T2T na mensagem).
  // Providers sem canal de chat enviam push próprio com url ?tab=tap-to-trade.
  const type = options.notificationType ?? 'chat_message'
  const url = `/app-mobile?tab=chat&channel=${encodeURIComponent(options.channelSlug)}`
  const tag = `chat_${options.channelSlug}`

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

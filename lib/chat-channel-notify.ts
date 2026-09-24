import { getSiteOrigin } from '@/lib/site-url'
import { tapToTradeEnabledChannels } from '@/lib/mtmcopy/tap-to-trade-channels'
import { destinoDaMensagem } from '@/lib/notificacao-destino'

type ChatChannelNotifyOptions = {
  channelSlug: string
  title: string
  body: string
  messageId?: string
  /** Texto publicado — é ele que diz se isto é uma ENTRADA (aceitar) ou não. */
  content?: string | null
  /** Por omissão usa chat_message (categoria Chat nas preferências) */
  notificationType?: string
  excludeUserId?: string
}

/** Envia push + in-app para membros activos (respeita preferências). */
export async function notifyChatChannelMessage(
  options: ChatChannelNotifyOptions,
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> }> {
  const siteUrl = getSiteOrigin()
  // Mensagens normais abrem o CHAT. Sinais abrem o separador Tap to Trade — desde 24/09 o chat
  // é só de leitura/acompanhamento, a aceitação vive lá (e na app MTM Auto).
  const type = options.notificationType ?? 'chat_message'
  const tag = `chat_${options.channelSlug}`

  /**
   * O DESTINO segue o TIPO da notificação — a regra vive em `lib/notificacao-destino`, que é a
   * mesma peça que o push do Telegram e o webhook do TradingView usam.
   */
  const destino = destinoDaMensagem({
    channelSlug: options.channelSlug,
    content: options.content,
    messageId: options.messageId,
    t2tLigado: options.messageId
      ? Boolean((await tapToTradeEnabledChannels())?.has(options.channelSlug))
      : false,
  })
  const url = destino.url
  const t2tCategory = destino.category

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
        ...(options.messageId ? { message_id: options.messageId, signal_id: options.messageId } : {}),
        ...(t2tCategory ? { category: t2tCategory } : {}),
      },
      tag,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

/** Canais da app-mobile que disparam push quando um membro publica. */
export const MEMBER_CHAT_PUSH_CHANNELS = ['geral', 'trading', 'cripto', 'etf-stocks'] as const

import { getSiteOrigin } from '@/lib/site-url'
import { tapToTradeEnabledChannels } from '@/lib/mtmcopy/tap-to-trade-channels'
import { isT2TEntrySignal } from '@/lib/mtmcopy/t2t-source'

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
   * O DESTINO segue o tipo da notificação (regra do dono, 24/09):
   *  - ENTRADA para aceitar → separador Tap to Trade, já no sinal (é lá que se aceita; desde
   *    24/09 o chat não tem botão, por isso uma entrada que aterrasse no chat ficava sem saída);
   *  - tudo o resto (abertura, acompanhamento, conversa) → o CHAT, na mensagem respectiva, que
   *    é onde vive o fio da trade.
   *
   * A categoria `T2T_SIGNAL` (que dá a ação "⚡ Aceitar trade" no iPhone e no Watch) segue a
   * mesma regra: só vai em entradas. Antes bastava o canal estar ligado ao T2T — um "TP1 hit"
   * chegava com botão de aceitar e levava ao separador errado.
   */
  const ehEntradaT2T =
    Boolean(options.messageId) &&
    isT2TEntrySignal(options.channelSlug, options.content ?? null) &&
    Boolean((await tapToTradeEnabledChannels())?.has(options.channelSlug))
  const t2tCategory = ehEntradaT2T ? 'T2T_SIGNAL' : undefined

  const url = ehEntradaT2T
    ? `/app-mobile?tab=tap-to-trade&signal=${encodeURIComponent(options.messageId as string)}`
    : `/app-mobile?tab=chat&channel=${encodeURIComponent(options.channelSlug)}` +
      (options.messageId ? `&msg=${encodeURIComponent(options.messageId)}` : '')

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

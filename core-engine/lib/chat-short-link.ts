import { getSiteOrigin } from '@/lib/site-url'

export const CHAT_SHORT_ID_LENGTH = 8

/** ID curto estável (primeiros 8 hex do UUID, sem hífens). */
export function chatMessageShortId(messageId: string): string {
  return messageId.replace(/-/g, '').slice(0, CHAT_SHORT_ID_LENGTH)
}

/** Link curto para partilhar mensagem de chat (imagem, vídeo ou link). */
export function getChatMessageShortUrl(messageId: string, origin?: string): string {
  const base = origin || getSiteOrigin()
  return `${base}/c/${chatMessageShortId(messageId)}`
}

export function extractFirstUrlFromText(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s]+)/)
  return match ? match[1] : null
}

/** URL a mostrar/partilhar — evita links longos do Supabase Storage. */
export function getChatMessageShareUrl(
  msg: {
    id?: string
    image_url?: string | null
    link_url?: string | null
    content?: string | null
  },
  origin?: string,
): string | null {
  if (msg.id && (msg.image_url || msg.link_url)) {
    return getChatMessageShortUrl(msg.id, origin)
  }
  return msg.link_url || msg.image_url || extractFirstUrlFromText(msg.content || '') || null
}

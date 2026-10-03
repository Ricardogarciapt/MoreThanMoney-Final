import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { MtmcopyChannelKey } from './channel-context'

export interface TelegramMessageWithReply {
  message_id?: number
  text?: string
  caption?: string
  reply_to_message?: {
    message_id?: number
    text?: string
    caption?: string
  }
}

const CHANNEL_APP_SLUG: Record<MtmcopyChannelKey, string | null> = {
  'premium-signals': 'premium-ideas',
  'trade-ideas': 'trade-ideas-setup',
  unknown: null,
}

export interface TelegramMessageContext {
  text: string
  parentText: string | null
  parentMessageId: number | null
  isReply: boolean
}

function parentFromWebhook(message: TelegramMessageWithReply): string | null {
  const parent = message.reply_to_message
  if (!parent) return null
  return parent.text || parent.caption || null
}

async function parentFromDatabase(
  channel: MtmcopyChannelKey,
  parentMessageId: number,
): Promise<string | null> {
  const slug = CHANNEL_APP_SLUG[channel]
  const supabase = getSupabaseAdmin()

  if (slug) {
    const { data } = await supabase
      .from('chat_messages')
      .select('content')
      .eq('channel_slug', slug)
      .eq('telegram_message_id', parentMessageId)
      .maybeSingle()

    if (data?.content) return data.content
  }

  if (channel !== 'unknown') {
    const { data: logRow } = await supabase
      .from('mtmcopy_signal_log')
      .select('raw_message')
      .eq('channel_key', channel)
      .eq('telegram_message_id', parentMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (logRow?.raw_message) return logRow.raw_message
  }

  return null
}

/** Texto do sinal original quando a mensagem é resposta no canal. */
export async function buildTelegramMessageContext(
  message: TelegramMessageWithReply,
  channel: MtmcopyChannelKey,
): Promise<TelegramMessageContext> {
  const text = (message.text || message.caption || '').trim()
  const parentId = message.reply_to_message?.message_id ?? null
  let parentText = parentFromWebhook(message)

  if (!parentText && parentId != null) {
    parentText = await parentFromDatabase(channel, parentId)
  }

  return {
    text,
    parentText: parentText?.trim() || null,
    parentMessageId: parentId,
    isReply: parentId != null,
  }
}

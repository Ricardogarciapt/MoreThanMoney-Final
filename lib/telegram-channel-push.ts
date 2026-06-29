import { getSiteOrigin } from '@/lib/site-url'
import type { AppChatChannelSlug } from '@/lib/telegram-app-channels'
import { tapToTradeEnabledChannels, T2T_SIGNAL_CHANNELS } from '@/lib/mtmcopy/tap-to-trade-channels'

const PUSH_TITLES: Record<string, string> = {
  'trade-ideas-setup': '📊 Novo Sinal Forex!',
  'premium-ideas': '💎 Nova Ideia Premium!',
}

export async function sendTelegramChannelPush(opts: {
  slug: AppChatChannelSlug | string
  content: string | null
  imageUrl?: string | null
  telegramMessageId?: number
  /** id da chat_message inserida — necessário para a ação "Tap to Trade" na notificação */
  chatMessageId?: string
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const slug = opts.slug
  const firstLine = (opts.content ?? '').split('\n')[0]?.trim() ?? ''
  const title =
    PUSH_TITLES[slug as AppChatChannelSlug] ??
    (firstLine.slice(0, 60) || 'Nova mensagem MTM')
  const body =
    (opts.content ?? '').slice(0, 120) ||
    (opts.imageUrl ? 'Nova imagem no canal' : 'Nova mensagem recebida')

  const url = `/app-mobile?tab=chat&channel=${encodeURIComponent(slug)}`
  const tag = opts.telegramMessageId
    ? `chat_${slug}_${opts.telegramMessageId}`
    : `chat_${slug}`

  // Sinal T2T de provider ATIVO no Tap to Trade → anexa ação "Tap to Trade" (botão
  // aceitar na notificação, iPhone/Watch + Android) + signal_id para abrir a confirmação.
  let t2tCategory: string | undefined
  if (opts.chatMessageId && T2T_SIGNAL_CHANNELS.includes(slug)) {
    try {
      const enabled = await tapToTradeEnabledChannels()
      if (enabled?.has(slug)) t2tCategory = 'T2T_SIGNAL'
    } catch {
      // se falhar a config, segue sem o botão (não bloqueia a notificação)
    }
  }

  try {
    const res = await fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        all: true,
        title,
        body,
        url,
        data: {
          type: slug.includes('trade') ? 'trade_ideas' : 'chat_message',
          channel: slug,
          url,
          ...(opts.chatMessageId
            ? { message_id: opts.chatMessageId, signal_id: opts.chatMessageId }
            : {}),
          ...(t2tCategory ? { category: t2tCategory } : {}),
        },
        tag,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text || res.statusText }
    }

    return { ok: true, status: res.status }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'push fetch failed',
    }
  }
}

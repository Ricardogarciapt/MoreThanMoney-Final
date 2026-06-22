import { telegramChatIdVariants } from '@/lib/mtmcopy/channels'
import {
  CANONICAL_TELEGRAM_CHANNELS,
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'

export type AppChatChannelSlug = 'trade-ideas-setup' | 'premium-ideas'

const map = new Map<string, AppChatChannelSlug>()

function registerChatId(raw: string | undefined, slug: AppChatChannelSlug) {
  if (!raw?.trim()) return
  for (const variant of telegramChatIdVariants(raw.trim())) {
    map.set(variant, slug)
  }
}

/** Reconstrói o mapa a partir das env vars + IDs canónicos. */
export function buildAppChannelMap(): Map<string, AppChatChannelSlug> {
  map.clear()

  registerChatId(resolvedTradeIdeasChatId(), 'trade-ideas-setup')
  registerChatId(resolvedPremiumSignalsChatId(), 'premium-ideas')

  return map
}

/** Detecta slug pelo título do canal Telegram quando o ID não está no mapa. */
export function detectSlugFromChannelTitle(title: string | null | undefined): AppChatChannelSlug | null {
  if (!title) return null
  const t = title.toLowerCase()
  if (t.includes('premium') || t.includes('mtmgold')) return 'premium-ideas'
  if (
    t.includes('trade') ||
    t.includes('setup') ||
    t.includes('sinais') ||
    t.includes('forex') ||
    t.includes('ideias') ||
    t.includes('ideia') ||
    t.includes('sensei') ||
    t.includes('scanner')
  ) {
    return 'trade-ideas-setup'
  }
  return null
}

export function resolveAppChannelSlug(chat: {
  id?: number
  title?: string
  username?: string
}): AppChatChannelSlug | null {
  buildAppChannelMap()

  const keys = new Set<string>()
  if (chat.id != null) telegramChatIdVariants(chat.id).forEach((k) => keys.add(k))
  if (chat.username) telegramChatIdVariants(`@${chat.username}`).forEach((k) => keys.add(k))

  for (const key of keys) {
    const slug = map.get(key)
    if (slug) return slug
  }

  if (chat.username?.toLowerCase() === CANONICAL_TELEGRAM_CHANNELS.premiumSignals.username?.toLowerCase()) {
    return 'premium-ideas'
  }

  return detectSlugFromChannelTitle(chat.title)
}

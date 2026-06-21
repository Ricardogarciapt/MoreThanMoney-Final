export type NotificationCategory =
  | 'dca'
  | 'chat'
  | 'live_sessions'
  | 'trade_ideas'
  | 'telegram_groups'

export type NotificationPreferences = Record<NotificationCategory, boolean>

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  { title: string; description: string }
> = {
  dca: {
    title: 'DCA & Portfólio',
    description: 'Alertas de preço, oportunidades DCA e publicações diárias',
  },
  chat: {
    title: 'Chat da App',
    description: 'Mensagens nos canais Geral, Trading, Cripto e ETF & Stocks',
  },
  live_sessions: {
    title: 'Sessões ao Vivo',
    description: 'Quando uma live começa na plataforma',
  },
  trade_ideas: {
    title: 'Trade Ideas',
    description: 'Novos setups e sinais de Trade Ideas',
  },
  telegram_groups: {
    title: 'Grupos Telegram',
    description: 'Premium, mentor e outros canais espelhados do Telegram',
  },
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  dca: true,
  chat: true,
  live_sessions: true,
  trade_ideas: true,
  telegram_groups: true,
}

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  const base = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as NotificationCategory[]) {
    if (typeof input[key] === 'boolean') base[key] = input[key]
  }
  return base
}

const TRADE_IDEAS_CHANNELS = new Set([
  'trade_ideas',
  'trade-ideas',
  'trade-ideas-setup',
  'tradeideas',
])

const TELEGRAM_GROUP_CHANNELS = new Set([
  'premium',
  'premium-ideas',
  'premium-signals',
  'mentor',
  'telegram',
  'telegram_forward',
])

const APP_CHAT_CHANNELS = new Set([
  'geral',
  'trading',
  'cripto',
  'etf-stocks',
  'general',
  'crypto',
])

export function resolveNotificationCategory(
  type: string | undefined,
  data?: Record<string, string | undefined> | null,
): NotificationCategory | null {
  const channel = String(data?.channel ?? data?.channel_slug ?? '').toLowerCase()

  if (type === 'live_session') return 'live_sessions'
  if (type === 'dca_daily' || type === 'dca_opportunity' || type === 'price_alert') return 'dca'
  if (type === 'telegram_forward' || type === 'telegram_signal') return 'telegram_groups'
  if (type === 'trade_ideas' || type === 'mtmcopy_signal') return 'trade_ideas'
  if (type === 'social_interaction' || type === 'social_mention') return null

  if (type === 'chat_message' || type === 'social_post') {
    if (TRADE_IDEAS_CHANNELS.has(channel)) return 'trade_ideas'
    if (TELEGRAM_GROUP_CHANNELS.has(channel)) return 'telegram_groups'
    if (APP_CHAT_CHANNELS.has(channel) || !channel) return 'chat'
    if (channel.includes('trade')) return 'trade_ideas'
    if (channel.includes('premium') || channel.includes('telegram')) return 'telegram_groups'
    return 'chat'
  }

  return null
}

export function isCategoryEnabled(
  preferences: NotificationPreferences,
  category: NotificationCategory | null,
): boolean {
  if (!category) return true
  return preferences[category] !== false
}

export type NotificationCategory =
  | 'dca'
  | 'chat'
  | 'live_sessions'
  | 'trade_ideas'
  | 'telegram_groups'
  | 'tap_to_trade'
  | 'primeverse'

/**
 * As categorias filtram o QUE chega. `sound_enabled` não é uma categoria: não filtra nada,
 * decide só se o push toca. Vivia apenas no cliente — o servidor descartava-o e mandava
 * sempre `sound: 'default'`, portanto o toggle mentia a quem o desligava.
 */
export type NotificationPreferences = Record<NotificationCategory, boolean> & {
  sound_enabled: boolean
}

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
  tap_to_trade: {
    title: 'T2T · Tap to Trade',
    description: 'Sinais prontos a abrir num toque — toca para aceitar a trade',
  },
  primeverse: {
    title: 'PrimeVerse Hub',
    description: 'Notificações do hub.primeverse.ca dentro da app MTM',
  },
}

/**
 * Por omissão: SÓ O QUE O CLIENTE SEGUE.
 *
 * O padrão era tudo ligado. Em sete dias isso deu 135 mil notificações para ~130 pessoas —
 * 86 por dia, cada — com 0,15% de leitura. Quem recebe 86 avisos por dia desliga a app inteira
 * e depois já não recebe o que interessava.
 *
 * Ficam ligadas as que o cliente PEDIU ao entrar: os sinais que pode negociar (tap_to_trade),
 * as sessões ao vivo (acontecem duas vezes por semana e são o produto) e o DCA (uma por dia).
 * O ruído de fundo — cada mensagem de cada canal, cada follow-up de cada setup — passa a ser
 * OPT-IN: liga-se nas Definições, categoria a categoria.
 *
 * Quem já tinha escolhas guardadas mantém-nas: `normalizeNotificationPreferences` só usa este
 * padrão para as categorias que o cliente nunca tocou.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  tap_to_trade: true,   // sinais que ele pode aceitar num toque — é o produto
  live_sessions: true,  // duas por semana, e é para estar lá
  dca: true,            // uma por dia, no máximo
  trade_ideas: false,   // dezenas por dia entre setups e gestão → opt-in
  telegram_groups: false, // Premium e restantes canais espelhados → opt-in
  chat: false,          // conversa dos canais → opt-in
  primeverse: false,    // opt-in — o cliente liga se quiser o PrimeVerse Hub
  sound_enabled: true,  // não é categoria: só decide se o alerta toca
}

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  const base = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as (keyof NotificationPreferences)[]) {
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

  if (type === 'primeverse' || type === 'primeverse_hub' || channel.includes('primeverse')) return 'primeverse'
  if (type === 'tap_to_trade' || type === 'tap_to_trade_signal') return 'tap_to_trade'
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

/** Som do push. Só isto: o alerta chega na mesma, em silêncio. */
export function isSoundEnabled(preferences: NotificationPreferences): boolean {
  return preferences.sound_enabled !== false
}

/**
 * Canais de chat padrão — alinhados com app-mobile (CHANNEL_META + chat_channels).
 */

export interface DefaultChatChannel {
  slug: string
  name: string
  description: string
  parent_slug: string | null
  position: number
}

/** Estrutura oficial usada em /app-mobile → tab Chat */
export const DEFAULT_CHAT_CHANNELS: DefaultChatChannel[] = [
  {
    slug: 'comunidade',
    name: 'Comunidade',
    description: 'Discussão e networking MoreThanMoney',
    parent_slug: null,
    position: 0,
  },
  {
    slug: 'geral',
    name: 'Geral',
    description: 'Apresentações, dúvidas e conversas abertas',
    parent_slug: 'comunidade',
    position: 1,
  },
  {
    slug: 'trading',
    name: 'Trading',
    description: 'Setups, estratégias e mercados',
    parent_slug: 'comunidade',
    position: 2,
  },
  {
    slug: 'cripto',
    name: 'Cripto',
    description: 'Portfólio crypto e mercado digital',
    parent_slug: 'comunidade',
    position: 3,
  },
  {
    slug: 'etf-stocks',
    name: 'ETF & Stocks',
    description: 'Análise DCA diária do portfólio ETF e ações',
    parent_slug: 'comunidade',
    position: 4,
  },
  {
    slug: 'sinais',
    name: 'Sinais & Ideias',
    description: 'Ideias oficiais MTM e espelho Telegram',
    parent_slug: null,
    position: 10,
  },
  {
    slug: 'trade-ideas',
    name: 'Ideias Forex',
    description: 'Ideias da comunidade — requer UID TMGM',
    parent_slug: 'sinais',
    position: 11,
  },
  {
    slug: 'trade-ideas-setup',
    name: 'Telegram · Sensei Scanner',
    description: 'Sinais MTM Auto / Sensei Scanner (espelhados do Telegram)',
    parent_slug: 'sinais',
    position: 12,
  },
  {
    slug: 'premium-ideas',
    name: 'Premium · Ouro',
    description: 'Sinais premium XAUUSD — Pack Premium / IQONIC',
    parent_slug: 'sinais',
    position: 13,
  },
  {
    slug: 'sensei-scanner',
    name: 'Sensei Scanner',
    description: 'Sinais automáticos do scanner Sensei (TradingView + validação IA)',
    parent_slug: 'sinais',
    position: 14,
  },
]

export function getDefaultChannelSlugs(): string[] {
  return DEFAULT_CHAT_CHANNELS.map((c) => c.slug)
}

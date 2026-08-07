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
    slug: 'social-ugc',
    name: 'Social Média & UGC',
    description: 'Conteúdo social, criadores e user-generated content',
    parent_slug: 'comunidade',
    position: 5,
  },
  {
    slug: 'ia',
    name: 'IA',
    description: 'Inteligência artificial, ferramentas e automação',
    parent_slug: 'comunidade',
    position: 6,
  },
  {
    slug: 'fitness',
    name: 'Fitness',
    description: 'Saúde, treino e performance física',
    parent_slug: 'comunidade',
    position: 7,
  },
  {
    slug: 'mindset',
    name: 'MindSet',
    description: 'Mentalidade, hábitos e desenvolvimento pessoal',
    parent_slug: 'comunidade',
    position: 8,
  },
  {
    slug: 'lideranca',
    name: 'Liderança',
    description: 'Liderança, equipas e crescimento profissional',
    parent_slug: 'comunidade',
    position: 9,
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
    name: 'Ideias de Índices',
    description: 'Sinais de índices (webhook TradingView) — tap-to-trade',
    parent_slug: 'sinais',
    position: 11,
  },
  {
    slug: 'trade-ideas-setup',
    name: 'Ideias de Forex',
    description: 'Sinais de forex (webhook TradingView) — tap-to-trade / MTM Auto Forex',
    parent_slug: 'sinais',
    position: 12,
  },
  {
    slug: 'ideias-e-sinais',
    name: 'Ideias e Sinais',
    description: 'Sinais swing de forex (MTM Auto FOREX Swings) — set & forget, tap-to-trade',
    parent_slug: 'sinais',
    position: 13,
  },
  {
    slug: 'premium-ideas',
    name: 'Premium · Ouro',
    description: 'Sinais premium XAUUSD — Pack Premium',
    parent_slug: 'sinais',
    position: 13,
  },
  {
    slug: 'sensei-scanner',
    name: 'Sinais Scanner Sensei',
    description: 'Sinais automáticos Ouro/BTC do scanner Sensei (TradingView + validação IA)',
    parent_slug: 'sinais',
    position: 14,
  },
  {
    slug: 'cripto-perps',
    name: 'Ideias de Perpetuos Cripto',
    description: 'Sinais de perpétuos cripto (webhook TradingView)',
    parent_slug: 'sinais',
    position: 15,
  },
  {
    slug: 'sinais-goldkiller',
    name: 'Sinais Scanner Gold Killer',
    description: 'Sinais automáticos do scanner GoldKiller (XAUUSD) — tap-to-trade',
    parent_slug: 'sinais',
    position: 16,
  },
  {
    slug: 'sinais-scanner-mtm',
    name: 'Sinais Primeverse',
    description: 'Sinais PrimeVerse (Forex) — tap-to-trade',
    parent_slug: 'sinais',
    position: 17,
  },
]

export function getDefaultChannelSlugs(): string[] {
  return DEFAULT_CHAT_CHANNELS.map((c) => c.slug)
}

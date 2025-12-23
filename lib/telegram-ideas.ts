// Estrutura para ideias vindas do Telegram
export interface TelegramIdea {
  id: string
  content: string
  author: string
  timestamp: string
  type: "signal" | "analysis" | "market_update"
  symbol?: string
  direction?: "buy" | "sell"
  category: "forex" | "crypto" | "commodities"
}

// Simulação de ideias lidas do canal Telegram VIP
export const telegramIdeas: TelegramIdea[] = [
  {
    id: "tg_001",
    content: "🚀 XAUUSD - Sinal de Compra\n📊 Entrada: 2024.50\n🎯 TP1: 2028.00\n🎯 TP2: 2032.50\n🛑 SL: 2020.00",
    author: "MTM Analyst",
    timestamp: "2025-01-27T10:30:00Z",
    type: "signal",
    symbol: "XAUUSD",
    direction: "buy",
    category: "commodities",
  },
  {
    id: "tg_002",
    content:
      "📈 EUR/USD - Análise Técnica\n\nO par encontra-se em zona de suporte importante. RSI mostrando divergência positiva.",
    author: "MTM Expert",
    timestamp: "2025-01-27T09:15:00Z",
    type: "analysis",
    symbol: "EURUSD",
    category: "forex",
  },
  {
    id: "tg_003",
    content: "📰 Market Update\n\nFED mantém taxa de juros. Impacto esperado no USD nas próximas horas.",
    author: "MTM News",
    timestamp: "2025-01-27T08:45:00Z",
    type: "market_update",
    category: "forex",
  },
  {
    id: "tg_004",
    content: "⚡ BTC/USD - Análise\n\nBitcoin testando resistência em $68,500. Volume aumentando.",
    author: "MTM Crypto",
    timestamp: "2025-01-27T07:20:00Z",
    type: "analysis",
    symbol: "BTCUSD",
    category: "crypto",
  },
]

// Função para obter ideias por categoria
export function getIdeasByCategory(category?: string): TelegramIdea[] {
  if (!category || category === "all") {
    return telegramIdeas
  }
  return telegramIdeas.filter((idea) => idea.category === category)
}

// Função para obter ideias por tipo
export function getIdeasByType(type?: string): TelegramIdea[] {
  if (!type || type === "all") {
    return telegramIdeas
  }
  return telegramIdeas.filter((idea) => idea.type === type)
}

// Função para obter ideias recentes (últimas 3)
export function getRecentIdeas(limit = 3): TelegramIdea[] {
  return telegramIdeas.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit)
}

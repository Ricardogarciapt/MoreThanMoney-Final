/** Metadados visuais e regras dos canais MTM (sem colunas extra na DB). */

export type ChannelMeta = {
  emoji: string
  accent: string
  tag?: string
  rules: string[]
  tips?: string[]
}

export const CHANNEL_META: Record<string, ChannelMeta> = {
  geral: {
    emoji: "💬",
    accent: "#38BDF8",
    tag: "Aberto",
    rules: [
      "Todos os membros activos podem ler e publicar",
      "Mantém o tom respeitoso e focado em trading/educação",
      "Sem spam, links suspeitos ou promoção não autorizada",
    ],
    tips: ["Apresenta-te quando entrares pela primeira vez"],
  },
  trading: {
    emoji: "📈",
    accent: "#D2A63C",
    tag: "Comunidade",
    rules: [
      "Publicar: membros com 3+ meses OU Pack Premium/IQ",
      "Partilha setups com contexto (par, timeframe, racional)",
      "Não é consultoria — decisão final é sempre tua",
    ],
    tips: ["Usa @nome para mencionar alguém", "Responde com swipe para a direita"],
  },
  "trade-ideas": {
    emoji: "📊",
    accent: "#60A5FA",
    tag: "Ideias",
    rules: [
      "Canal de leitura com ideias da comunidade",
      "Requer UID TMGM registado no perfil",
    ],
  },
  "trade-ideas-setup": {
    emoji: "📡",
    accent: "#26A5E4",
    tag: "Sensei",
    rules: [
      "Sinais MTM Auto · Sensei Scanner (espelhados do Telegram)",
      "Só leitura — não podes publicar aqui",
      "Activa push para não perder entradas",
    ],
    tips: ["As mensagens chegam automaticamente da equipa / scanner"],
  },
  "premium-ideas": {
    emoji: "💎",
    accent: "#A78BFA",
    tag: "Premium",
    rules: [
      "Exclusivo Pack Premium, IQONIC ou VIP",
      "Ideias premium da equipa (Telegram)",
      "Só leitura",
    ],
  },
  "sensei-scanner": {
    emoji: "🧠",
    accent: "#22D3EE",
    tag: "IA",
    rules: [
      "Sinais automáticos do scanner Sensei (TradingView)",
      "Validados e geridos por IA antes de publicar",
      "Só leitura — as entradas chegam automaticamente",
    ],
    tips: ["Ativa push para não perder entradas"],
  },
  cripto: {
    emoji: "₿",
    accent: "#F59E0B",
    tag: "VIP",
    rules: [
      "Discussão de cripto e portfólio",
      "Publicar: VIP, IQ ou Admin",
      "Todos os membros podem ler",
      "Análise DCA Inteligente publicada diariamente pelo sistema MTM",
    ],
    tips: ["Recebes notificação push em mensagens novas"],
  },
  "etf-stocks": {
    emoji: "📈",
    accent: "#6366F1",
    tag: "Portfólio",
    rules: [
      "ETFs e stocks do portfólio MTM (horizonte 5 anos)",
      "Análise DCA Inteligente publicada diariamente pelo sistema MTM",
      "Publicar: VIP, IQ ou Admin · todos podem ler",
    ],
    tips: ["Consulta /portfolios → Análise DCA para ver o painel completo"],
  },
}

export function getChannelMeta(slug: string): ChannelMeta {
  return (
    CHANNEL_META[slug] ?? {
      emoji: "#",
      accent: "#9CA3AF",
      rules: ["Canal da comunidade MoreThanMoney"],
    }
  )
}

export function formatPreviewText(
  content: string | null,
  imageUrl: string | null,
  telegramSender: string | null,
  messageType: string
): string {
  if (messageType === "telegram_forward" && telegramSender) {
    const body = content?.trim() || "Nova mensagem"
    return `${telegramSender}: ${body}`
  }
  if (imageUrl && !content?.trim()) return "📷 Imagem"
  if (content?.trim()) return content.trim()
  return "Nova mensagem"
}

export function getLastReadKey(slug: string) {
  return `mtm_chat_last_read_${slug}`
}

export function markChannelRead(slug: string) {
  try {
    localStorage.setItem(getLastReadKey(slug), new Date().toISOString())
  } catch {}
}

export function isChannelUnread(slug: string, lastMessageAt: string | null): boolean {
  if (!lastMessageAt) return false
  try {
    const readAt = localStorage.getItem(getLastReadKey(slug))
    if (!readAt) return true
    return new Date(lastMessageAt) > new Date(readAt)
  } catch {
    return false
  }
}

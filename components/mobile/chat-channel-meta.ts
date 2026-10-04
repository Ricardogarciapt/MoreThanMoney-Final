/** Metadados visuais e regras dos canais MTM (sem colunas extra na DB). */

export type ChannelMeta = {
  emoji: string
  accent: string
  tag?: string
  rules: string[]
  tips?: string[]
}

export const CHANNEL_META: Record<string, ChannelMeta> = {
  // `ideias-e-sinais` («Ideias e Sinais» / Forex Swings) FECHOU a 04/10/2026 por decisão do dono:
  // o canal está `hidden=true` na BD e já não se desenha na app. A entrada saiu daqui para o
  // ecrã não ter metadados de um canal que não existe para o cliente.
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
    tag: "Aberto",
    rules: [
      "Aberto a todos os membros ativos (ler e publicar)",
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
      "Requer UID VT Markets registado no perfil",
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
      "Exclusivo Pack Premium ou VIP",
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
  "sinais-goldkiller": {
    emoji: "🥇",
    accent: "#D2A63C",
    tag: "GoldKiller",
    rules: [
      "Sinais automáticos do scanner GoldKiller (XAUUSD)",
      "Só leitura — as entradas chegam automaticamente",
      "Aceitar: no separador Tap to Trade (aqui é só leitura)",
    ],
    tips: ["Ativa push para não perder entradas"],
  },
  "sinais-scanner-mtm": {
    emoji: "🏆",
    accent: "#F59E0B",
    tag: "Edge",
    rules: [
      "Estratégia MTM Auto Edge (fxEdge)",
      "Só leitura — os sinais chegam automaticamente",
      "Aceitar: no separador Tap to Trade (aqui é só leitura)",
    ],
    tips: ["Os seguimentos (TP, break-even, fecho) respondem ao sinal original"],
  },
  // O slug `aurum-flow` mantém-se; o canal é o «Ideias de Cripto» e é SÓ cripto (o ouro saiu).
  "aurum-flow": {
    emoji: "₿",
    accent: "#F59E0B",
    tag: "Cripto",
    rules: [
      "Sinais de perpétuos cripto (Aurum Flow ORB)",
      "Só leitura — os sinais chegam automaticamente",
      "Perpétuos: seguir/copiar no separador Tap to Trade",
    ],
  },
  cripto: {
    emoji: "₿",
    accent: "#F59E0B",
    tag: "Aberto",
    rules: [
      "Aberto a todos os membros ativos (ler e publicar)",
      "Discussão de cripto e portfólio",
      "Análise DCA Inteligente publicada diariamente pelo sistema MTM",
    ],
    tips: ["Recebes notificação push em mensagens novas"],
  },
  "etf-stocks": {
    emoji: "📈",
    accent: "#6366F1",
    tag: "Aberto",
    rules: [
      "Aberto a todos os membros ativos (ler e publicar)",
      "ETFs e stocks do portfólio MTM (horizonte 5 anos)",
      "Análise DCA Inteligente publicada diariamente pelo sistema MTM",
    ],
    tips: ["Consulta /portfolios → Análise DCA para ver o painel completo"],
  },
  "social-ugc": {
    emoji: "🎬",
    accent: "#EC4899",
    tag: "Aberto",
    rules: ["Aberto a todos os membros ativos", "Conteúdo social, criadores e UGC", "Sem spam ou autopromoção abusiva"],
  },
  ia: {
    emoji: "🤖",
    accent: "#22D3EE",
    tag: "Aberto",
    rules: ["Aberto a todos os membros ativos", "Ferramentas de IA, prompts e automação"],
  },
  fitness: {
    emoji: "💪",
    accent: "#34D399",
    tag: "Aberto",
    rules: ["Aberto a todos os membros ativos", "Saúde, treino e performance física"],
  },
  mindset: {
    emoji: "🧠",
    accent: "#A78BFA",
    tag: "Aberto",
    rules: ["Aberto a todos os membros ativos", "Mentalidade, hábitos e desenvolvimento pessoal"],
  },
  lideranca: {
    emoji: "🚀",
    accent: "#F59E0B",
    tag: "Aberto",
    rules: ["Aberto a todos os membros ativos", "Liderança, equipas e crescimento profissional"],
  },
}

/**
 * O visual de um canal como o ADMIN o configurou (colunas `icone`/`cor`/`etiqueta`/`regras` de
 * `chat_channels`, migração 117). O que estiver vazio cai no CHANNEL_META de sempre.
 */
export function metaDoCanal(canal: {
  slug: string
  icone?: string | null
  cor?: string | null
  etiqueta?: string | null
  regras?: string[] | null
}): ChannelMeta {
  const base = getChannelMeta(canal.slug)
  const cor = typeof canal.cor === "string" && /^#[0-9A-Fa-f]{6}$/.test(canal.cor.trim()) ? canal.cor.trim() : null
  const regras = Array.isArray(canal.regras) ? canal.regras.map((r) => String(r).trim()).filter(Boolean) : []
  return {
    ...base,
    emoji: canal.icone?.trim() || base.emoji,
    accent: cor ?? base.accent,
    tag: canal.etiqueta?.trim() || base.tag,
    rules: regras.length ? regras : base.rules,
  }
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

/**
 * Limpa o conteúdo para a pré-visualização de UMA linha na lista de canais:
 * remove sintaxe Markdown (tabelas `|---|`, **negrito**, _itálico_, `código`, títulos,
 * links) e colapsa todo o espaço em branco (\n, \t, espaços múltiplos) num só espaço.
 * Sem isto, posts com tabelas Markdown (ex.: DCA) apareciam esticados/partidos.
 */
export function sanitizePreviewText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ") // blocos de código
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, " ") // linhas separadoras de tabela |---|---|
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [texto](url) → texto
    .replace(/[|*_`#>~]+/g, " ") // marcadores markdown + pipes de tabela
    .replace(/\s+/g, " ") // colapsar todo o whitespace
    .trim()
}

/** O corpo já começa pelo nome do remetente? (evita prefixo redundante) */
function bodyRepeatsSender(body: string, sender: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim()
  const b = norm(body)
  const s = norm(sender)
  return s.length >= 4 && b.startsWith(s.slice(0, Math.min(s.length, 24)))
}

export function formatPreviewText(
  content: string | null,
  imageUrl: string | null,
  telegramSender: string | null,
  messageType: string
): string {
  const clean = content ? sanitizePreviewText(content) : ""
  if (messageType === "telegram_forward" && telegramSender) {
    const body = clean || "Nova mensagem"
    // Não repetir o nome do remetente quando o próprio corpo já começa por ele.
    if (bodyRepeatsSender(body, telegramSender)) return body
    return `${telegramSender}: ${body}`
  }
  if (imageUrl && !clean) return "📷 Imagem"
  if (clean) return clean
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

import { telegramChatIdVariants } from '@/lib/mtmcopy/channels'
import {
  CANONICAL_TELEGRAM_CHANNELS,
  resolvedForexIdeasChatId,
  resolvedGoldkillerScannerChatId,
  resolvedPerpsChatId,
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'

export type AppChatChannelSlug =
  | 'trade-ideas-setup'
  | 'premium-ideas'
  | 'sensei-scanner'
  | 'sinais-goldkiller'
  | 'sinais-scanner-mtm'
  | 'cripto-perps'
  | 'golden-moves'

const map = new Map<string, AppChatChannelSlug>()

function registerChatId(raw: string | undefined, slug: AppChatChannelSlug) {
  if (!raw?.trim()) return
  for (const variant of telegramChatIdVariants(raw.trim())) {
    map.set(variant, slug)
  }
}

/**
 * Reconstrói o mapa id→chat da app a partir dos IDs canónicos.
 * Cada scanner tem o SEU chat dedicado (pedido do Ricardo):
 *  - Sensei (grupo -1003853860780)      → sensei-scanner    ("Sinais Scanner Sensei")
 *  - Forex  (grupo -1003716578747)      → trade-ideas-setup ("Ideias de Forex")
 *  - GoldKiller (grupo -5454326270)     → sinais-goldkiller ("Sinais Scanner Gold Killer")
 *  - Premium (@MTMgold)                 → premium-ideas
 */
export function buildAppChannelMap(): Map<string, AppChatChannelSlug> {
  map.clear()

  // O canónico "tradeIdeas" é o grupo Sensei Scanner → chat sensei-scanner.
  registerChatId(resolvedTradeIdeasChatId(), 'sensei-scanner')
  registerChatId(resolvedForexIdeasChatId(), 'trade-ideas-setup')
  registerChatId(resolvedGoldkillerScannerChatId(), 'sinais-goldkiller')
  registerChatId(resolvedPremiumSignalsChatId(), 'premium-ideas')
  // Grupo dos Perpétuos (reaproveitado). Mapeia por ID → cripto-perps, ANTES do título (o título
  // "Ideias de Perpétuos Cripto" senão cairia no fallback 'ideias'→Forex). Evita a notif trocada.
  registerChatId(resolvedPerpsChatId() ?? undefined, 'cripto-perps')
  // Fontes novas (2026-08-24): cada canal tem chat próprio na app e Tap to Trade.
  registerChatId(process.env.TELEGRAM_GOLDEN_MOVES_CHAT || '-1004343748070', 'golden-moves')

  return map
}

/** Detecta slug pelo título do canal Telegram quando o ID não está no mapa. */
export function detectSlugFromChannelTitle(title: string | null | undefined): AppChatChannelSlug | null {
  if (!title) return null
  const t = title.toLowerCase()
  if (t.includes('premium') || t.includes('mtmgold')) return 'premium-ideas'
  // Perpétuos ANTES do fallback genérico 'ideias'/'scanner' (o título "Ideias de Perpétuos Cripto"
  // senão cairia em Forex). Cobre perp/perpétuo/perpetuo.
  if (t.includes('perp')) return 'cripto-perps'
  // Gold Did e Golden Moves ANTES do 'gold' genérico do GoldKiller.
  if (t.includes('golden moves') || t.includes('goldenmoves')) return 'golden-moves'
  // GoldKiller ANTES de "scanner" genérico (o título GoldKiller também contém "scanner").
  if (t.includes('goldkiller') || t.includes('gold killer') || t.includes('gold-killer')) return 'sinais-goldkiller'
  if (t.includes('sensei')) return 'sensei-scanner'
  if (t.includes('forex')) return 'trade-ideas-setup'
  // "MTM Scanner" dedicado.
  if (t.includes('mtm scanner') || t.includes('scanner mtm')) return 'sinais-scanner-mtm'
  if (t.includes('setup') || t.includes('ideias')) return 'trade-ideas-setup'
  // "scanner" genérico remanescente → trade-ideas-setup (Forex/setup).
  if (t.includes('scanner') || t.includes('sinais')) return 'trade-ideas-setup'
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

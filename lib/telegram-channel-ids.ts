import { telegramChatIdVariants } from '@/lib/mtmcopy/channels'

/** IDs confirmados (bot + app-mobile) — Jun 2026 */
export const CANONICAL_TELEGRAM_CHANNELS = {
  tradeIdeas: {
    chatId: '-1003853860780',
    title: 'MoreThanMoney Sensei Scanner',
    link: 'https://t.me/+EGUwl8eXJpQ4NTZk',
    mtmcopyKey: 'trade-ideas' as const,
    appSlug: 'trade-ideas-setup' as const,
    envVars: [
      'TELEGRAM_CHANNEL_TRADE_IDEAS',
      'TELEGRAM_TRADE_IDEAS_CHAT_ID',
      'TELEGRAM_CHANNEL_ID',
      'TRADINGVIEW_RELAY_CHAT_ID',
    ],
  },
  premiumSignals: {
    chatId: '-1002424441843',
    username: 'MTMgold',
    title: 'MoreThanMoney Premium Signals',
    link: 'https://t.me/MTMgold',
    mtmcopyKey: 'premium-signals' as const,
    appSlug: 'premium-ideas' as const,
    envVars: ['TELEGRAM_CHANNEL_PREMIUM_SIGNALS', 'TELEGRAM_PREMIUM_IDEAS_CHAT_ID'],
  },
}

/** Normaliza ID de env (corrige -3716578747 → -1003716578747, remove \\n). */
export function normalizeEnvChatId(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/\\n/g, '')
  if (!trimmed) return null
  if (trimmed.startsWith('@')) return trimmed.toLowerCase()

  const negative = trimmed.startsWith('-')
  const digits = trimmed.replace(/^-/, '')

  if (trimmed.startsWith('-100') && /^\d+$/.test(trimmed.slice(4))) {
    return trimmed
  }
  if (/^\d{9,}$/.test(digits)) {
    return `-100${digits}`
  }
  if (negative && /^\d+$/.test(digits)) {
    return `-${digits}`
  }
  return trimmed
}

function readEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const v = process.env[key]
    if (v?.trim()) return v
  }
  return undefined
}

export function resolvedTradeIdeasChatId(): string {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.envVars)) ??
    CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.chatId
  )
}

export function resolvedPremiumSignalsChatId(): string {
  return (
    normalizeEnvChatId(readEnv(CANONICAL_TELEGRAM_CHANNELS.premiumSignals.envVars)) ??
    CANONICAL_TELEGRAM_CHANNELS.premiumSignals.chatId
  )
}

/** Todas as variantes de ID para matching robusto. */
export function allChatIdVariants(ids: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    const norm = normalizeEnvChatId(id)
    if (!norm) continue
    telegramChatIdVariants(norm).forEach((v) => out.add(v))
    if (norm.startsWith('@')) out.add(norm)
  }
  return out
}

export function registerCanonicalChatIds(target: Map<string, string>, slug: string) {
  const trade = resolvedTradeIdeasChatId()
  const premium = resolvedPremiumSignalsChatId()

  if (slug === CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.appSlug) {
    allChatIdVariants([trade, CANONICAL_TELEGRAM_CHANNELS.tradeIdeas.chatId]).forEach((id) =>
      target.set(id, slug),
    )
  }
  if (slug === CANONICAL_TELEGRAM_CHANNELS.premiumSignals.appSlug) {
    allChatIdVariants([premium, CANONICAL_TELEGRAM_CHANNELS.premiumSignals.chatId]).forEach((id) =>
      target.set(id, slug),
    )
  }
}

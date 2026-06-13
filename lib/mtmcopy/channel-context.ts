import { chatIdsMatch } from './channels'
import { resolvedPremiumSignalsChatId, resolvedTradeIdeasChatId } from '@/lib/telegram-channel-ids'

export type MtmcopyChannelKey = 'trade-ideas' | 'premium-signals' | 'unknown'

/** Identifica o canal MTM oficial a partir do update Telegram. */
export function resolveChannelFromChat(chat: { id?: number; username?: string }): MtmcopyChannelKey {
  const premium = resolvedPremiumSignalsChatId()
  const trade = resolvedTradeIdeasChatId()

  if (chat.id != null) {
    if (chatIdsMatch(String(chat.id), premium)) return 'premium-signals'
    if (chatIdsMatch(String(chat.id), trade)) return 'trade-ideas'
  }

  const user = chat.username?.toLowerCase().replace(/^@/, '')
  if (user === 'mtmgold') return 'premium-signals'

  return 'unknown'
}

/** Mensagens de estado que não devem abrir trades nem alterar posições. */
export function shouldIgnoreChannelMessage(text: string): boolean {
  if (!text?.trim()) return true
  const t = text.trim()
  // Aviso Premium ~1–2 min antes do sinal completo (só «NEW POSITION», sem SL/TP)
  if (/^\s*new\s+position\s*[!.\s]*$/i.test(t)) return true
  if (/^\s*nova\s+posi[cç][aã]o\s*[!.\s]*$/i.test(t)) return true
  if (/\bclose\s+half\b/i.test(text) && !/\btrade\s+active\s+and\s+running\b/i.test(text)) return true
  if (/\b(?:enjoy|consistency|discipline)\b/i.test(text) && /\bpips?\s*✅/i.test(text)) return true
  if (/\bmoney\s+management\s+is\b/i.test(text) && !/\b(?:sl|tp|buy|sell)\b/i.test(text)) return true
  return false
}

/** Premium: apenas HIT TP1/2/3 são gestão activa (com ou sem ✅). */
export function isPremiumTpHitMessage(text: string): boolean {
  return /\bhit\s+tp[123]\b/i.test(text)
}

export function isPremiumTp1HitConfirmed(text: string): boolean {
  return /\bhit\s+tp1\b/i.test(text)
}

import { chatIdsMatch } from './channels'

export type MtmcopyChannelKey = 'trade-ideas' | 'premium-signals' | 'unknown'

const PREMIUM_CHAT_ID = process.env.TELEGRAM_CHANNEL_PREMIUM_SIGNALS ?? '-1002424441843'
const TRADE_CHAT_ID = process.env.TELEGRAM_CHANNEL_TRADE_IDEAS ?? '-1003716578747'

export function resolveChannelFromChat(chat: { id?: number; username?: string }): MtmcopyChannelKey {
  if (chat.id != null) {
    if (chatIdsMatch(String(chat.id), PREMIUM_CHAT_ID)) return 'premium-signals'
    if (chatIdsMatch(String(chat.id), TRADE_CHAT_ID)) return 'trade-ideas'
  }
  const user = chat.username?.toLowerCase().replace(/^@/, '')
  if (user === 'mtmgold') return 'premium-signals'
  return 'unknown'
}

export function shouldIgnoreChannelMessage(text: string): boolean {
  if (!text?.trim()) return true
  if (/\bclose\s+half\b/i.test(text)) return true
  if (/\btrade\s+active\s+and\s+running\b/i.test(text)) return true
  return false
}

export function isPremiumTpHitMessage(text: string): boolean {
  return /\bhit\s+tp[123]\b/i.test(text)
}

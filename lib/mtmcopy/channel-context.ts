import { chatIdsMatch } from './channels'
import {
  resolvedForexIdeasChatId,
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'

export type MtmcopyChannelKey = 'trade-ideas' | 'premium-signals' | 'unknown'

/** Identifica o canal MTM oficial a partir do update Telegram. */
export function resolveChannelFromChat(chat: { id?: number; username?: string }): MtmcopyChannelKey {
  const premium = resolvedPremiumSignalsChatId()
  const trade = resolvedTradeIdeasChatId()
  const forex = resolvedForexIdeasChatId()

  if (chat.id != null) {
    if (chatIdsMatch(String(chat.id), premium)) return 'premium-signals'
    if (chatIdsMatch(String(chat.id), trade)) return 'trade-ideas'
    // Canal Forex dedicado → mesma estratégia trade-ideas (MTM Auto Forex).
    if (chatIdsMatch(String(chat.id), forex)) return 'trade-ideas'
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

/**
 * HIT TP1 + «Close all now» → fechar a maioria da posição em lucro.
 * Ex.: «HIT TP1 ✅ Close all now. If hold set BE. Hold risk with Breakeven(BE)»
 */
export function isPremiumTp1CloseAllNowMessage(text: string): boolean {
  if (!isPremiumTp1HitConfirmed(text)) return false
  if (!/\bclose\s+all\s+now\b/i.test(text)) return false
  return true
}

/**
 * «If hold set BE» / «Hold risk with Breakeven(BE)» → ao segurar a posição,
 * fecha-se 70% e mantêm-se os 30% restantes em break-even + trailing
 * (em vez de fechar tudo). Esta mensagem é muitas vezes para desistir da posição.
 */
export function isPremiumHoldRemainderAtBE(text: string): boolean {
  return /\b(set\s+be|break\s?even|hold\s+risk|if\s+hold)\b/i.test(text)
}

/** Normaliza @canal, link t.me ou chat id numérico para comparação. */
export function normalizeChannel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^-?\d+$/.test(trimmed)) return trimmed
  const fromLink = trimmed.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '')
  return `@${fromLink.toLowerCase()}`
}

/** Variantes de ID Telegram para comparação (-100…, numérico, @username). */
export function telegramChatIdVariants(raw: string | number | null | undefined): string[] {
  if (raw == null) return []
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return []

  const variants = new Set<string>([trimmed])
  if (trimmed.startsWith('@')) {
    variants.add(trimmed.slice(1))
    return [...variants]
  }

  const digits = trimmed.replace(/^-/, '')
  if (/^\d+$/.test(digits)) {
    variants.add(digits)
    variants.add(`-${digits}`)
    if (!trimmed.startsWith('-100') && digits.length >= 9) {
      variants.add(`-100${digits}`)
    }
    if (trimmed.startsWith('-100')) {
      variants.add(trimmed.slice(4))
      variants.add(`-${trimmed.slice(4)}`)
    }
  }
  return [...variants]
}

export function chatIdsMatch(a: string | number, b: string | number): boolean {
  const va = telegramChatIdVariants(a)
  const vb = new Set(telegramChatIdVariants(b))
  return va.some((v) => vb.has(v))
}

/** Chaves possíveis para um update do Telegram (username + id + variantes). */
export function channelKeysFromTelegramChat(chat: {
  id?: number
  username?: string
}): string[] {
  const keys = new Set<string>()
  if (chat.username) {
    const normalized = normalizeChannel(`@${chat.username}`)
    if (normalized) {
      keys.add(normalized)
      telegramChatIdVariants(normalized).forEach((v) => keys.add(v))
    }
  }
  if (chat.id != null) {
    telegramChatIdVariants(chat.id).forEach((v) => keys.add(v))
  }
  return [...keys]
}

export function connectionMatchesChannel(
  connectionChannel: string | null,
  chat: { id?: number; username?: string },
): boolean {
  const configured = normalizeChannel(connectionChannel)
  if (!configured) return false
  const keys = channelKeysFromTelegramChat(chat)
  return keys.some((k) => {
    if (k === configured) return true
    if (configured.startsWith('@') && k.startsWith('@')) return k === configured
    return false
  })
}

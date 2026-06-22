/** Formata info do bot Telegram para UI (evita React error #31 com object child). */
export function formatTelegramBotLabel(
  bot: unknown,
  fallbackUsername = 'MoreThanMoney_aibot',
): string {
  if (typeof bot === 'string') {
    const trimmed = bot.trim()
    if (!trimmed) return `@${fallbackUsername.replace(/^@/, '')}`
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
  }

  if (bot && typeof bot === 'object') {
    const record = bot as { username?: unknown; name?: unknown; first_name?: unknown }
    const username = record.username != null ? String(record.username).trim() : ''
    if (username) return `@${username.replace(/^@/, '')}`
    const name = record.name ?? record.first_name
    if (name != null && String(name).trim()) return String(name).trim()
  }

  return `@${fallbackUsername.replace(/^@/, '')}`
}

export function coerceBotUsername(value: unknown, fallback = 'MoreThanMoney_aibot'): string {
  if (typeof value === 'string' && value.trim()) return value.replace(/^@/, '').trim()
  if (value && typeof value === 'object' && 'username' in (value as object)) {
    const u = String((value as { username?: unknown }).username ?? '').trim()
    if (u) return u.replace(/^@/, '')
  }
  return fallback.replace(/^@/, '')
}

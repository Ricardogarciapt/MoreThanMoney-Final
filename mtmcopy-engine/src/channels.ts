export function telegramChatIdVariants(raw: string | number | null | undefined): string[] {
  if (raw == null) return []
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return []

  const variants = new Set<string>([trimmed])
  const digits = trimmed.replace(/^-/, '')
  if (/^\d+$/.test(digits)) {
    variants.add(digits)
    variants.add(`-${digits}`)
    if (!trimmed.startsWith('-100') && digits.length >= 9) variants.add(`-100${digits}`)
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

export type ChatChannelUser = {
  id?: string
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean
  created_at?: string | null
}

export function isReadOnlyChannel(slug: string) {
  return slug === "trade-ideas-setup" || slug === "premium-ideas" || slug === "sensei-scanner"
}

export function isPremiumChannel(slug: string) {
  return slug === "premium-ideas"
}

export function requiresBrokerUidChannel(slug: string) {
  return slug === "trade-ideas" || slug === "trade-ideas-setup" || slug === "premium-ideas"
}

export function canReadChannel(slug: string, user: ChatChannelUser | null | undefined): boolean {
  if (!user?.is_active) return false
  if (slug === "premium-ideas" || slug === "sensei-scanner") {
    return (
      user.subscription_plan === "premium" ||
      user.member_category === "iq" ||
      user.member_category === "vip" ||
      user.user_type === "admin"
    )
  }
  return true
}

/** Canais de sinais: Premium · Ouro, Sensei Scanner e Ideias Forex (Auto Forex). */
export const SIGNAL_PUBLISH_CHANNELS = ["premium-ideas", "sensei-scanner", "trade-ideas"] as const

/**
 * Publicação em canais de sinais: apenas admin e VIP. O "sistema"
 * (webhook / reencaminhamento Telegram) insere server-side com user_id null,
 * contornando esta verificação — o reencaminhamento existente mantém-se.
 */
export function canPublishSignalChannel(user: ChatChannelUser | null | undefined): boolean {
  if (!user?.is_active) return false
  return user.user_type === "admin" || user.member_category === "vip"
}

export function canWriteChannel(slug: string, user: ChatChannelUser | null | undefined): boolean {
  if (!user?.is_active) return false
  // Canais de sinais (Premium Ouro, Sensei Scanner, Ideias Forex): só admin + VIP.
  if ((SIGNAL_PUBLISH_CHANNELS as readonly string[]).includes(slug)) {
    return canPublishSignalChannel(user)
  }
  if (isReadOnlyChannel(slug)) return false
  if (slug === "geral") return true
  if (slug === "trading") {
    if (user.subscription_plan === "premium" || user.member_category === "iq") return true
    if (user.user_type === "admin") return true
    if (user.created_at) {
      const joinedAt = new Date(user.created_at)
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      return joinedAt <= threeMonthsAgo
    }
    return false
  }
  if (slug === "cripto" || slug === "etf-stocks") {
    return (
      user.user_type === "admin" ||
      user.member_category === "iq" ||
      user.member_category === "vip"
    )
  }
  return false
}

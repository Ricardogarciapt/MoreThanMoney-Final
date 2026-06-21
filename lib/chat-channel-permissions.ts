export type ChatChannelUser = {
  id?: string
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean
  created_at?: string | null
}

export function isReadOnlyChannel(slug: string) {
  return slug === "trade-ideas-setup" || slug === "premium-ideas"
}

export function isPremiumChannel(slug: string) {
  return slug === "premium-ideas"
}

export function requiresBrokerUidChannel(slug: string) {
  return slug === "trade-ideas" || slug === "trade-ideas-setup" || slug === "premium-ideas"
}

export function canReadChannel(slug: string, user: ChatChannelUser | null | undefined): boolean {
  if (!user?.is_active) return false
  if (slug === "premium-ideas") {
    return (
      user.subscription_plan === "premium" ||
      user.member_category === "iq" ||
      user.member_category === "vip" ||
      user.user_type === "admin"
    )
  }
  return true
}

export function canWriteChannel(slug: string, user: ChatChannelUser | null | undefined): boolean {
  if (!user?.is_active) return false
  if (isReadOnlyChannel(slug) || slug === "trade-ideas") return false
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

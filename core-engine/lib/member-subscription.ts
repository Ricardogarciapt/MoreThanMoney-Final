/** Subscrição recorrente de 30 dias para membros IQ, Skool e Premium (65€) */

export const MEMBER_SUBSCRIPTION_DAYS = 30

export type SubscriptionCategory = "iq" | "skool" | "premium"

export function isSubscriptionCategory(
  category?: string | null
): category is SubscriptionCategory {
  return category === "iq" || category === "skool" || category === "premium"
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function buildSubscriptionExpiry(from: Date = new Date()): string {
  return addDays(from, MEMBER_SUBSCRIPTION_DAYS).toISOString()
}

export function isSubscriptionActive(profile: {
  member_category?: string | null
  subscription_expires_at?: string | null
}): boolean {
  if (!isSubscriptionCategory(profile.member_category)) return true
  if (!profile.subscription_expires_at) return true
  return new Date(profile.subscription_expires_at).getTime() > Date.now()
}

export function subscriptionDaysRemaining(
  expiresAt?: string | null
): number | null {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

export function subscriptionStatusLabel(profile: {
  member_category?: string | null
  subscription_expires_at?: string | null
  subscription_auto_renew?: boolean | null
}): string {
  if (!isSubscriptionCategory(profile.member_category)) return ""
  const days = subscriptionDaysRemaining(profile.subscription_expires_at)
  if (days === null) return "Sem data — acesso ativo"
  if (days === 0) return profile.subscription_auto_renew ? "Renova hoje (auto)" : "Expirado"
  const renew = profile.subscription_auto_renew ? " · auto-renova" : ""
  return `${days} dia${days === 1 ? "" : "s"} restantes${renew}`
}

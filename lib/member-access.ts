import type { UserProfile } from "@/lib/role-redirect"
import { isSubscriptionActive, isSubscriptionCategory } from "@/lib/member-subscription"

function trialIsExpired(p: UserProfile): boolean {
  if (p.trial_expired === true) return true
  if (!p.trial_expires_at) return false
  return new Date(p.trial_expires_at).getTime() <= Date.now()
}

function hasPaidAppPlan(profile: UserProfile): boolean {
  return profile.subscription_plan === "app_member" || profile.subscription_plan === "premium"
}

/**
 * Utilizador com registo/pagamento válido — não basta existir linha em profiles
 * (o trigger Supabase cria stub ao primeiro OAuth).
 */
export function isRegisteredMember(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false

  if (profile.user_type === "admin" && profile.is_active === true) {
    return true
  }

  if (profile.user_type === "pending" || profile.is_active === false) {
    return false
  }

  if (profile.user_type === "inactive") {
    return false
  }

  if (profile.user_type === "vip" || profile.member_category === "vip") {
    return true
  }

  if (profile.user_type === "guest") {
    return !trialIsExpired(profile)
  }

  if (isSubscriptionCategory(profile.member_category)) {
    return isSubscriptionActive(profile)
  }

  // Pack Membro / Premium (member_category standard) — exige plano pago
  if (profile.member_category === "standard" || profile.user_type === "member") {
    if (hasPaidAppPlan(profile)) return true
    if (profile.stripe_subscription_id) return true
    return false
  }

  if (profile.user_type === "presentation" || profile.user_type === "member") {
    return profile.is_active !== false
  }

  return false
}

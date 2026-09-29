import type { UserProfile } from "@/lib/role-redirect"
import { isSubscriptionActive, isSubscriptionCategory } from "@/lib/member-subscription"
import { needsAccessRevalidation } from "@/lib/access-migration"
import { requiresActivation } from "@/lib/member-activation"
import { compradorSemPack } from "@/lib/marketplace/comprador-marca"

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

  if (needsAccessRevalidation(profile as UserProfile & { profile_data?: unknown; email?: string })) {
    return false
  }

  if (profile.user_type === "pending" || profile.is_active === false) {
    return false
  }

  // Ativação pendente: escolheu-se pack + pagamento como condição de reentrada.
  if (requiresActivation(profile)) {
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

  /**
   * COMPRADOR DO MARKETPLACE — conta a sério, pack nenhum.
   *
   * Quem compra um curso sem login fica com uma conta criada no checkout e ZERO direitos (ver
   * `lib/marketplace/comprador.ts`). Sem este ramo caía no teste do pack mais abaixo — sem plano
   * pago, `false` — e o login atirava-o para /register («conta não encontrada»): a pessoa pagava e
   * não conseguia abrir o que comprou.
   *
   * Isto diz «esta conta existe e é dela», e não «esta pessoa tem pack». Os direitos continuam a ser
   * lidos de `subscription_plan`/`member_category`, que num comprador estão vazios — e o que ele
   * comprou abre-se pela linha em `marketplace_compras`, como qualquer outra compra da montra.
   */
  if (compradorSemPack(profile)) {
    return true
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
    // `is_active === false` ja devolveu false la em cima, por isso aqui a
    // comparacao era sempre verdadeira (o TS apontava-a como impossivel).
    return true
  }

  return false
}

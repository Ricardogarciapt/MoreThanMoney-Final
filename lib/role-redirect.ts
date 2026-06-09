import { isSubscriptionActive, isSubscriptionCategory } from "@/lib/member-subscription"

/**
 * Tipos de conta.
 * Na BD: trial = user_type "guest" + trial_expires_at; VIP = user_type ou member_category "vip";
 * Membro IQ/Skool = subscrição 30 dias; app_only = member_category "standard" (€35, só app mobile).
 */

/** Perfil alinhado com public.profiles */
export interface UserProfile {
  id?: string
  email?: string
  full_name?: string
  username?: string
  avatar_url?: string
  phone?: string
  whatsapp?: string
  created_at?: string
  user_type?: string
  member_category?: string
  is_active?: boolean
  trial_expired?: boolean
  trial_expires_at?: string | null
  subscription_expires_at?: string | null
  subscription_auto_renew?: boolean | null
}

export type AccountKind = "admin" | "vip" | "member" | "app_only" | "trial" | "pending" | "blocked"

function trialIsExpired(p: UserProfile): boolean {
  if (p.trial_expired === true) return true
  if (!p.trial_expires_at) return false
  return new Date(p.trial_expires_at).getTime() <= Date.now()
}

/**
 * Resolve o tipo de conta para regras de rota e redirecionamento.
 */
export function getAccountKind(profile: UserProfile | null): AccountKind {
  if (!profile) return "blocked"

  if (profile.user_type === "admin" && profile.is_active === true) {
    return "admin"
  }

  if (profile.user_type === "pending" || profile.is_active === false) {
    return "pending"
  }

  if (profile.user_type === "vip" || profile.member_category === "vip") {
    return "vip"
  }

  if (profile.user_type === "guest") {
    return trialIsExpired(profile) ? "blocked" : "trial"
  }

  if (profile.user_type === "inactive") {
    return "blocked"
  }

  if (
    profile.user_type === "member" &&
    isSubscriptionCategory(profile.member_category) &&
    !isSubscriptionActive(profile)
  ) {
    return "blocked"
  }

  // Membro App Only: member_category "standard" → acesso exclusivo à app mobile
  if (profile.member_category === "standard") {
    return "app_only"
  }

  // member, presentation, affiliate, etc. → membro completo
  return "member"
}

/** Evita open redirect: só caminhos relativos internos. */
export function safeInternalRedirectPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null
  const p = path.trim()
  if (!p.startsWith("/") || p.startsWith("//")) return null
  return p
}

export function determinePostLoginRedirect(
  profile: UserProfile | null,
  requestedRedirect?: string | null
): string {
  let safeRequested = safeInternalRedirectPath(requestedRedirect)

  if (safeRequested === "/admin" && profile?.user_type !== "admin") {
    safeRequested = null
  }

  const kind = getAccountKind(profile)

  if (kind === "blocked") {
    return "/login?error=trial_expired"
  }

  if (kind === "pending") {
    return "/success?message=Aguardando+aprovação+administrativa"
  }

  if (!profile) {
    return safeRequested ?? "/member-area"
  }

  if (kind === "admin") {
    return safeRequested || "/admin"
  }

  // Membros App Only (€35) — sempre para /app-mobile, independente do redirect pedido
  if (kind === "app_only") {
    return "/app-mobile"
  }

  if (safeRequested && kind !== "trial") {
    return safeRequested
  }

  if (kind === "trial" && safeRequested && !safeRequested.startsWith("/admin")) {
    return safeRequested
  }

  return "/app-mobile"
}

export function canAccessRoute(profile: UserProfile | null, route: string): boolean {
  const kind = getAccountKind(profile)

  if (kind === "blocked" || kind === "pending") {
    return false
  }

  if (!profile || profile.is_active === false) {
    return false
  }

  if (kind === "admin") {
    return true
  }

  if (route.startsWith("/admin")) {
    return false
  }

  if (kind === "vip") {
    return true
  }

  // Membros App Only (€35 standard) — apenas /app-mobile
  if (kind === "app_only") {
    return route.startsWith("/app-mobile")
  }

  if (kind === "member") {
    if (route.startsWith("/aimtm")) return false
    return true
  }

  if (kind === "trial") {
    if (route.startsWith("/aimtm") || route.startsWith("/portfolios")) {
      return false
    }
    return true
  }

  return false
}

export function getAccessDeniedMessage(profile: UserProfile | null, route: string): string {
  const kind = getAccountKind(profile)

  if (!profile) {
    return "Inicia sessão para aceder a esta página."
  }

  if (kind === "pending") {
    return "A tua conta está a aguardar aprovação."
  }

  if (kind === "blocked") {
    if (profile.user_type === "guest" || profile.trial_expires_at) {
      return "O teu período de trial terminou. Contacta a equipa para continuar."
    }
    if (isSubscriptionCategory(profile.member_category)) {
      return "A tua subscrição IQ/Skool expirou. Contacta a equipa para renovar."
    }
    return "Conta inativa. Contacta o suporte."
  }

  if (kind === "app_only") {
    return "O teu plano App Member inclui exclusivamente a app mobile MTM."
  }

  if (route.startsWith("/admin")) {
    return "Apenas administradores podem aceder ao painel."
  }

  if (route.startsWith("/aimtm")) {
    return "O AI MTM Trader está disponível para membros VIP."
  }

  if (route.startsWith("/portfolios") && kind === "trial") {
    return "Os portfólios não estão incluídos no Free Trial."
  }

  return "Não tens permissão para aceder a esta página."
}

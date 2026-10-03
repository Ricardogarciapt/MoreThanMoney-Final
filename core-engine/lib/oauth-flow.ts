/** Fluxo OAuth: login (conta existente) vs register (novo + pagamento Stripe). */

export const OAUTH_FLOW_LOGIN = "login"
export const OAUTH_FLOW_REGISTER = "register"

export const OAUTH_PENDING_REG_KEY = "mtm_oauth_pending_reg"

export const REGISTER_NOT_FOUND_MESSAGE =
  "Não encontramos o teu utilizador. Por favor faz o teu Registo Aqui."

export type OAuthPendingRegistration = {
  plan: "app_member" | "premium"
  billing: "monthly" | "annual"
  sponsor_username?: string
  coupon_code?: string
  created_at: number
}

export function isOAuthFlow(value: string | null | undefined): value is "login" | "register" {
  return value === OAUTH_FLOW_LOGIN || value === OAUTH_FLOW_REGISTER
}

export function buildOAuthCallbackUrl(
  origin: string,
  options: { flow: "login" | "register"; redirect?: string | null }
): string {
  const params = new URLSearchParams({ flow: options.flow })
  if (options.redirect) {
    params.set("redirect", options.redirect)
  }
  return `${origin}/auth/callback?${params}`
}

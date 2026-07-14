/**
 * Free trial de 3 dias (sem cartão) — inserido na política de acesso existente.
 *
 * Modelo: ao registar em /register (opção "grátis"), o utilizador nasce como
 * `user_type="guest"` + `subscription_platform="trial"` + `subscription_status="trialing"`
 * + `member_category="premium"` (para experimentar Premium) + `trial_expires_at = agora+3d`
 * + `conversion_deadline = agora+3d` (para o funil agressivo disparar ao fim do trial).
 *
 * Durante o trial: `isRegisteredMember` já concede acesso pelo ramo "guest", e as
 * portas Premium diretas passam a aceitar `isActiveTrial`. Ao expirar, o cron
 * `check-trials` põe `is_active=false` + `trial_expired=true` → todo o acesso fecha
 * (as portas Premium têm guarda `is_active===false → false`).
 */

export const TRIAL_DAYS = 3

export type TrialProfileLike = {
  user_type?: string | null
  member_category?: string | null
  subscription_platform?: string | null
  subscription_status?: string | null
  trial_expires_at?: string | null
  trial_expired?: boolean | null
  is_active?: boolean | null
}

/** É um perfil de trial (registo grátis), independentemente de estar ativo. */
export function isTrialProfile(p?: TrialProfileLike | null): boolean {
  if (!p) return false
  if ((p.subscription_platform || "").toLowerCase() === "trial") return true
  return p.user_type === "guest" && (p.subscription_status || "").toLowerCase() === "trialing"
}

/** O trial já expirou (por data ou por flag)? */
export function trialExpired(p?: TrialProfileLike | null): boolean {
  if (!p) return true
  if (p.trial_expired === true) return true
  if (!p.trial_expires_at) return false
  return new Date(p.trial_expires_at).getTime() <= Date.now()
}

/** Trial ativo = é trial, conta ativa e ainda não expirou → concede Premium. */
export function isActiveTrial(p?: TrialProfileLike | null): boolean {
  return isTrialProfile(p) && p!.is_active !== false && !trialExpired(p)
}

/** Trial que já terminou (para o funil agressivo pós-trial). */
export function isExpiredTrial(p?: TrialProfileLike | null): boolean {
  return isTrialProfile(p) && trialExpired(p)
}

/** Dias inteiros que faltam até ao fim do trial (0 se já passou). */
export function trialDaysLeft(p?: TrialProfileLike | null): number {
  if (!p?.trial_expires_at) return 0
  const ms = new Date(p.trial_expires_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

/** Data de fim do trial (agora + TRIAL_DAYS) em ISO. */
export function trialExpiresAtISO(from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + TRIAL_DAYS)
  return d.toISOString()
}

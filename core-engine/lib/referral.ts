/**
 * Referral loop VIRAL do MTM (double-sided).
 * - Convidado: trial estendido (REFERRED_TRIAL_DAYS) — aplicado no register-trial.
 * - Referrer: +REFERRER_DAYS de Premium por cada registo confirmado (anti-downgrade).
 * Código único por membro em profiles.referral_code; eventos em `referrals` (1 por convidado).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export const REFERRER_DAYS = 15
export const REFERRED_TRIAL_DAYS = 7

type Admin = SupabaseClient

function randomCode(seed: string): string {
  const base = (seed || "mtm").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mtm"
  const rand = Math.floor(Math.random() * 46656).toString(36).padStart(3, "0") // 3 chars base36 (sem Date/Math nas edge? aqui é node)
  return `${base}${rand}`
}

/** Devolve (criando se preciso) o código de referral do utilizador. */
export async function getOrCreateReferralCode(admin: Admin, userId: string): Promise<string | null> {
  const { data: prof } = await admin.from("profiles").select("referral_code, username, full_name, email").eq("id", userId).maybeSingle()
  if (!prof) return null
  if (prof.referral_code) return prof.referral_code
  const seed = String(prof.username || prof.full_name || (prof.email || "").split("@")[0] || "mtm")
  // Tenta até 5 códigos únicos.
  for (let i = 0; i < 5; i++) {
    const code = randomCode(seed)
    const { error } = await admin.from("profiles").update({ referral_code: code }).eq("id", userId).is("referral_code", null)
    if (!error) {
      const { data: check } = await admin.from("profiles").select("referral_code").eq("id", userId).maybeSingle()
      if (check?.referral_code) return check.referral_code
    }
  }
  return null
}

/**
 * Regista o referral e RECOMPENSA o referrer com +REFERRER_DAYS de Premium (anti-downgrade:
 * não encurta acesso pago mais longo). Dedup por referred_id. Chamar DEPOIS de criar o convidado.
 */
export async function applyReferral(
  admin: Admin,
  refCode: string,
  referredId: string,
): Promise<{ ok: boolean; referrerId?: string; reason?: string }> {
  const code = (refCode || "").trim()
  if (!code) return { ok: false, reason: "sem código" }

  const { data: referrer } = await admin
    .from("profiles")
    .select("id, member_category, subscription_plan, subscription_status, subscription_platform, subscription_expires_at")
    .eq("referral_code", code)
    .maybeSingle()
  if (!referrer) return { ok: false, reason: "código inválido" }
  if (referrer.id === referredId) return { ok: false, reason: "auto-referral" }

  // Dedup: 1 recompensa por convidado.
  const { data: existing } = await admin.from("referrals").select("id").eq("referred_id", referredId).maybeSingle()
  if (existing) return { ok: false, reason: "já registado" }

  const now = new Date()
  const { error: insErr } = await admin.from("referrals").insert({
    referrer_id: referrer.id,
    referred_id: referredId,
    referral_code: code,
    reward_days_referrer: REFERRER_DAYS,
    reward_days_referred: REFERRED_TRIAL_DAYS,
    status: "signed_up",
  })
  if (insErr) return { ok: false, reason: insErr.message }

  // Recompensa o referrer: +REFERRER_DAYS de Premium a partir do MAIOR entre agora e a validade atual.
  const currentExpiry = referrer.subscription_expires_at ? new Date(referrer.subscription_expires_at) : null
  const paidLonger =
    referrer.subscription_platform &&
    ["app_store", "stripe", "google_play"].includes(referrer.subscription_platform) &&
    currentExpiry && currentExpiry > now
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now
  const newExpiry = new Date(base.getTime() + REFERRER_DAYS * 86400000).toISOString()

  if (!paidLonger) {
    const upgradeCategory = ["premium", "vip"].includes(referrer.member_category) ? referrer.member_category : "premium"
    await admin.from("profiles").update({
      member_category: upgradeCategory,
      subscription_plan: "premium",
      subscription_status: "active",
      subscription_platform: "coupon", // CHECK aceita coupon (não 'referral')
      subscription_expires_at: newExpiry,
      is_active: true,
      updated_at: now.toISOString(),
    }).eq("id", referrer.id)
  }
  return { ok: true, referrerId: referrer.id }
}

/** Estatísticas de referral do utilizador (para a UI). */
export async function getReferralStats(admin: Admin, userId: string) {
  const { count } = await admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", userId)
  const referrals = count ?? 0
  return { referrals, daysEarned: referrals * REFERRER_DAYS }
}

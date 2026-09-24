import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { sendNewMemberWelcomeIfEligible } from "@/lib/new-member-welcome"
import { TRIAL_DAYS, trialExpiresAtISO } from "@/lib/trial-access"
import { applyReferral, REFERRED_TRIAL_DAYS } from "@/lib/referral"

const supabaseAdmin = getSupabaseAdmin()

/**
 * POST /api/auth/register-trial
 *
 * Cria uma conta com free trial de 3 dias (sem cartão). O utilizador nasce
 * `guest` + `trialing` + Premium, com `trial_expires_at`/`conversion_deadline`
 * a +3 dias. Ao expirar cai no funil de conversão (cobrança via Stripe).
 *
 * Anti-abuso: um trial por email. Contas existentes → 409 (inicia sessão / upgrade).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")
    const full_name = String(body.full_name || "").trim()
    const username = String(body.username || "").trim()
    const phone = body.phone ? String(body.phone).trim() : null
    const whatsapp = body.whatsapp ? String(body.whatsapp).trim() : null
    const sponsorUsername = body.sponsorUsername ? String(body.sponsorUsername).trim() : null
    const ref = body.ref ? String(body.ref).trim() : null // código de referral (opcional)
    const country = body.country ? String(body.country).trim() : null
    const preferred_language = body.preferred_language ? String(body.preferred_language).trim() : null

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "A palavra-passe deve ter pelo menos 6 carateres" }, { status: 400 })
    }
    if (!full_name || !username) {
      return NextResponse.json({ error: "Nome e nome de utilizador são obrigatórios" }, { status: 400 })
    }

    // Anti-abuso: um trial por email — se já existe perfil, encaminhar para login.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: "Já existe uma conta com este email. Inicia sessão para continuares.", code: "ACCOUNT_EXISTS" },
        { status: 409 },
      )
    }

    // Criar utilizador auth (login imediato, sem confirmação por email).
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, username },
    })
    if (authError || !authData?.user) {
      const msg = authError?.message || "Erro ao criar conta"
      const dup = /already been registered|already exists|already registered|duplicate/i.test(msg)
      return NextResponse.json(
        { error: dup ? "Já existe uma conta com este email. Inicia sessão para continuares." : msg, code: dup ? "ACCOUNT_EXISTS" : undefined },
        { status: dup ? 409 : 500 },
      )
    }

    const userId = authData.user.id
    const now = new Date()
    // Convidado por referral → trial estendido (REFERRED_TRIAL_DAYS); senão o normal.
    const referredTrialDays = ref ? REFERRED_TRIAL_DAYS : TRIAL_DAYS
    const trialEnds = ref
      ? new Date(now.getTime() + referredTrialDays * 86400000).toISOString()
      : trialExpiresAtISO(now)

    const profileRow = {
      id: userId,
      email,
      full_name,
      username,
      phone,
      whatsapp,
      country,
      preferred_language,
      user_type: "guest",
      // Trial = SÓ acesso básico à app (não Premium). As features Premium só
      // se desbloqueiam ao pagar o intro de 1º mês (€35). O acesso à app vem do
      // ramo guest de isRegisteredMember (enquanto o trial não expira).
      member_category: "standard",
      subscription_plan: "app_member",
      subscription_billing_cycle: "monthly",
      subscription_platform: "trial",
      subscription_status: "trialing",
      is_active: true,
      trial_expires_at: trialEnds,
      trial_expired: false,
      conversion_deadline: trialEnds, // funil agressivo dispara ao fim do trial
      mlm_sponsor_username: sponsorUsername || null,
      referred_by_code: ref || null,
      updated_at: now.toISOString(),
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(profileRow, { onConflict: "id" })
    if (profileError) {
      // Reverter o utilizador auth para não deixar conta órfã sem perfil.
      try { await supabaseAdmin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
      return NextResponse.json({ error: "Erro ao criar perfil: " + profileError.message }, { status: 500 })
    }

    // Referral: recompensa o referrer (+15d Premium) por este registo (best-effort).
    if (ref) {
      try { await applyReferral(supabaseAdmin, ref, userId) } catch { /* silencioso */ }
    }

    // Email de boas-vindas (best-effort — não bloqueia o registo).
    try { await sendNewMemberWelcomeIfEligible({ userId, source: 'trial' }) } catch { /* silencioso */ }

    // Atribuição Opinly: sign_up + start_trial (best-effort, dedup por userId).
    try {
      const { opinlyTrack } = await import("@/lib/opinly/track")
      await opinlyTrack("sign_up", { method: "trial" }, { externalEventId: `signup_${userId}`, email })
      await opinlyTrack("start_trial", { plan: "trial" }, { externalEventId: `trial_${userId}`, email })
    } catch { /* silencioso */ }

    return NextResponse.json({
      success: true,
      userId,
      trialExpiresAt: trialEnds,
      trialDays: referredTrialDays,
      referred: !!ref,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 500 })
  }
}

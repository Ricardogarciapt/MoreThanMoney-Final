import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isTrialProfile, trialExpired, trialDaysLeft } from "@/lib/trial-access"

const supabaseAdmin = getSupabaseAdmin()

/**
 * Estado do funil de conversão do utilizador autenticado.
 * "Grátis concedido" = acesso manual (não pagante) com conversion_deadline definido.
 * Usado pelo ConversionBanner (app + site) para mostrar countdown + oferta.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ isFreeGranted: false }, { status: 200 })
  }
  const accessToken = authHeader.replace("Bearer ", "")
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) return NextResponse.json({ isFreeGranted: false }, { status: 200 })

  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("member_category, subscription_platform, subscription_status, conversion_deadline, user_type, trial_expires_at, trial_expired, is_active")
    .eq("id", user.id)
    .single()

  // ── Free trial de 3 dias (guest) — funil agressivo ─────────────────────────
  if (isTrialProfile(p) && p?.user_type !== "admin") {
    const expired = trialExpired(p)
    const daysLeft = trialDaysLeft(p)
    return NextResponse.json({
      isFreeGranted: true,
      phase: expired ? "trial_expired" : "trial",
      blocking: expired, // pós-trial → banner insistente (não fechável)
      memberCategory: (p?.member_category || "premium").toLowerCase(),
      deadline: p?.trial_expires_at,
      daysLeft,
      offer: expired
        ? { title: "O teu trial terminou — desbloqueia Premium por 34,99€", plan: "premium" }
        : { title: `Faltam ${daysLeft} dia${daysLeft === 1 ? "" : "s"} do teu Premium grátis — garante já 34,99€`, plan: "premium" },
    })
  }

  const platform = (p?.subscription_platform || "manual").toLowerCase()
  const isManualFree = (platform === "manual" || !p?.subscription_platform) && p?.subscription_status === "active"
  const cat = (p?.member_category || "").toLowerCase()
  const isFreeGranted =
    Boolean(p?.conversion_deadline) &&
    isManualFree &&
    p?.user_type !== "admin" &&
    ["premium", "standard", "app_member"].includes(cat)

  if (!isFreeGranted) {
    return NextResponse.json({ isFreeGranted: false, memberCategory: cat || null })
  }

  const deadline = p!.conversion_deadline as string
  const daysLeft = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000))
  const isPremiumFree = cat === "premium" || cat === "vip"

  return NextResponse.json({
    isFreeGranted: true,
    memberCategory: cat,
    deadline,
    daysLeft,
    // Premium grátis → mantém Premium com Fundador; Membro grátis → sobe/continua
    offer: isPremiumFree
      ? { title: "Continua Premium com 50% Fundador", coupon: "FOUNDER50", plan: "premium" }
      : { title: "Passa a Premium — 1º mês 34,99€", plan: "premium" },
  })
}

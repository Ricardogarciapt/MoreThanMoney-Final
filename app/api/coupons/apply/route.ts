import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

// Mapeia plan_override → membership_level + package no perfil
function resolvePlanFields(planOverride: string | null): {
  membership_level: string
  package: string
} | null {
  switch (planOverride) {
    case "premium":
      return { membership_level: "premium", package: "premium" }
    case "both":
      // Acesso completo: Premium + Trade Ideas
      return { membership_level: "premium", package: "premium" }
    case "trade_ideas":
      return { membership_level: "trade_ideas", package: "trade_ideas" }
    case "basic":
      return { membership_level: "basic", package: "basic" }
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  try {
    const body = await request.json()
    const { code, userId, context } = body as {
      code?: string
      userId?: string
      context?: string
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, message: "Código de cupão em falta" },
        { status: 400 }
      )
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, message: "userId em falta" },
        { status: 400 }
      )
    }

    const normalizedCode = code.trim().toUpperCase()

    // Buscar e validar o cupão (re-validação completa para evitar race conditions)
    const { data: coupon, error: fetchError } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", normalizedCode)
      .maybeSingle()

    if (fetchError) {
      console.error("❌ [COUPONS/APPLY] Erro ao buscar cupão:", fetchError)
      return NextResponse.json(
        { success: false, message: "Erro ao aplicar cupão" },
        { status: 500 }
      )
    }

    if (!coupon) {
      return NextResponse.json(
        { success: false, message: "Cupão inválido ou inexistente" },
        { status: 404 }
      )
    }

    if (!coupon.is_active) {
      return NextResponse.json(
        { success: false, message: "Este cupão não está activo" },
        { status: 400 }
      )
    }

    const now = new Date()
    if (new Date(coupon.valid_from) > now) {
      return NextResponse.json(
        { success: false, message: "Este cupão ainda não está disponível" },
        { status: 400 }
      )
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json(
        { success: false, message: "Este cupão já expirou" },
        { status: 400 }
      )
    }

    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return NextResponse.json(
        { success: false, message: "Este cupão já atingiu o número máximo de utilizações" },
        { status: 400 }
      )
    }

    // Verificar se o utilizador já usou este cupão
    const { data: existingUsage } = await supabase
      .from("coupon_usages")
      .select("id")
      .eq("coupon_id", coupon.id)
      .eq("user_id", userId)
      .maybeSingle()

    if (existingUsage) {
      return NextResponse.json(
        { success: false, message: "Já utilizaste este cupão anteriormente" },
        { status: 400 }
      )
    }

    // Registar utilização na tabela coupon_usages
    const { error: usageError } = await supabase.from("coupon_usages").insert({
      coupon_id: coupon.id,
      user_id: userId,
      used_at: now.toISOString(),
      context: context || "manual",
    })

    if (usageError) {
      console.error("❌ [COUPONS/APPLY] Erro ao registar utilização:", usageError)
      return NextResponse.json(
        { success: false, message: "Erro ao registar utilização do cupão" },
        { status: 500 }
      )
    }

    // Incrementar used_count
    const { error: updateError } = await supabase
      .from("coupons")
      .update({ used_count: coupon.used_count + 1, updated_at: now.toISOString() })
      .eq("id", coupon.id)

    if (updateError) {
      console.error("❌ [COUPONS/APPLY] Erro ao incrementar used_count:", updateError)
    }

    // ── Atribuir acesso ao perfil do utilizador ──────────────────────────────
    // Só cupões que concedem acesso directo (free_subscription / free_months)
    // Os de desconto (discount_pct) são aplicados no Stripe durante o checkout
    const profileUpdate: Record<string, unknown> = {
      coupon_code: normalizedCode,
      checkout_source: "coupon",
      subscription_platform: context?.includes("ios") ? "ios_app" : context || "coupon",
      updated_at: now.toISOString(),
    }

    if (coupon.type === "free_subscription") {
      // Acesso gratuito — definir plano com base em plan_override
      const planFields = resolvePlanFields(coupon.plan_override)
      if (planFields) {
        profileUpdate.membership_level = planFields.membership_level
        profileUpdate.package = planFields.package
      }
      profileUpdate.subscription_plan = coupon.plan_override ?? "basic"
      profileUpdate.subscription_status = "active"
      profileUpdate.subscription_auto_renew = false
      // discount_value = número de meses (0 = indefinido)
      if (coupon.discount_value && coupon.discount_value > 0) {
        const expires = new Date(now)
        expires.setMonth(expires.getMonth() + Number(coupon.discount_value))
        profileUpdate.subscription_expires_at = expires.toISOString()
      } else {
        profileUpdate.subscription_expires_at = null
      }
    } else if (coupon.type === "free_months") {
      // N meses grátis — manter plano actual, só extender prazo
      const months = Number(coupon.discount_value) || 1
      const expires = new Date(now)
      expires.setMonth(expires.getMonth() + months)
      profileUpdate.subscription_expires_at = expires.toISOString()
      profileUpdate.subscription_status = "active"
      if (coupon.plan_override) {
        const planFields = resolvePlanFields(coupon.plan_override)
        if (planFields) {
          profileUpdate.membership_level = planFields.membership_level
          profileUpdate.package = planFields.package
        }
        profileUpdate.subscription_plan = coupon.plan_override
      }
    }
    // discount_pct: não altera o perfil — aplicado no Stripe checkout

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)

    if (profileError) {
      console.error("❌ [COUPONS/APPLY] Erro ao actualizar perfil:", profileError)
      // Não falhar — uso já registado; aviso no log para seguimento manual
    } else {
      console.log(`✅ [COUPONS/APPLY] Perfil ${userId} actualizado com cupão ${normalizedCode} (tipo: ${coupon.type})`)
    }

    return NextResponse.json({
      success: true,
      message: "Cupão aplicado com sucesso",
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        discount_value: coupon.discount_value,
        plan_override: coupon.plan_override,
      },
    })
  } catch (error: any) {
    console.error("❌ [COUPONS/APPLY] Erro:", error)
    return NextResponse.json(
      { success: false, message: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

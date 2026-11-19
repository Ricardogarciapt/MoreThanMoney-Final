import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { normalizarCodigoCupao } from "@/lib/cupoes-codigo"
import { cupaoEsgotado } from "@/lib/cupoes-usos"

/**
 * POST /api/coupons/apply — regista o uso de um cupão pela pessoa com sessão.
 * 19/11: passou a exigir sessão (Bearer). Antes aceitava qualquer `userId` no corpo, e qualquer
 * pessoa podia gastar um cupão em nome de outra.
 */

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  try {
    const token = (request.headers.get("authorization") || "").replace("Bearer ", "").trim()
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!auth?.user) {
      return NextResponse.json({ success: false, message: "Sessão em falta" }, { status: 401 })
    }
    const userId = auth.user.id

    const body = await request.json().catch(() => ({}))
    const { code, context } = body as {
      code?: string
      context?: string
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, message: "Código de cupão em falta" },
        { status: 400 }
      )
    }

    const normalizedCode = normalizarCodigoCupao(code)

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
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
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

    if (await cupaoEsgotado(supabase, coupon)) {
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
      .update({
        used_count: coupon.used_count + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", coupon.id)

    if (updateError) {
      console.error("❌ [COUPONS/APPLY] Erro ao incrementar used_count:", updateError)
      // Não falhar aqui — a utilização já foi registada
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

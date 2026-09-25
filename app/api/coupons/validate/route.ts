import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { cupaoEsgotado } from "@/lib/cupoes-usos"

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  try {
    const body = await request.json()
    const { code, userId } = body as { code?: string; userId?: string }

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { valid: false, message: "Código de cupão em falta" },
        { status: 400 }
      )
    }

    const normalizedCode = code.trim().toUpperCase()

    // Buscar o cupão
    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", normalizedCode)
      .maybeSingle()

    if (error) {
      console.error("❌ [COUPONS/VALIDATE] Erro ao buscar cupão:", error)
      return NextResponse.json(
        { valid: false, message: "Erro interno ao validar cupão" },
        { status: 500 }
      )
    }

    if (!coupon) {
      return NextResponse.json({
        valid: false,
        type: "",
        message: "Cupão inválido ou inexistente",
      })
    }

    // Verificar se está activo
    if (!coupon.is_active) {
      return NextResponse.json({
        valid: false,
        type: coupon.type,
        message: "Este cupão não está activo",
      })
    }

    // Verificar datas de validade
    const now = new Date()
    const validFrom = new Date(coupon.valid_from)
    if (validFrom > now) {
      return NextResponse.json({
        valid: false,
        type: coupon.type,
        message: "Este cupão ainda não está disponível",
      })
    }

    if (coupon.valid_until) {
      const validUntil = new Date(coupon.valid_until)
      if (validUntil < now) {
        return NextResponse.json({
          valid: false,
          type: coupon.type,
          message: "Este cupão já expirou",
        })
      }
    }

    // Verificar limite de usos — contado em `coupon_usages`, não no `used_count`, que nunca subia
    // (ver lib/cupoes-usos.ts). Enquanto se lia o contador, nenhum limite travava coisa nenhuma.
    if (await cupaoEsgotado(supabase, coupon)) {
      return NextResponse.json({
        valid: false,
        type: coupon.type,
        message: "Este cupão já atingiu o número máximo de utilizações",
      })
    }

    // Verificar se o utilizador já usou este cupão (se userId fornecido)
    if (userId) {
      const { data: existingUsage } = await supabase
        .from("coupon_usages")
        .select("id")
        .eq("coupon_id", coupon.id)
        .eq("user_id", userId)
        .maybeSingle()

      if (existingUsage) {
        return NextResponse.json({
          valid: false,
          type: coupon.type,
          message: "Já utilizaste este cupão anteriormente",
        })
      }
    }

    // Cupão válido — construir resposta
    const response: {
      valid: boolean
      type: string
      discount_pct?: number
      free_months?: number
      plan_override?: string
      message: string
    } = {
      valid: true,
      type: coupon.type,
      message: "Cupão válido",
    }

    if (coupon.type === "discount_pct") {
      response.discount_pct = coupon.discount_value
      response.message = `Desconto de ${coupon.discount_value}% aplicado`
    } else if (coupon.type === "free_months") {
      response.free_months = coupon.discount_value
      response.message = `${coupon.discount_value} ${coupon.discount_value === 1 ? "mês grátis" : "meses grátis"} aplicado`
    } else if (coupon.type === "free_subscription") {
      response.message = "Subscrição gratuita aplicada"
    }

    if (coupon.plan_override) {
      response.plan_override = coupon.plan_override
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("❌ [COUPONS/VALIDATE] Erro:", error)
    return NextResponse.json(
      { valid: false, message: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

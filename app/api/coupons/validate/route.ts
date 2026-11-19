import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { checkRateLimit } from "@/lib/admin-api-helpers"
import { avaliarCupao, MENSAGEM_RECUSA } from "@/lib/cupoes-codigo"

/**
 * POST /api/coupons/validate — o registo (web e app) pergunta se um cupão vale.
 *
 * As regras vivem em lib/cupoes-codigo.ts (normalização «she is faceless» → SHEISFACELESS, datas,
 * usos reais em `coupon_usages`). Responde só o necessário para o formulário: nunca o id, os ids
 * Stripe/Apple nem os limites — isso fica no servidor.
 */
const PLANO_LEGIVEL: Record<string, string> = {
  app_member: "Membro",
  premium: "Premium",
  both: "Membro ou Premium",
  vip: "Premium",
}

export async function POST(request: NextRequest) {
  // Travão leve contra quem tenta adivinhar códigos (por instância; o site é serverless).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?"
  if (!checkRateLimit(`cupao-validar:${ip}`, 20, 60_000).allowed) {
    return NextResponse.json({ valid: false, message: "Demasiadas tentativas. Espera um minuto." }, { status: 429 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { code, userId } = body as { code?: string; userId?: string }

    const r = await avaliarCupao(getSupabaseAdmin(), code, { userId: typeof userId === "string" ? userId : null })
    if (!r.ok) {
      const status = r.motivo === "em_falta" ? 400 : r.motivo === "erro" ? 500 : 200
      return NextResponse.json({ valid: false, type: r.cupao?.type ?? "", message: MENSAGEM_RECUSA[r.motivo] }, { status })
    }

    const coupon = r.cupao
    const valor = Number(coupon.discount_value) || 0
    const response: {
      valid: boolean
      type: string
      code: string
      discount_pct?: number
      free_months?: number
      plan_override?: string
      message: string
    } = { valid: true, type: coupon.type, code: coupon.code, message: "Cupão válido" }

    if (coupon.type === "discount_pct") {
      response.discount_pct = valor
      response.message = `Desconto de ${valor}% aplicado`
    } else if (coupon.type === "free_months") {
      response.free_months = valor
      response.message = `${valor} ${valor === 1 ? "mês grátis" : "meses grátis"} aplicado`
    } else if (coupon.type === "free_subscription") {
      response.message = "Subscrição gratuita aplicada"
    } else if (coupon.type === "campanha_90d") {
      // Campanha 90 dias: Membro com a app MTM System, nada cobrado nos 90 dias, depois Premium.
      response.message = "90 dias grátis como Membro (app MTM System). Depois passas a Premium a 65€/mês."
    }

    if (coupon.plan_override) {
      response.plan_override = coupon.plan_override
      const plano = PLANO_LEGIVEL[coupon.plan_override]
      if (plano && coupon.type !== "campanha_90d") response.message += ` · plano ${plano}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("❌ [COUPONS/VALIDATE] Erro:", error)
    return NextResponse.json({ valid: false, message: "Erro interno do servidor" }, { status: 500 })
  }
}

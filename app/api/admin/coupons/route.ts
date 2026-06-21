import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import {
  activateStripePromotionCode,
  createStripeCouponSync,
  deactivateStripePromotionCode,
} from "@/lib/stripe-coupons"

const supabase = getSupabaseAdmin()

// ── GET — list all coupons ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("❌ [ADMIN COUPONS GET] Erro:", error)
      return NextResponse.json(
        { error: "Erro ao buscar cupões", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS GET] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

// ── POST — create coupon ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const {
      code,
      type,
      discount_value,
      plan_override,
      max_uses,
      valid_from,
      valid_until,
      description,
      stripe_duration,
      stripe_duration_months,
    } = body

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { error: "O código é obrigatório" },
        { status: 400 }
      )
    }

    const allowedTypes = ["discount_pct", "free_months", "free_subscription"]
    if (!type || !allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${allowedTypes.join(", ")}` },
        { status: 400 }
      )
    }

    const allowedPlans = ["app_member", "premium", "both", null, undefined]
    if (plan_override !== undefined && !allowedPlans.includes(plan_override)) {
      return NextResponse.json(
        { error: "plan_override inválido" },
        { status: 400 }
      )
    }

    const normalizedCode = code.trim().toUpperCase()

    // Check for duplicate
    const { data: existing } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", normalizedCode)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `Já existe um cupão com o código "${normalizedCode}"` },
        { status: 409 }
      )
    }

    const allowedDurations = ['once', 'repeating', 'forever', null, undefined]
    if (stripe_duration !== undefined && !allowedDurations.includes(stripe_duration)) {
      return NextResponse.json({ error: "stripe_duration inválido. Valores: once, repeating, forever" }, { status: 400 })
    }

    let stripeSync: { stripe_coupon_id: string; stripe_promotion_code_id: string } | null = null
    try {
      stripeSync = await createStripeCouponSync({
        code: normalizedCode,
        type,
        discount_value: discount_value ?? 0,
        max_uses: max_uses ?? null,
        valid_until: valid_until || null,
        description: description || null,
        stripe_duration: stripe_duration || null,
        stripe_duration_months: stripe_duration_months ? Number(stripe_duration_months) : null,
      })
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : "Erro ao criar cupão no Stripe"
      console.error("❌ [ADMIN COUPONS POST] Stripe:", msg)
      return NextResponse.json(
        { error: "Erro ao sincronizar cupão com Stripe", details: msg },
        { status: 502 }
      )
    }

    const { data, error } = await supabase
      .from("coupons")
      .insert({
        code: normalizedCode,
        type,
        discount_value: discount_value ?? 0,
        plan_override: plan_override || null,
        max_uses: max_uses ?? null,
        used_count: 0,
        valid_from: valid_from || new Date().toISOString(),
        valid_until: valid_until || null,
        description: description || null,
        is_active: true,
        stripe_duration: stripe_duration || null,
        stripe_coupon_id: stripeSync.stripe_coupon_id,
        stripe_promotion_code_id: stripeSync.stripe_promotion_code_id,
      })
      .select()
      .single()

    if (error) {
      console.error("❌ [ADMIN COUPONS POST] Erro:", error)
      if (stripeSync) {
        await deactivateStripePromotionCode(stripeSync.stripe_promotion_code_id).catch(() => {})
      }
      return NextResponse.json(
        { error: "Erro ao criar cupão", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, stripe_synced: true }, { status: 201 })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS POST] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

// ── PATCH — toggle is_active or update fields ─────────────────────────────────

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { id, is_active, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (is_active !== undefined) updates.is_active = Boolean(is_active)

    // Allow updating other safe fields
    const allowedUpdates = [
      "description",
      "max_uses",
      "valid_until",
      "valid_from",
      "discount_value",
      "plan_override",
    ]
    for (const key of allowedUpdates) {
      if (key in rest) updates[key] = rest[key]
    }

    const { data: existing } = await supabase
      .from("coupons")
      .select("stripe_promotion_code_id")
      .eq("id", id)
      .maybeSingle()

    if (is_active !== undefined && existing?.stripe_promotion_code_id) {
      try {
        if (Boolean(is_active)) {
          await activateStripePromotionCode(existing.stripe_promotion_code_id)
        } else {
          await deactivateStripePromotionCode(existing.stripe_promotion_code_id)
        }
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : "Erro Stripe"
        console.error("❌ [ADMIN COUPONS PATCH] Stripe:", msg)
        return NextResponse.json(
          { error: "Erro ao sincronizar estado no Stripe", details: msg },
          { status: 502 }
        )
      }
    }

    const { data, error } = await supabase
      .from("coupons")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("❌ [ADMIN COUPONS PATCH] Erro:", error)
      return NextResponse.json(
        { error: "Erro ao actualizar cupão", details: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ error: "Cupão não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS PATCH] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

// ── DELETE — remove coupon ────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from("coupons")
      .select("stripe_promotion_code_id")
      .eq("id", id)
      .maybeSingle()

    if (existing?.stripe_promotion_code_id) {
      await deactivateStripePromotionCode(existing.stripe_promotion_code_id).catch((err) => {
        console.warn("⚠️ [ADMIN COUPONS DELETE] Stripe deactivate:", err)
      })
    }

    const { error } = await supabase.from("coupons").delete().eq("id", id)

    if (error) {
      console.error("❌ [ADMIN COUPONS DELETE] Erro:", error)
      return NextResponse.json(
        { error: "Erro ao eliminar cupão", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS DELETE] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

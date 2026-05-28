import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      apple_original_transaction_id,
      apple_product_id,
      subscription_plan,
      subscription_billing_cycle,
      subscription_platform,
      coupon_code,
    } = body

    if (!apple_original_transaction_id || !apple_product_id || !subscription_plan) {
      return NextResponse.json(
        { error: "apple_original_transaction_id, apple_product_id e subscription_plan são obrigatórios" },
        { status: 400 }
      )
    }

    // Identify user from Authorization header
    const authHeader = request.headers.get("authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "").trim()

    let userId: string | null = null
    if (token) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token)
      if (!userError && userData?.user) {
        userId = userData.user.id
      }
    }

    // If no token, try to match by transaction ID (re-entrant call)
    if (!userId) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("apple_original_transaction_id", apple_original_transaction_id)
        .single()
      if (existing) userId = existing.id
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Utilizador não autenticado. Faz login antes de subscrever." },
        { status: 401 }
      )
    }

    // Validate plan
    const validPlans = ["app_member", "premium"]
    const validCycles = ["monthly", "annual"]
    if (!validPlans.includes(subscription_plan)) {
      return NextResponse.json({ error: "subscription_plan inválido" }, { status: 400 })
    }
    if (!validCycles.includes(subscription_billing_cycle)) {
      return NextResponse.json({ error: "subscription_billing_cycle inválido" }, { status: 400 })
    }

    // Validate coupon if provided
    let couponValid = false
    if (coupon_code) {
      const { data: coupon } = await supabase
        .from("subscription_coupons")
        .select("*")
        .eq("code", coupon_code.toUpperCase())
        .eq("is_active", true)
        .single()

      if (coupon) {
        const now = new Date()
        const notExpired = !coupon.expires_at || new Date(coupon.expires_at) > now
        const hasUses = !coupon.max_uses || (coupon.current_uses || 0) < coupon.max_uses
        const planMatch = !coupon.plan || coupon.plan === subscription_plan || coupon.plan === 'any'

        if (notExpired && hasUses && planMatch) {
          couponValid = true
          // Increment uses
          await supabase
            .from("subscription_coupons")
            .update({ current_uses: (coupon.current_uses || 0) + 1 })
            .eq("id", coupon.id)
        }
      }
    }

    // Update profile with subscription info
    const profileUpdate: Record<string, any> = {
      subscription_plan,
      subscription_billing_cycle,
      subscription_platform: subscription_platform || "app_store",
      apple_original_transaction_id,
      apple_product_id,
      user_type: "member",
      is_active: true,
      member_category: subscription_plan === "premium" ? "iq" : "standard",
      updated_at: new Date().toISOString(),
    }
    if (coupon_code && couponValid) {
      profileUpdate.coupon_code = coupon_code.toUpperCase()
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)

    if (updateError) {
      console.error("[apple-iap] profile update error:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Log subscription event
    await supabase.from("subscription_events").insert({
      user_id: userId,
      event_type: "purchased",
      plan: subscription_plan,
      billing_cycle: subscription_billing_cycle,
      platform: subscription_platform || "app_store",
      apple_transaction_id: apple_original_transaction_id,
      coupon_code: couponValid ? coupon_code?.toUpperCase() : null,
      metadata: { apple_product_id },
    })

    // Auto-invite Premium subscribers to Skool
    if (subscription_plan === "premium") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single()
      if (profile?.email) {
        const skoolWebhookUrl = process.env.SKOOL_INVITE_WEBHOOK_URL
        if (skoolWebhookUrl) {
          const inviteUrl = `${skoolWebhookUrl}?email=${encodeURIComponent(profile.email)}`
          fetch(inviteUrl, { method: "POST" }).catch(() => {/* non-blocking */})
        }
      }
    }

    return NextResponse.json({
      success: true,
      plan: subscription_plan,
      billing_cycle: subscription_billing_cycle,
      coupon_applied: couponValid,
    })
  } catch (err: any) {
    console.error("[apple-iap] exception:", err)
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}

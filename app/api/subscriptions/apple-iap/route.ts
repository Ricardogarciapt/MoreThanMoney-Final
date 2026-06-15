import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import {
  appleMlmContext,
  applePaymentReference,
  processMlmSubscriptionRenewal,
  processMlmSubscriptionSignup,
} from "@/lib/mlm-subscription-integration"

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
      subscription_expires_at,
      subscription_auto_renews,
      subscription_status,
      event_type,
      coupon_code,
      sponsor_username,
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

    // If no token, try to match by transaction ID (re-entrant call / server notification)
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
    if (subscription_billing_cycle && !validCycles.includes(subscription_billing_cycle)) {
      return NextResponse.json({ error: "subscription_billing_cycle inválido" }, { status: 400 })
    }

    // Validate event type
    const eventType = event_type || "purchased"
    const isEntitlementCheck = eventType === "entitlement_check"

    // For entitlement checks, only update subscription dates — don't re-apply plan upgrade logic
    if (isEntitlementCheck) {
      const checkUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (subscription_expires_at) checkUpdate.subscription_expires_at = subscription_expires_at
      if (typeof subscription_auto_renews === "boolean") checkUpdate.subscription_auto_renews = subscription_auto_renews
      if (subscription_status) checkUpdate.subscription_status = subscription_status

      await supabase.from("profiles").update(checkUpdate).eq("id", userId)

      return NextResponse.json({ success: true, event_type: "entitlement_check" })
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
        const planMatch = !coupon.plan || coupon.plan === subscription_plan || coupon.plan === "any"

        if (notExpired && hasUses && planMatch) {
          couponValid = true
          await supabase
            .from("subscription_coupons")
            .update({ current_uses: (coupon.current_uses || 0) + 1 })
            .eq("id", coupon.id)
        }
      }
    }

    // Determine if this is a renewal or new purchase — increment renewal count for renewals
    const isRenewal = eventType === "renewed"

    // Build profile update
    const profileUpdate: Record<string, any> = {
      subscription_plan,
      subscription_billing_cycle: subscription_billing_cycle || "monthly",
      subscription_platform: subscription_platform || "app_store",
      apple_original_transaction_id,
      apple_product_id,
      user_type: "member",
      is_active: true,
      member_category: subscription_plan === "premium" ? "premium" : "standard",
      subscription_status: subscription_status || "active",
      subscription_auto_renews: subscription_auto_renews !== false, // default true
      updated_at: new Date().toISOString(),
    }

    if (subscription_expires_at) {
      profileUpdate.subscription_expires_at = subscription_expires_at
    }

    if (coupon_code && couponValid) {
      profileUpdate.coupon_code = coupon_code.toUpperCase()
    }

    const sponsor = (sponsor_username as string | undefined)?.trim()
    if (sponsor && !isRenewal) {
      profileUpdate.mlm_sponsor_username = sponsor
    }

    if (isRenewal) {
      // Increment renewal count
      const { data: current } = await supabase
        .from("profiles")
        .select("subscription_renewal_count")
        .eq("id", userId)
        .single()
      profileUpdate.subscription_renewal_count = (current?.subscription_renewal_count || 0) + 1
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
      event_type: eventType,
      plan: subscription_plan,
      billing_cycle: subscription_billing_cycle || "monthly",
      platform: subscription_platform || "app_store",
      apple_transaction_id: apple_original_transaction_id,
      coupon_code: couponValid ? coupon_code?.toUpperCase() : null,
      subscription_expires_at: subscription_expires_at || null,
      subscription_auto_renews: subscription_auto_renews !== false,
      subscription_status: subscription_status || "active",
      metadata: { apple_product_id },
    })

    // Auto-invite Premium subscribers to Skool
    if (subscription_plan === "premium" && !isRenewal) {
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

    // MLM
    try {
      const mlmCtx = appleMlmContext(
        apple_product_id,
        subscription_plan === 'premium' ? 'premium_monthly' : 'app_member_monthly',
      )
      if (isRenewal) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('mlm_sponsor_username')
          .eq('id', userId)
          .single()
        await processMlmSubscriptionRenewal(supabase, {
          userId,
          sponsorUsername: prof?.mlm_sponsor_username ?? null,
          planId: mlmCtx.planId,
          amountCents: mlmCtx.amountCents,
          currency: mlmCtx.currency,
          paymentReference: applePaymentReference('renewal', apple_original_transaction_id),
        })
      } else {
        await processMlmSubscriptionSignup(supabase, {
          userId,
          sponsorUsername: sponsor,
          planId: mlmCtx.planId,
          amountCents: mlmCtx.amountCents,
          currency: mlmCtx.currency,
          paymentReference: applePaymentReference('purchase', apple_original_transaction_id),
          platform: 'app_store',
        })
      }
    } catch (mlmErr) {
      console.error('[apple-iap] MLM error:', mlmErr)
    }

    return NextResponse.json({
      success: true,
      plan: subscription_plan,
      billing_cycle: subscription_billing_cycle,
      coupon_applied: couponValid,
      expires_at: subscription_expires_at || null,
      status: subscription_status || "active",
    })
  } catch (err: any) {
    console.error("[apple-iap] exception:", err)
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}

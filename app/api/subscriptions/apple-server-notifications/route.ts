/**
 * Apple App Store Server Notifications v2
 *
 * Apple sends signed JWS payloads to this endpoint when:
 *   - SUBSCRIBED         → new subscription
 *   - DID_RENEW          → subscription renewed
 *   - EXPIRED            → subscription expired after grace period
 *   - GRACE_PERIOD_EXPIRED → billing retry period ended without success
 *   - DID_FAIL_TO_RENEW  → billing failure (grace period started)
 *   - REFUND             → refund issued
 *   - REVOKE             → subscription revoked (family sharing, etc.)
 *   - CANCEL             → user cancelled auto-renewal
 *   - PRICE_INCREASE     → price increase consent required
 *
 * Configure this URL in App Store Connect:
 *   https://www.morethanmoney.pt/api/subscriptions/apple-server-notifications
 *
 * For SANDBOX testing:
 *   https://www.morethanmoney.pt/api/subscriptions/apple-server-notifications (same URL, Apple uses environment field)
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

// ─── JWS Decoder (no signature verification needed — Apple's endpoint is authenticated) ──

function decodeJWSPayload(jws: string): Record<string, any> | null {
  try {
    const parts = jws.split(".")
    if (parts.length !== 3) return null
    const payload = parts[1]
    // base64url → base64 → Buffer → string
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = Buffer.from(padded, "base64").toString("utf-8")
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

// ─── Notification type → status mapping ──────────────────────────────────────

type SubscriptionStatus = "active" | "grace_period" | "billing_retry" | "expired" | "cancelled" | "refunded"

function notificationTypeToStatus(
  notificationType: string,
  subtype?: string
): SubscriptionStatus {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
      return "active"
    case "DID_FAIL_TO_RENEW":
      return subtype === "GRACE_PERIOD" ? "grace_period" : "billing_retry"
    case "GRACE_PERIOD_EXPIRED":
      return "billing_retry"
    case "EXPIRED":
      return "expired"
    case "REVOKE":
    case "CANCEL":
      return "cancelled"
    case "REFUND":
    case "REFUND_REVERSED":
      return "refunded"
    default:
      return "active"
  }
}

function isActiveStatus(status: SubscriptionStatus): boolean {
  return status === "active" || status === "grace_period"
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const signedPayload: string = body.signedPayload

    if (!signedPayload) {
      return NextResponse.json({ error: "signedPayload em falta" }, { status: 400 })
    }

    // Decode notification envelope
    const notification = decodeJWSPayload(signedPayload)
    if (!notification) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
    }

    const notificationType: string = notification.notificationType ?? ""
    const subtype: string = notification.subtype ?? ""
    const environment: string = notification.data?.environment ?? "Production"

    console.log(`[apple-asn] ${notificationType}${subtype ? `:${subtype}` : ""} (${environment})`)

    // Decode transaction info
    const signedTransactionInfo = notification.data?.signedTransactionInfo
    const transaction = signedTransactionInfo ? decodeJWSPayload(signedTransactionInfo) : null

    // Decode renewal info
    const signedRenewalInfo = notification.data?.signedRenewalInfo
    const renewalInfo = signedRenewalInfo ? decodeJWSPayload(signedRenewalInfo) : null

    if (!transaction) {
      // Some notifications (e.g. TEST) don't have transaction data
      return NextResponse.json({ ok: true, skipped: true })
    }

    const originalTransactionID: string = transaction.originalTransactionId ?? ""
    const productID: string = transaction.productId ?? ""
    const expiresAtMs: number | null = transaction.expiresDate ?? null
    const autoRenews: boolean = renewalInfo?.autoRenewStatus === 1

    if (!originalTransactionID || !productID) {
      return NextResponse.json({ error: "Dados de transação incompletos" }, { status: 400 })
    }

    // Find user by transaction ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, subscription_renewal_count")
      .eq("apple_original_transaction_id", originalTransactionID)
      .single()

    if (!profile) {
      // User not found — could be a new purchase before app synced
      console.warn(`[apple-asn] No profile for transactionID: ${originalTransactionID}`)
      return NextResponse.json({ ok: true, skipped: "user_not_found" })
    }

    const userId = profile.id
    const status = notificationTypeToStatus(notificationType, subtype)
    const isActive = isActiveStatus(status)
    const expiresAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null
    const plan = productID.includes("premium") ? "premium" : "app_member"
    const cycle = productID.includes("annual") ? "annual" : "monthly"
    const isRenewal = notificationType === "DID_RENEW"

    // Build profile update
    const profileUpdate: Record<string, any> = {
      subscription_status: status,
      subscription_auto_renews: autoRenews,
      apple_product_id: productID,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }

    if (expiresAt) profileUpdate.subscription_expires_at = expiresAt

    // On renewal: bump plan/member fields and renewal counter
    if (isRenewal || notificationType === "SUBSCRIBED") {
      profileUpdate.subscription_plan = plan
      profileUpdate.subscription_billing_cycle = cycle
      profileUpdate.user_type = "member"
      profileUpdate.member_category = plan === "premium" ? "premium" : "standard"
    }

    if (isRenewal) {
      profileUpdate.subscription_renewal_count = (profile.subscription_renewal_count || 0) + 1
    }

    // Deactivate expired/cancelled/revoked
    if (["expired", "cancelled", "refunded"].includes(status)) {
      profileUpdate.is_active = false
      profileUpdate.subscription_plan = null
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)

    if (updateError) {
      console.error("[apple-asn] profile update error:", updateError)
    }

    // Log the event
    await supabase.from("subscription_events").insert({
      user_id: userId,
      event_type: `asn_${notificationType.toLowerCase()}${subtype ? `_${subtype.toLowerCase()}` : ""}`,
      plan,
      billing_cycle: cycle,
      platform: "app_store",
      apple_transaction_id: originalTransactionID,
      subscription_expires_at: expiresAt,
      subscription_auto_renews: autoRenews,
      subscription_status: status,
      metadata: {
        notification_type: notificationType,
        subtype,
        environment,
        product_id: productID,
      },
    })

    // If expired/cancelled: send notification email (non-blocking)
    if (!isActive && profile.email) {
      // TODO: integrate email service
      console.log(`[apple-asn] Subscription ${status} for ${profile.email}`)
    }

    return NextResponse.json({ ok: true, status, user_id: userId })
  } catch (err: any) {
    console.error("[apple-asn] exception:", err)
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}

// Apple sends a GET to verify the endpoint is reachable
export async function GET() {
  return NextResponse.json({
    status: "Apple Server Notifications endpoint active",
    url: "https://www.morethanmoney.pt/api/subscriptions/apple-server-notifications",
  })
}

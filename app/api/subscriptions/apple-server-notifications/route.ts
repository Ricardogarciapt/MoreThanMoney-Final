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
import {
  appleMlmContext,
  applePaymentReference,
  processMlmSubscriptionRenewal,
  processMlmSubscriptionSignup,
} from "@/lib/mlm-subscription-integration"
import { sendNewMemberWelcomeIfEligible } from "@/lib/new-member-welcome"
import { verifyAppleNotification, verifyAppleTransaction } from '@/lib/apple-iap-verify'

const supabase = getSupabaseAdmin()

/**
 * A ASSINATURA PASSA A SER VERIFICADA. Antes não era, e o comentário que aqui estava dizia
 * «no signature verification needed — Apple's endpoint is authenticated». Isso é falso: este
 * endereço é público e qualquer pessoa lhe pode fazer um POST.
 *
 * O que isso permitia, em concreto: um payload forjado com um `originalTransactionId` à escolha
 * activava uma subscrição, marcava-a como paga e — desde 26/09, em que o Apple IAP passou a
 * escrever no livro de vendas — criava a comissão correspondente. Dinheiro a sair por um pedido
 * HTTP que qualquer um consegue fazer.
 *
 * NÃO SE APAGOU ESTA ROTA, e é de propósito: não está confirmado qual das duas o App Store
 * Connect está a chamar, e apagar a que a Apple usa perde renovações e cancelamentos EM SILÊNCIO —
 * a subscrição de um cliente expirava sem ninguém dar por isso. Fecha-se o buraco, mantêm-se as
 * duas vivas, e retira-se esta quando se confirmar o que está configurado na Apple.
 */

// O descodificador que lia o JWS SEM verificar a assinatura foi apagado daqui, e não apenas
// deixado de usar. Uma função destas, esquecida num ficheiro, é reaproveitada por quem passar por
// cá a precisar de «só espreitar o payload» — e o buraco volta pela mão de alguém de boa fé.

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
    // A verificação é a mesma do `/api/apple/iap/webhook` — uma casa, uma forma de confiar na Apple.
    const notification = await verifyAppleNotification(signedPayload)
    if (!notification) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
    }

    const notificationType: string = notification.notificationType ?? ""
    const subtype: string = notification.subtype ?? ""
    const environment: string = notification.data?.environment ?? "Production"

    console.log(`[apple-asn] ${notificationType}${subtype ? `:${subtype}` : ""} (${environment})`)

    // Decode transaction info
    const signedTransactionInfo = notification.data?.signedTransactionInfo
    const transaction = signedTransactionInfo ? await verifyAppleTransaction(signedTransactionInfo) : null

    // Decode renewal info
    const signedRenewalInfo = notification.data?.signedRenewalInfo
    const renewalInfo = signedRenewalInfo ? await verifyAppleTransaction(signedRenewalInfo) : null

    if (!transaction) {
      // Some notifications (e.g. TEST) don't have transaction data
      return NextResponse.json({ ok: true, skipped: true })
    }

    const originalTransactionID: string = transaction.originalTransactionId ?? ""
    const transactionID: string = String(transaction.transactionId ?? originalTransactionID)
    const productID: string = transaction.productId ?? ""
    const expiresAtMs: number | null = transaction.expiresDate ?? null
    const autoRenews: boolean = renewalInfo?.autoRenewStatus === 1

    if (!originalTransactionID || !productID) {
      return NextResponse.json({ error: "Dados de transação incompletos" }, { status: 400 })
    }

    // Find user by transaction ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, subscription_renewal_count, mlm_sponsor_username, subscription_plan")
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

    // MLM: signup ou renovação
    if (isActive && (notificationType === "SUBSCRIBED" || isRenewal)) {
      try {
        const mlmCtx = appleMlmContext(productID, plan)
        if (isRenewal) {
          await processMlmSubscriptionRenewal(supabase, {
            userId,
            sponsorUsername: profile.mlm_sponsor_username,
            planId: mlmCtx.planId,
            amountCents: mlmCtx.amountCents,
            currency: mlmCtx.currency,
            paymentReference: applePaymentReference("renewal", transactionID),
          })
        } else if (notificationType === "SUBSCRIBED") {
          await processMlmSubscriptionSignup(supabase, {
            userId,
            planId: mlmCtx.planId,
            amountCents: mlmCtx.amountCents,
            currency: mlmCtx.currency,
            paymentReference: applePaymentReference("purchase", transactionID),
            platform: "app_store",
          })
          void sendNewMemberWelcomeIfEligible({
            userId,
            source: "app_store",
            planId: mlmCtx.planId,
            notifyTeam: true,
            eventId: `apple_asn_${transactionID}`,
          })
        }
      } catch (mlmErr) {
        console.error("[apple-asn] MLM error:", mlmErr)
      }
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

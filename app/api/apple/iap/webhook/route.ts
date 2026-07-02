import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { verifyAppleTransaction, verifyAppleNotification } from '@/lib/apple-iap-verify'
import {
  appleMlmContext,
  applePaymentReference,
  processMlmSubscriptionRenewal,
  processMlmSubscriptionSignup,
} from '@/lib/mlm-subscription-integration'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'

const supabase = getSupabaseAdmin()

// POST /api/apple/iap/webhook
// Recebe notificações do App Store Server (renovações, cancelamentos, etc.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const signedPayload = body.signedPayload as string
    if (!signedPayload) {
      return NextResponse.json({ error: 'signedPayload obrigatório' }, { status: 400 })
    }

    // Verificação CRIPTOGRÁFICA da notificação assinada (App Store Server V2).
    const notification = await verifyAppleNotification(signedPayload)
    if (!notification) {
      return NextResponse.json({ error: 'Assinatura da notificação inválida' }, { status: 400 })
    }

    const notificationType = notification.notificationType as string
    const subtype          = notification.subtype as string | undefined
    const data             = notification.data as Record<string, unknown> | undefined

    console.log(`[APPLE-WEBHOOK] ${notificationType}/${subtype ?? '-'}`)

    if (!data) {
      return NextResponse.json({ ok: true })
    }

    const signedTransactionInfo = data.signedTransactionInfo as string | undefined
    const tx      = signedTransactionInfo ? await verifyAppleTransaction(signedTransactionInfo) : null

    if (!tx) {
      return NextResponse.json({ ok: true })
    }

    const originalTxId = String(tx.originalTransactionId ?? tx.original_transaction_id ?? '')
    const transactionId = String(tx.transactionId ?? tx.transaction_id ?? originalTxId)
    const productId    = tx.productId    as string
    const expiresDateMs = (tx.expiresDate ?? tx.expires_date_ms ?? 0) as number
    const expiresAt    = expiresDateMs ? new Date(expiresDateMs).toISOString() : null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, subscription_renewal_count, mlm_sponsor_username')
      .eq('apple_original_transaction_id', originalTxId)
      .maybeSingle()

    if (!profile) {
      console.warn(`[APPLE-WEBHOOK] Utilizador não encontrado para tx=${originalTxId}`)
      return NextResponse.json({ ok: true })
    }

    const userId = profile.id
    const isRenewal = notificationType === 'DID_RENEW'

    switch (notificationType) {
      case 'DID_RENEW':
      case 'SUBSCRIBED':
      case 'DID_CHANGE_RENEWAL_STATUS': {
        if (subtype !== 'AUTO_RENEW_DISABLED') {
          const profileUpdate: Record<string, unknown> = {
            subscription_status:     'active',
            subscription_expires_at: expiresAt,
            next_billing_at:         expiresAt,
            is_active:               true,
            subscription_platform:   'app_store',
            updated_at:              new Date().toISOString(),
          }
          if (isRenewal) {
            profileUpdate.subscription_renewal_count =
              (profile.subscription_renewal_count || 0) + 1
          }
          await supabase.from('profiles').update(profileUpdate).eq('id', userId)
        } else {
          await supabase.from('profiles').update({
            next_billing_at: null,
            updated_at:      new Date().toISOString(),
          }).eq('id', userId)
        }
        break
      }

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED': {
        await supabase.from('profiles').update({
          subscription_status: 'expired',
          is_active:           false,
          updated_at:          new Date().toISOString(),
        }).eq('id', userId)
        break
      }

      case 'REFUND':
      case 'REVOKE': {
        await supabase.from('profiles').update({
          subscription_status:     'cancelled',
          is_active:               false,
          subscription_expires_at: new Date().toISOString(),
          updated_at:              new Date().toISOString(),
        }).eq('id', userId)
        break
      }

      case 'DID_CHANGE_RENEWAL_PREF': {
        if (productId) {
          const { productToSubscriptionPlan } = await import('@/lib/apple-iap')
          const { plan, category, billing }   = productToSubscriptionPlan(productId)
          await supabase.from('profiles').update({
            subscription_plan:          plan,
            member_category:            category,
            subscription_billing_cycle: billing,
            updated_at:                 new Date().toISOString(),
          }).eq('id', userId)
        }
        break
      }

      default:
        console.log(`[APPLE-WEBHOOK] Tipo não tratado: ${notificationType}`)
    }

    if (productId && (notificationType === 'DID_RENEW' || notificationType === 'SUBSCRIBED')) {
      try {
        const mlmCtx = appleMlmContext(productId)
        if (isRenewal) {
          await processMlmSubscriptionRenewal(supabase, {
            userId,
            sponsorUsername: profile.mlm_sponsor_username,
            planId: mlmCtx.planId,
            amountCents: mlmCtx.amountCents,
            currency: mlmCtx.currency,
            paymentReference: applePaymentReference('renewal', transactionId),
          })
        } else {
          await processMlmSubscriptionSignup(supabase, {
            userId,
            planId: mlmCtx.planId,
            amountCents: mlmCtx.amountCents,
            currency: mlmCtx.currency,
            paymentReference: applePaymentReference('purchase', transactionId),
            platform: 'apple',
          })
          if (notificationType === 'SUBSCRIBED') {
            void sendNewMemberWelcomeIfEligible({
              userId,
              source: 'app_store',
              planId: mlmCtx.planId,
              notifyTeam: true,
              eventId: `apple_webhook_${transactionId}`,
            })
          }
        }
      } catch (mlmErr) {
        console.error('[APPLE-WEBHOOK] MLM error:', mlmErr)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[APPLE-WEBHOOK] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

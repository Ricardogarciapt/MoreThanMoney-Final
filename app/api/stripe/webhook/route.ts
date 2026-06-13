// /api/stripe/webhook/route.ts
// Handles all Stripe webhook events — subscriptions, payments, cancellations

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendScannerAccessEmail, sendMTMcopierSetupNotification } from '@/lib/email-service'
import { sanitizeEnv } from '@/lib/env-sanitize'
import { getStripeClient } from '@/lib/stripe-client'
import {
  getPlanIdFromPriceId,
  memberCategoryForPlan,
  normalizeSubscriptionPlan,
} from '@/lib/stripe-prices'
import {
  handlePremiumStripeSkoolGrant,
  isPremiumStripePlan,
  notifyAdminsStripeSkoolAction,
} from '@/lib/stripe-skool-admin'
import { processMlmCheckoutCommission } from '@/lib/mlm-checkout-commission'
import { upsertSponsorNode } from '@/lib/mlm-tree'
import {
  notifyAdminsVipsNewSale,
  notifySponsorNewClient,
  notifySponsorTeamRenewal,
  resolveSponsorUsername,
} from '@/lib/notifications-sales'

// Nomes amigáveis dos scanners por planId (para o email de instruções TradingView)
const SCANNER_PLAN_NAMES: Record<string, string> = {
  goldkiller_lifetime: 'Scanner Gold Killer (Vitalício)',
  mtm_scanner_monthly: 'Scanner MTM V3.4 (Mensal)',
  mtm_scanner_lifetime: 'Scanner MTM V3.4 (Vitalício)',
  scanners_monthly: 'Pack Total de Scanners MTM (Mensal)',
  scanners_semestral: 'Pack Total de Scanners MTM (Semestral)',
  scanners_lifetime: 'Pack Total de Scanners MTM (Vitalício — inclui Sensei X)',
}

const stripe = getStripeClient()
const supabase = createClient(
  sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, sanitizeEnv(process.env.STRIPE_WEBHOOK_SECRET))
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency — skip already processed events
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .single()

  if (existing) {
    return NextResponse.json({ received: true, skipped: true })
  }

  // Record event
  await supabase.from('stripe_events').insert({ id: event.id, type: event.type, data: event.data })

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id

  // Registo novo: conta ainda não existe — complete-registration trata o perfil
  if (!userId && session.metadata?.pending_registration === 'true') {
    await supabase
      .from('checkout_sessions')
      .upsert(
        {
          stripe_session_id: session.id,
          plan: session.metadata?.plan || 'unknown',
          status: 'paid_pending_account',
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'stripe_session_id' }
      )
      .then(undefined, () => {})

    try {
      await processMlmCheckoutCommission(supabase, session, null)
    } catch (mlmErr) {
      console.error('[MLM] Erro no registo novo (pending_registration):', mlmErr)
    }
    return
  }

  // Checkout guest de scanner (sem conta MTM)
  if (!userId && session.metadata?.source === 'scanner_guest_checkout') {
    const tvUsername = session.metadata?.tradingview_username
    const planId = session.metadata?.plan
    const guestEmail = session.metadata?.email || session.customer_details?.email

    if (guestEmail && tvUsername && planId && SCANNER_PLAN_NAMES[planId]) {
      try {
        await sendScannerAccessEmail(
          guestEmail,
          'Trader',
          SCANNER_PLAN_NAMES[planId],
          tvUsername
        )
      } catch (err) {
        console.error('Erro ao enviar email de scanner (guest):', err)
      }
    }
    return
  }

  if (!userId) return

  await supabase
    .from('checkout_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('stripe_session_id', session.id)

  // Compra de scanner com username TradingView → enviar email com instruções de acesso
  const tvUsername = session.metadata?.tradingview_username
  const planId = session.metadata?.plan
  if (tvUsername && planId && SCANNER_PLAN_NAMES[planId]) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      if (profile?.email) {
        await sendScannerAccessEmail(
          profile.email,
          profile.full_name || 'Trader',
          SCANNER_PLAN_NAMES[planId],
          tvUsername
        )
      }

      // Guardar o username TradingView no perfil para referência/gestão de acessos
      await supabase
        .from('profiles')
        .update({ tradingview_username: tvUsername })
        .eq('id', userId)
        .then(undefined, () => {/* coluna pode não existir ainda — não bloquear o fluxo */})
    } catch (err) {
      console.error('Erro ao enviar email de acesso ao scanner:', err)
    }
  }

  // Addon MTMcopier (Telegram → MT5) — notificar a equipa para finalizar o onboarding manual
  if (planId === 'mtmcopy_addon_monthly') {
    try {
      const { activateMtmcopySubscription } = await import('@/lib/mtmcopy/subscription')
      const periodEnd = session.subscription
        ? undefined
        : new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString()
      await activateMtmcopySubscription(userId, periodEnd ?? null)

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      const { data: existingConns } = await supabase
        .from('mtmcopy_connections')
        .select('telegram_channel, mt5_server, mt5_login_last4')
        .eq('user_id', userId)
        .neq('mt5_status', 'disconnected')

      const primaryConn = existingConns?.[0]

      if (existingConns?.length) {
        await supabase
          .from('mtmcopy_connections')
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .neq('mt5_status', 'disconnected')
      }

      if (profile?.email) {
        await sendMTMcopierSetupNotification(
          profile.email,
          profile.full_name || 'Trader',
          primaryConn?.telegram_channel,
          primaryConn?.mt5_server,
          primaryConn?.mt5_login_last4
        )
      }
    } catch (err) {
      console.error('Erro ao processar activação do MTMcopier:', err)
    }
  }

  if (session.mode === 'payment') {
    const pack = session.metadata?.pack
    const expiresAt = pack === '65'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('profiles').update({
      stripe_customer_id: session.customer as string,
      subscription_status: 'active',
      subscription_plan: `pack_${pack}`,
      subscription_platform: 'stripe',
      checkout_source: 'stripe',
      is_active: true,
      subscription_expires_at: expiresAt,
      last_payment_at: new Date().toISOString(),
      payment_failed_count: 0,
    }).eq('id', userId)

    await supabase.from('payment_history').insert({
      user_id: userId,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      plan: `pack_${pack}`,
      billing_cycle: 'one_time',
      source: 'stripe',
    })

  } else if (session.mode === 'subscription') {
    const planId = session.metadata?.plan || 'app_member_monthly'
    const couponCodeWebhook = (session.metadata?.coupon_code || '').trim().toUpperCase()
    const subscriptionUpdate: Record<string, unknown> = {
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      subscription_plan: normalizeSubscriptionPlan(planId),
      member_category: memberCategoryForPlan(planId),
      subscription_status: 'active',
      subscription_platform: 'stripe',
      checkout_source: 'stripe',
      is_active: true,
      payment_failed_count: 0,
      last_payment_at: new Date().toISOString(),
    }
    if (couponCodeWebhook) subscriptionUpdate.coupon_code = couponCodeWebhook
    await supabase.from('profiles').update(subscriptionUpdate).eq('id', userId)

    if (isPremiumStripePlan(planId)) {
      try {
        await handlePremiumStripeSkoolGrant(supabase, userId, planId)
      } catch (err) {
        console.error('[SKOOL-ADMIN] Erro no alerta pós-checkout premium:', err)
      }
    }
  }

  try {
    await processMlmCheckoutCommission(supabase, session, userId)
  } catch (mlmErr) {
    console.error('[MLM] Erro ao processar MLM:', mlmErr)
  }

  // Notificar liderança + sponsor (fire-and-forget)
  try {
    const planId = session.metadata?.plan || 'app_member_monthly'
    const { data: saleMemberProfile } = await supabase
      .from('profiles')
      .select('full_name, mlm_sponsor_username')
      .eq('id', userId)
      .single()
    const memberName = saleMemberProfile?.full_name || session.metadata?.full_name || 'Novo Membro'
    const amountEur = (session.amount_total || 0) / 100
    const eventId = `checkout_${session.id}`
    void notifyAdminsVipsNewSale({ name: memberName, planId, amountEur, eventId })
    const sponsorUsername = resolveSponsorUsername(
      saleMemberProfile?.mlm_sponsor_username,
      session.metadata?.sponsor_username,
    )
    if (sponsorUsername) {
      void notifySponsorNewClient({
        sponsorUsername,
        clientName: memberName,
        planId,
        eventId: `${eventId}_client`,
      })
    }
  } catch (notifErr) {
    console.error('[NOTIF] Erro ao notificar nova venda:', notifErr)
  }
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, username')
    .eq('stripe_customer_id', sub.customer as string)
    .single()

  if (!profile) return

  const item = sub.items.data[0]
  const priceId = item?.price?.id || ''
  const planId = getPlanIdFromPriceId(priceId) || item?.price?.metadata?.plan || 'app_member_monthly'
  const plan = normalizeSubscriptionPlan(planId)
  const billingCycle = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly'
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

  await supabase.from('profiles').update({
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId || null,
    subscription_status: sub.status === 'active' ? 'active' : sub.status,
    subscription_plan: plan,
    member_category: memberCategoryForPlan(planId),
    subscription_billing_cycle: billingCycle,
    subscription_platform: 'stripe',
    subscription_expires_at: periodEnd,
    next_billing_at: periodEnd,
    subscription_auto_renew: !sub.cancel_at_period_end,
    is_active: sub.status === 'active' || sub.status === 'trialing',
    payment_failed_count: 0,
  }).eq('id', profile.id)

  if (
    isPremiumStripePlan(planId) &&
    (sub.status === 'active' || sub.status === 'trialing')
  ) {
    try {
      await handlePremiumStripeSkoolGrant(supabase, profile.id, planId)
    } catch (err) {
      console.error('[SKOOL-ADMIN] Erro no alerta subscription.updated:', err)
    }
  }
}

async function handleSubscriptionCanceled(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, member_category, subscription_plan, subscription_platform')
    .eq('stripe_customer_id', sub.customer as string)
    .single()

  if (!profile) return

  const wasPremiumStripe =
    profile.subscription_platform === 'stripe' &&
    (profile.member_category === 'premium' || profile.subscription_plan === 'premium')

  await supabase.from('profiles').update({
    subscription_status: 'canceled',
    is_active: false,
    access_revoked_at: new Date().toISOString(),
    inactive_reason: 'subscription_canceled',
    inactive_since: new Date().toISOString(),
    subscription_auto_renew: false,
  }).eq('id', profile.id)

  if (wasPremiumStripe && profile.email) {
    try {
      await notifyAdminsStripeSkoolAction(supabase, {
        action: 'revoke',
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        username: profile.username,
        planId: profile.subscription_plan || 'premium',
      })
    } catch (err) {
      console.error('[SKOOL-ADMIN] Erro no alerta de cancelamento:', err)
    }
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, mlm_sponsor_username, subscription_renewal_count')
    .eq('stripe_customer_id', invoice.customer as string)
    .single()

  if (!profile) return

  await supabase.from('profiles').update({
    subscription_status: 'active',
    is_active: true,
    last_payment_at: new Date().toISOString(),
    payment_failed_count: 0,
    subscription_renewal_count: (profile.subscription_renewal_count || 0) + 1,
  }).eq('id', profile.id)

  await supabase.from('payment_history').insert({
    user_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    billing_cycle: 'renewal',
    source: 'stripe',
  })

  // ── MLM: comissão residual mensal ao patrocinador ───────────────────────
  // Só em renovações (billing_reason === 'subscription_cycle')
  // e apenas se o pagamento tem valor real (> 0)
  if (
    invoice.billing_reason === 'subscription_cycle' &&
    invoice.amount_paid > 0 &&
    profile.mlm_sponsor_username
  ) {
    try {
      const { data: mlmSettings } = await supabase
        .from('mlm_settings')
        .select('is_active, direct_commission_pct')
        .eq('id', 1)
        .single()

      if (mlmSettings?.is_active) {
        const { data: sponsor } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', profile.mlm_sponsor_username.trim())
          .single()

        if (sponsor) {
          const commissionPct = (mlmSettings.direct_commission_pct || 20) / 100
          const commissionAmount = parseFloat(((invoice.amount_paid / 100) * commissionPct).toFixed(2))
          const planLabel = (invoice.lines?.data?.[0]?.price?.metadata?.plan)
            || (invoice.subscription as string)
            || 'renewal'

          // Verificar idempotência — não duplicar por invoice
          const { data: existing } = await supabase
            .from('mlm_commissions')
            .select('id')
            .eq('stripe_invoice_id', invoice.id)
            .maybeSingle()

          if (!existing) {
            await supabase.from('mlm_commissions').insert({
              beneficiary_id: sponsor.id,
              from_user_id: profile.id,
              type: 'monthly_residual',
              amount: commissionAmount,
              currency: invoice.currency?.toUpperCase() || 'EUR',
              source_plan: planLabel,
              stripe_invoice_id: invoice.id,
              source_amount_cents: invoice.amount_paid,
              status: 'pending',
              payout_status: 'pending',
            })

            // Actualizar pending_commissions do patrocinador
            const { data: sponsorNode } = await supabase
              .from('mlm_nodes')
              .select('id, pending_commissions')
              .eq('user_id', sponsor.id)
              .maybeSingle()

            if (sponsorNode) {
              await supabase
                .from('mlm_nodes')
                .update({
                  pending_commissions: (Number(sponsorNode.pending_commissions) || 0) + commissionAmount,
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', sponsor.id)
            } else {
              await supabase.from('mlm_nodes').insert({
                user_id: sponsor.id,
                pending_commissions: commissionAmount,
              }).then(undefined, () => {})
            }

            // Notificar sponsor da renovação da equipa (fire-and-forget)
            void notifySponsorTeamRenewal({
              sponsorId: sponsor.id,
              memberName: (profile as any).full_name || 'Um membro da tua equipa',
              commission: commissionAmount,
              eventId: `renewal_${invoice.id}`,
            })
          }
        }
      }
    } catch (mlmErr) {
      console.error('[MLM] Erro ao criar comissão residual:', mlmErr)
    }
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, payment_failed_count')
    .eq('stripe_customer_id', invoice.customer as string)
    .single()

  if (!profile) return

  const failCount = (profile.payment_failed_count || 0) + 1

  const updates: any = {
    payment_failed_count: failCount,
    subscription_status: failCount >= 3 ? 'unpaid' : 'past_due',
  }

  if (failCount >= 3) {
    updates.is_active = false
    updates.access_revoked_at = new Date().toISOString()
    updates.inactive_reason = 'payment_failed'
    updates.inactive_since = new Date().toISOString()
  }

  await supabase.from('profiles').update(updates).eq('id', profile.id)

  await supabase.from('payment_history').insert({
    user_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    source: 'stripe',
  })
}

export const runtime = 'nodejs'

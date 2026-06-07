// /api/stripe/webhook/route.ts
// Handles all Stripe webhook events — subscriptions, payments, cancellations

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendScannerAccessEmail, sendCopygramSetupNotification } from '@/lib/email-service'

// Nomes amigáveis dos scanners por planId (para o email de instruções TradingView)
const SCANNER_PLAN_NAMES: Record<string, string> = {
  goldkiller_lifetime: 'Scanner Gold Killer (Vitalício)',
  mtm_scanner_monthly: 'Scanner MTM V3.4 (Mensal)',
  mtm_scanner_lifetime: 'Scanner MTM V3.4 (Vitalício)',
  scanners_monthly: 'Pack Total de Scanners MTM (Mensal)',
  scanners_semestral: 'Pack Total de Scanners MTM (Semestral)',
  scanners_lifetime: 'Pack Total de Scanners MTM (Vitalício — inclui Sensei X)',
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
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

  // Addon Copygram (Telegram → MT5) — notificar a equipa para finalizar o onboarding manual
  if (planId === 'mtmcopy_addon_monthly') {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      const { data: existingConn } = await supabase
        .from('mtmcopy_connections')
        .select('telegram_channel, mt5_server, mt5_login_last4')
        .eq('user_id', userId)
        .maybeSingle()

      await supabase
        .from('mtmcopy_connections')
        .upsert({ user_id: userId, is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

      if (profile?.email) {
        await sendCopygramSetupNotification(
          profile.email,
          profile.full_name || 'Trader',
          existingConn?.telegram_channel,
          existingConn?.mt5_server,
          existingConn?.mt5_login_last4
        )
      }
    } catch (err) {
      console.error('Erro ao processar activação do Copygram:', err)
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
    await supabase.from('profiles').update({
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      is_active: true,
      payment_failed_count: 0,
    }).eq('id', userId)
  }
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', sub.customer as string)
    .single()

  if (!profile) return

  const item = sub.items.data[0]
  const plan = item?.price?.metadata?.plan || 'monthly'
  const billingCycle = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly'
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

  await supabase.from('profiles').update({
    stripe_subscription_id: sub.id,
    stripe_price_id: item?.price?.id,
    subscription_status: sub.status === 'active' ? 'active' : sub.status,
    subscription_plan: plan,
    subscription_billing_cycle: billingCycle,
    subscription_platform: 'stripe',
    subscription_expires_at: periodEnd,
    next_billing_at: periodEnd,
    subscription_auto_renew: !sub.cancel_at_period_end,
    is_active: sub.status === 'active' || sub.status === 'trialing',
    payment_failed_count: 0,
  }).eq('id', profile.id)
}

async function handleSubscriptionCanceled(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', sub.customer as string)
    .single()

  if (!profile) return

  await supabase.from('profiles').update({
    subscription_status: 'canceled',
    is_active: false,
    access_revoked_at: new Date().toISOString(),
    inactive_reason: 'subscription_canceled',
    inactive_since: new Date().toISOString(),
    subscription_auto_renew: false,
  }).eq('id', profile.id)
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', invoice.customer as string)
    .single()

  if (!profile) return

  await supabase.from('profiles').update({
    subscription_status: 'active',
    is_active: true,
    last_payment_at: new Date().toISOString(),
    payment_failed_count: 0,
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

// /api/checkout/create-session/route.ts
// Cria Stripe Checkout Session com lógica de routing

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  annual: process.env.STRIPE_PRICE_ANNUAL!,
  pack_65: process.env.STRIPE_PRICE_PACK_65!,
  pack_35: process.env.STRIPE_PRICE_PACK_35!,
}

const SKOOL_CHECKOUT_URL = process.env.SKOOL_CHECKOUT_URL || 'https://www.skool.com/morethanmoney-1132/checkout'

export async function POST(req: NextRequest) {
  try {
    const { userId, email, plan, billingCycle, referralUsername, platform } = await req.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'userId and email required' }, { status: 400 })
    }

    // Pack $65 COM referral → redirecionar para Skool
    if (plan === 'pack_65' && referralUsername) {
      const skoolUrl = `${SKOOL_CHECKOUT_URL}?ref=${encodeURIComponent(referralUsername)}`

      await supabase.from('checkout_sessions').insert({
        user_id: userId,
        plan: 'pack_65',
        billing_cycle: 'one_time',
        pack_price: 65,
        referral_username: referralUsername,
        checkout_source: 'skool',
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      await supabase.from('profiles').update({
        referral_username: referralUsername,
        checkout_source: 'skool',
      }).eq('id', userId)

      return NextResponse.json({ checkout_source: 'skool', skool_url: skoolUrl })
    }

    // Tudo o resto → Stripe Checkout
    let priceId: string
    let mode: 'payment' | 'subscription'

    if (plan === 'pack_65') {
      priceId = PRICE_IDS.pack_65
      mode = 'payment'
    } else if (plan === 'pack_35') {
      priceId = PRICE_IDS.pack_35
      mode = 'payment'
    } else if (billingCycle === 'annual') {
      priceId = PRICE_IDS.annual
      mode = 'subscription'
    } else {
      priceId = PRICE_IDS.monthly
      mode = 'subscription'
    }

    // Obter ou criar Stripe Customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', userId)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: profile?.full_name || undefined,
        metadata: { user_id: userId },
      })
      customerId = customer.id
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId)
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/register?checkout=canceled`,
      metadata: {
        user_id: userId,
        plan: plan || (billingCycle === 'annual' ? 'annual' : 'monthly'),
        pack: plan?.replace('pack_', '') || '',
        referral_username: referralUsername || '',
        platform: platform || 'web',
      },
      allow_promotion_codes: true,
    }

    if (mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: { user_id: userId },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    await supabase.from('checkout_sessions').insert({
      user_id: userId,
      stripe_session_id: session.id,
      plan: plan || billingCycle,
      billing_cycle: mode === 'payment' ? 'one_time' : billingCycle || 'monthly',
      pack_price: plan === 'pack_65' ? 65 : plan === 'pack_35' ? 35 : null,
      referral_username: referralUsername || null,
      checkout_source: 'stripe',
      status: 'pending',
      expires_at: new Date(session.expires_at * 1000).toISOString(),
    })

    return NextResponse.json({
      checkout_source: 'stripe',
      checkout_url: session.url,
      session_id: session.id,
    })

  } catch (err: any) {
    console.error('Checkout session error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { needsAccessRevalidation } from '@/lib/access-migration'

const supabase = getSupabaseAdmin()

const PACK_PLANS = new Set([
  'app_member_monthly',
  'app_member_annual',
  'premium_monthly',
  'premium_annual',
])

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const { planId } = await request.json().catch(() => ({}))
  if (!planId || !PACK_PLANS.has(planId)) {
    return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
  }

  const educatorEmails = new Set<string>()
  const { data: educators } = await supabase.from('lms_educators').select('email')
  for (const e of educators ?? []) {
    const em = (e.email as string | undefined)?.trim().toLowerCase()
    if (em) educatorEmails.add(em)
  }

  if (!needsAccessRevalidation(profile, educatorEmails)) {
    return NextResponse.json({ error: 'Migração já concluída' }, { status: 400 })
  }

  const priceId = requireStripePriceId(planId)
  const stripe = getStripeClient()

  let customerId = profile.stripe_customer_id as string | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email || user.email,
      name: profile.full_name,
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: buildStripeReturnUrl('/access-migration', { success: '1', plan: planId }),
    cancel_url: buildStripeReturnUrl('/access-migration', {}, { includeSessionPlaceholder: false }),
    metadata: {
      user_id: user.id,
      plan: planId,
      access_migration: 'true',
      sponsor_username: (profile.mlm_sponsor_username as string) || '',
    },
  }

  const session = await stripe.checkout.sessions.create(sessionParams)

  return NextResponse.json({ url: session.url, sessionId: session.id })
}

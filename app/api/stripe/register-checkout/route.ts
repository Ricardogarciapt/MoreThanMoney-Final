import { NextRequest, NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe-client'
import { requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl, getSiteOrigin } from '@/lib/site-url'

/**
 * POST /api/stripe/register-checkout
 *
 * Checkout Stripe para NOVO utilizador (conta Supabase criada após pagamento em /success).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planId, email, fullName, username, phone, regToken, sponsorUsername } = body

    if (!planId || !email || !fullName || !username) {
      return NextResponse.json({ error: 'planId, email, fullName e username são obrigatórios' }, { status: 400 })
    }

    const priceId = requireStripePriceId(planId)
    const stripe = getStripeClient()
    const origin = getSiteOrigin()

    const customer = await stripe.customers.create({
      email,
      name: fullName,
      metadata: { pending_registration: 'true', reg_token: regToken || '' },
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: buildStripeReturnUrl('/success', {
        plan: planId,
        reg_token: regToken || '',
        new_user: '1',
      }),
      cancel_url: buildStripeReturnUrl('/register', {}, { includeSessionPlaceholder: false }),
      metadata: {
        pending_registration: 'true',
        reg_token: regToken || '',
        plan: planId,
        email,
        full_name: fullName,
        username,
        phone: phone || '',
        sponsor_username: sponsorUsername || '',
      },
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar sessão de pagamento'
    console.error('❌ [REGISTER-CHECKOUT] Erro:', message, { origin: getSiteOrigin() })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

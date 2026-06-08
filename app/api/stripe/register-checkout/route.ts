import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

/**
 * Price IDs — mesmos que o endpoint create-checkout-session
 */
const PRICE_IDS: Record<string, string> = {
  app_member_monthly:  process.env.STRIPE_PRICE_APP_MEMBER_MONTHLY  || '',
  app_member_annual:   process.env.STRIPE_PRICE_APP_MEMBER_ANNUAL   || '',
  premium_monthly:     process.env.STRIPE_PRICE_PREMIUM_MONTHLY     || '',
  premium_annual:      process.env.STRIPE_PRICE_PREMIUM_ANNUAL      || '',
}

/**
 * POST /api/stripe/register-checkout
 *
 * Cria uma sessão de checkout Stripe para um NOVO utilizador (sem conta Supabase).
 * Não requer autenticação — o utilizador só cria conta APÓS o pagamento ser confirmado.
 *
 * Body: { planId, email, fullName, username, phone, regToken }
 * Returns: { url, sessionId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planId, email, fullName, username, phone, regToken } = body

    if (!planId || !email || !fullName || !username) {
      return NextResponse.json({ error: 'planId, email, fullName e username são obrigatórios' }, { status: 400 })
    }

    const priceId = PRICE_IDS[planId]
    if (!priceId) {
      return NextResponse.json(
        { error: `Plano "${planId}" não encontrado ou preço não configurado` },
        { status: 400 }
      )
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'

    // Criar customer Stripe anónimo (sem Supabase user_id)
    const customer = await stripe.customers.create({
      email,
      name: fullName,
      metadata: { pending_registration: 'true', reg_token: regToken || '' },
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // reg_token passado na success_url para recuperar dados do localStorage
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}&reg_token=${regToken || ''}&new_user=1`,
      cancel_url: `${origin}/register`,
      metadata: {
        pending_registration: 'true',
        reg_token: regToken || '',
        plan: planId,
        email,
        full_name: fullName,
        username,
        phone: phone || '',
      },
      // Pré-preencher email no checkout Stripe
      customer_email: undefined, // customer já tem o email
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })

  } catch (error: any) {
    console.error('❌ [REGISTER-CHECKOUT] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar sessão de pagamento' },
      { status: 500 }
    )
  }
}

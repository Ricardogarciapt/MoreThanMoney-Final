// /api/stripe/scanner-checkout
//
// Checkout de scanners SEM autenticação Supabase obrigatória.
// Utilizado quando o visitante ainda não tem conta (ou não está logado).
// Para utilizadores autenticados, o endpoint create-checkout-session continua a ser usado.
//
// Body: { planId, email, tvUsername }
// Returns: { url, sessionId }

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

const PRICE_IDS: Record<string, string> = {
  goldkiller_lifetime:  process.env.STRIPE_PRICE_GOLDKILLER_LIFETIME  || '',
  mtm_scanner_monthly:  process.env.STRIPE_PRICE_MTM_SCANNER_MONTHLY  || '',
  mtm_scanner_lifetime: process.env.STRIPE_PRICE_MTM_SCANNER_LIFETIME || '',
  scanners_monthly:     process.env.STRIPE_PRICE_SCANNERS_MONTHLY     || '',
  scanners_semestral:   process.env.STRIPE_PRICE_SCANNERS_SEMESTRAL   || '',
  scanners_lifetime:    process.env.STRIPE_PRICE_SCANNERS_LIFETIME    || '',
}

const SUBSCRIPTION_PLANS = new Set(['mtm_scanner_monthly', 'scanners_monthly'])

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { planId, email, tvUsername } = body

    if (!planId || !email) {
      return NextResponse.json(
        { error: 'planId e email são obrigatórios' },
        { status: 400 }
      )
    }

    if (!tvUsername?.trim()) {
      return NextResponse.json(
        { error: 'O nome de utilizador do TradingView é necessário para activar o acesso' },
        { status: 400 }
      )
    }

    const priceId = PRICE_IDS[planId]
    if (!priceId) {
      return NextResponse.json(
        { error: `Plano "${planId}" não encontrado ou preço não configurado` },
        { status: 400 }
      )
    }

    const isSubscription = SUBSCRIPTION_PLANS.has(planId)
    const mode: 'subscription' | 'payment' = isSubscription ? 'subscription' : 'payment'
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'

    // Customer anónimo — sem Supabase user_id
    const customer = await stripe.customers.create({
      email: email.trim(),
      metadata: {
        source: 'scanner_guest_checkout',
        plan: planId,
        tradingview_username: tvUsername.trim(),
      },
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}&message=Scanner+ativado+com+sucesso!`,
      cancel_url: `${origin}/scanner`,
      metadata: {
        source: 'scanner_guest_checkout',
        plan: planId,
        tradingview_username: tvUsername.trim(),
        email: email.trim(),
      },
      // Pré-preencher email no formulário Stripe
      customer_email: undefined, // customer já tem o email
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })

  } catch (error: any) {
    console.error('❌ [SCANNER-CHECKOUT] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar sessão de pagamento' },
      { status: 500 }
    )
  }
}

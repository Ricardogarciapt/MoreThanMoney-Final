import { NextRequest, NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe-client'
import { recusaPlanoDescontinuado, requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl } from '@/lib/site-url'

const SUBSCRIPTION_PLANS = new Set(['mtm_scanner_monthly', 'scanners_monthly'])

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { planId, email, tvUsername, sponsorCode } = body

    if (!planId || !email) {
      return NextResponse.json({ error: 'planId e email são obrigatórios' }, { status: 400 })
    }

    // Planos descontinuados (MTM Copy) não abrem checkout novo.
    const descontinuado = recusaPlanoDescontinuado(planId)
    if (descontinuado) return NextResponse.json(descontinuado, { status: 410 })

    if (!tvUsername?.trim()) {
      return NextResponse.json(
        { error: 'O nome de utilizador do TradingView é necessário para activar o acesso' },
        { status: 400 }
      )
    }

    const priceId = requireStripePriceId(planId)
    const isSubscription = SUBSCRIPTION_PLANS.has(planId)
    const mode: 'subscription' | 'payment' = isSubscription ? 'subscription' : 'payment'
    const stripe = getStripeClient()

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
      success_url: buildStripeReturnUrl('/success', {
        plan: planId,
        message: 'Scanner ativado com sucesso!',
      }),
      cancel_url: buildStripeReturnUrl('/scanner', {}, { includeSessionPlaceholder: false }),
      metadata: {
        source: 'scanner_guest_checkout',
        plan: planId,
        tradingview_username: tvUsername.trim(),
        email: email.trim(),
        sponsor_username: sponsorCode || '',
        ...(request.cookies.get('opinly_anon_id')?.value ? { opinly_anon_id: request.cookies.get('opinly_anon_id')!.value } : {}),
      },
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar sessão de pagamento'
    console.error('❌ [SCANNER-CHECKOUT] Erro:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

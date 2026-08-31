import { NextRequest, NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe-client'
import { requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { getAuthenticatedUser } from '@/lib/admin-api-helpers'
import { normalizarLogin } from '@/lib/licencas'

export const dynamic = 'force-dynamic'

/** Os dois planos vendidos na página do EA. */
const PLANOS = {
  sensei_ea_annual: { modo: 'subscription' as const, nome: 'Licença anual' },
  sensei_ea_lifetime: { modo: 'payment' as const, nome: 'Licença vitalícia' },
}

/**
 * Checkout da página de vendas do MTM Sensei EA.
 *
 * A conta MT5 é pedida aqui, mas não é obrigatória: quem ainda não abriu conta na corretora
 * compra na mesma e a licença prende-se à primeira conta que a usar. Exigir o número antes de
 * o cliente o ter era perder a venda para uma pergunta que se responde depois.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const planId = String(body.planId ?? '')
    const plano = PLANOS[planId as keyof typeof PLANOS]

    if (!plano) return NextResponse.json({ error: 'Plano desconhecido' }, { status: 400 })

    // Se houver sessão, o email da sessão manda — assim a licença cai no utilizador certo em vez
    // de ficar órfã num email escrito à pressa no formulário.
    const sessao = await getAuthenticatedUser()
    const email = (sessao.email || String(body.email ?? '')).trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Indica o teu email' }, { status: 400 })

    const mt5Login = normalizarLogin(body.mt5Login)
    if (mt5Login && (mt5Login.length < 4 || mt5Login.length > 12)) {
      return NextResponse.json({ error: 'O número da conta MT5 não parece válido.' }, { status: 400 })
    }

    const priceId = requireStripePriceId(planId)
    const stripe = getStripeClient()

    const metadata: Record<string, string> = {
      source: 'sensei_ea_checkout',
      plan: planId,
      email,
      mt5_login: mt5Login,
      ...(sessao.userId ? { user_id: sessao.userId } : {}),
    }

    const checkout = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: plano.modo,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: buildStripeReturnUrl('/sensei-ea/obrigado', { plan: planId }),
      cancel_url: buildStripeReturnUrl('/sensei-ea', {}, { includeSessionPlaceholder: false }),
      metadata,
      ...(plano.modo === 'subscription' ? { subscription_data: { metadata } } : {}),
    })

    return NextResponse.json({ url: checkout.url, sessionId: checkout.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar sessão de pagamento'
    console.error('❌ [SENSEI-EA-CHECKOUT]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

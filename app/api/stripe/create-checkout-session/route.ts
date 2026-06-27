import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'

const supabaseAdmin = getSupabaseAdmin()

const SCANNER_LIFETIME_PLANS = new Set([
  'goldkiller_lifetime',
  'mtm_scanner_lifetime',
  'scanners_lifetime',
])

export async function POST(request: NextRequest) {
  try {
    // App iOS: compras têm de ser via Apple In-App Purchase (Guideline 3.1.1)
    if (isIosAppRequest(request)) {
      return NextResponse.json(IOS_IAP_REQUIRED, { status: 403 })
    }
    // Autenticar utilizador
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
    }
    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { planId, email, tradingview_username, sponsorCode } = await request.json()

    if (!planId) {
      return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
    }

    const priceId = requireStripePriceId(planId)
    const stripe = getStripeClient()

    const isLifetime = SCANNER_LIFETIME_PLANS.has(planId) || planId.includes('lifetime') || planId.includes('semestral')
    const mode: 'subscription' | 'payment' = isLifetime ? 'payment' : 'subscription'

    // Obter ou criar customer Stripe
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, email, full_name, mlm_sponsor_username')
      .eq('id', user.id)
      .single()

    const sponsorUsername = (sponsorCode || profile?.mlm_sponsor_username || '').trim()

    let customerId = profile?.stripe_customer_id as string | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || profile?.email || user.email,
        name: profile?.full_name,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const cancelPath = planId === 'mtmcopy_addon_monthly' ? '/mtmcopy' : '/scanner'

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: buildStripeReturnUrl('/success', { plan: planId }),
      cancel_url: buildStripeReturnUrl(cancelPath, {}, { includeSessionPlaceholder: false }),
      metadata: {
        user_id: user.id,
        plan: planId,
        ...(tradingview_username ? { tradingview_username } : {}),
        sponsor_username: sponsorUsername,
      },
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    // Registar sessão de checkout (não bloquear se a tabela ainda não existir)
    const { error: insertError } = await supabaseAdmin.from('checkout_sessions').insert({
      stripe_session_id: session.id,
      user_id: user.id,
      plan: planId,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    if (insertError) {
      console.warn('⚠️ [CHECKOUT] checkout_sessions insert:', insertError.message)
    }

    return NextResponse.json({ url: session.url, sessionId: session.id })

  } catch (error: any) {
    console.error('❌ [CHECKOUT] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar sessão de pagamento' },
      { status: 500 }
    )
  }
}

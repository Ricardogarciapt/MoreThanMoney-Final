import { NextRequest, NextResponse } from 'next/server'
import { opinlyTrack } from '@/lib/opinly/track'
import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { recusaPlanoDescontinuado, requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl } from '@/lib/site-url'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'

const supabaseAdmin = getSupabaseAdmin()

const SCANNER_LIFETIME_PLANS = new Set([
  'goldkiller_lifetime',
  'aurumflow_lifetime',
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

    // MTM Copy descontinuado: 410 Gone, com a mensagem a apontar para o MTM Auto.
    const descontinuado = recusaPlanoDescontinuado(planId)
    if (descontinuado) {
      return NextResponse.json(descontinuado, { status: 410 })
    }

    const priceId = requireStripePriceId(planId)
    const stripe = getStripeClient()

    const isLifetime = SCANNER_LIFETIME_PLANS.has(planId) || planId.includes('lifetime') || planId.includes('semestral')
    const mode: 'subscription' | 'payment' = isLifetime ? 'payment' : 'subscription'

    // Obter ou criar customer Stripe
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, email, full_name, mlm_sponsor_username, subscription_platform, subscription_status')
      .eq('id', user.id)
      .single()

    // Guard cross-canal: não abrir checkout Stripe a quem já tem subscrição ATIVA
    // gerida pela loja (Apple/Google) — evita dupla cobrança. Muda-se na respetiva loja.
    if (mode === 'subscription' && profile?.subscription_status === 'active' &&
        (profile?.subscription_platform === 'app_store' || profile?.subscription_platform === 'google_play')) {
      const store = profile.subscription_platform === 'app_store' ? 'App Store' : 'Google Play'
      return NextResponse.json({
        error: `Já tens uma subscrição ativa gerida pela ${store}. Para mudar de pack, faz upgrade/downgrade na ${store} (Definições → Subscrições).`,
        code: 'managed_by_store',
      }, { status: 409 })
    }

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

    const cancelPath = '/scanner'

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
        // anonId do pixel Opinly: o webhook usa-o para atribuir a compra ao visitante
        ...(request.cookies.get('opinly_anon_id')?.value
          ? { opinly_anon_id: request.cookies.get('opinly_anon_id')!.value }
          : {}),
      },
    }

    // Intro offer: 1º mês Premium a 34,99€ (desconto único), só no plano premium mensal
    // e só para quem ainda não é Premium ativo (evita reaplicar a subscritores atuais).
    if (planId === 'premium_monthly' && profile?.subscription_status !== 'active') {
      sessionParams.discounts = [{ coupon: 'INTRO_PREMIUM_1M' }]
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    // Funil Opinly: inicio de checkout (best-effort; anonId via cookie do pixel)
    await opinlyTrack('begin_checkout', { plan: planId }, {
      externalEventId: `bc_${session.id}`,
      email: profile?.email ?? user.email ?? undefined,
      anonId: request.cookies.get('opinly_anon_id')?.value,
    })

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

import { NextRequest, NextResponse } from 'next/server'
import { opinlyTrack } from '@/lib/opinly/track'
import { getStripeClient } from '@/lib/stripe-client'
import { recusaPlanoDescontinuado, requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl, getSiteOrigin } from '@/lib/site-url'
import { resolveStripePromotionCode } from '@/lib/coupon-stripe-discount'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'
import type Stripe from 'stripe'

/**
 * POST /api/stripe/register-checkout
 *
 * Checkout Stripe para NOVO utilizador (conta Supabase criada após pagamento em /success).
 */
export async function POST(request: NextRequest) {
  try {
    if (isIosAppRequest(request)) {
      return NextResponse.json(IOS_IAP_REQUIRED, { status: 403 })
    }
    const body = await request.json()
    const { planId, email, fullName, username, phone, regToken, sponsorUsername, couponCode, trial } = body

    if (!planId || !email || !fullName || !username) {
      return NextResponse.json({ error: 'planId, email, fullName e username são obrigatórios' }, { status: 400 })
    }

    // Planos descontinuados (MTM Copy) não abrem checkout novo.
    const descontinuado = recusaPlanoDescontinuado(planId)
    if (descontinuado) return NextResponse.json(descontinuado, { status: 410 })

    // Trial de 3 dias COM cartão: recolhe o método de pagamento no registo, não cobra
    // nos 3 dias, e ao fim cobra o 1º mês a 34,99€ (intro). Cancela quando quiser.
    const isTrial = trial === true && planId === 'premium_monthly'

    const priceId = requireStripePriceId(planId)
    const stripe = getStripeClient()
    const origin = getSiteOrigin()

    const customer = await stripe.customers.create({
      email,
      name: fullName,
      metadata: { pending_registration: 'true', reg_token: regToken || '' },
    })

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
        ...(request.cookies.get('opinly_anon_id')?.value ? { opinly_anon_id: request.cookies.get('opinly_anon_id')!.value } : {}),
        phone: phone || '',
        sponsor_username: sponsorUsername || '',
        coupon_code: couponCode || '',
        is_trial: isTrial ? '1' : '',
      },
    }

    if (isTrial) {
      // 3 dias grátis (sem cobrança) → depois 1º mês 34,99€ (INTRO_PREMIUM_1M), renova 65€.
      // Cartão obrigatório para poder cobrar ao fim dos 3 dias.
      sessionParams.subscription_data = { trial_period_days: 3 }
      sessionParams.discounts = [{ coupon: 'INTRO_PREMIUM_1M' }]
      sessionParams.payment_method_collection = 'always'
    } else if (couponCode) {
      const promoId = await resolveStripePromotionCode(couponCode)
      if (promoId) {
        sessionParams.discounts = [{ promotion_code: promoId }]
      } else {
        // Sem promo code Stripe configurado — verificar tipo do cupão na DB
        const { data: couponRow } = await getSupabaseAdmin()
          .from('coupons')
          .select('type, discount_value')
          .eq('code', couponCode.trim().toUpperCase())
          .eq('is_active', true)
          .maybeSingle()

        // Cupão de PARCERIA (creator/UGC): concede acesso pelo prazo do cupão SEM cartão.
        // NÃO deve criar checkout Stripe — o cliente resgata via /api/partnership/redeem.
        if (couponRow?.type === 'partnership') {
          return NextResponse.json(
            { error: 'Cupão de parceria: concede acesso sem cartão — usa o fluxo de resgate.', code: 'PARTNERSHIP_COUPON' },
            { status: 400 }
          )
        }

        if (couponRow?.type === 'free_subscription' || couponRow?.type === 'free_months') {
          const months = Math.max(1, couponRow.discount_value ?? 1)
          sessionParams.subscription_data = { trial_period_days: months * 30 }
        }
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    // Funil Opinly: inicio de checkout (best-effort; anonId via cookie do pixel)
    await opinlyTrack('begin_checkout', { plan: planId }, {
      externalEventId: `bc_${session.id}`,
      email: email,
      anonId: request.cookies.get('opinly_anon_id')?.value,
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar sessão de pagamento'
    console.error('❌ [REGISTER-CHECKOUT] Erro:', message, { origin: getSiteOrigin() })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

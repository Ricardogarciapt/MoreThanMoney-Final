import { NextRequest, NextResponse } from 'next/server'
import { opinlyTrack } from '@/lib/opinly/track'
import { getStripeClient } from '@/lib/stripe-client'
import { recusaPlanoDescontinuado, requireStripePriceId } from '@/lib/stripe-prices'
import { buildStripeReturnUrl, getSiteOrigin } from '@/lib/site-url'
import { resolveStripePromotionCode } from '@/lib/coupon-stripe-discount'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'
import type Stripe from 'stripe'
import { COOKIE_ATRIBUICAO, normalizar as normalizarAgente } from '@/lib/agentes/atribuicao'
import { registarConsentimentoDaCompra } from '@/lib/captacao-consentimento-registo'
import {
  CUPAO_INTRO_PREMIUM,
  PLANO_DURANTE_CAMPANHA,
  ORIGEM_CAMPANHA_90D,
  ORIGEM_TRIAL,
  ehCupaoCampanha90d,
  pareceCupao,
  paramsCampanha90d,
  paramsTrialSemCartao,
  recolhaCompleta,
} from '@/lib/stripe-checkout-premium'

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
    const { planId, email, fullName, username, phone, regToken, sponsorUsername, trial } = body
    // Um email (ou lixo do preenchimento automático) no campo do cupão não é um cupão.
    const couponCode = pareceCupao(body.couponCode) ? body.couponCode.trim().toUpperCase() : ''

    if (!planId || !email || !fullName || !username) {
      return NextResponse.json({ error: 'planId, email, fullName e username são obrigatórios' }, { status: 400 })
    }

    // A caixa «lembretes e novidades por email» (opcional, desmarcada — 06/10 F4). Só com `true`.
    await registarConsentimentoDaCompra({
      aceitou: body.consentimentoEmail,
      email,
      canal: 'checkout',
      origemUrl: request.headers.get('referer'),
    })

    // Planos descontinuados (MTM Copy) não abrem checkout novo.
    const descontinuado = recusaPlanoDescontinuado(planId)
    if (descontinuado) return NextResponse.json(descontinuado, { status: 410 })

    // Campanha 90 dias (cupão 90DAYSPREVIOUSXP): o preço é o do Premium, com 90 dias grátis e
    // Membro durante o período. Sobrepõe-se ao plano que vier do formulário.
    const isCampanha90d = ehCupaoCampanha90d(couponCode)

    // Premium mensal tem duas portas (ver lib/stripe-checkout-premium.ts):
    // trial de 3 dias SEM cartão e depois 65€/mês, ou ativar já com o 1º mês a 35€.
    const isTrial = !isCampanha90d && trial === true && planId === 'premium_monthly' && !couponCode

    const priceId = requireStripePriceId(isCampanha90d ? 'premium_monthly' : planId)
    const stripe = getStripeClient()
    const origin = getSiteOrigin()

    const customer = await stripe.customers.create({
      email,
      name: fullName,
      ...(phone ? { phone } : {}),
      metadata: { pending_registration: 'true', reg_token: regToken || '' },
    })

    // O código do agente que trouxe esta pessoa, lido do cookie (ver o metadata, abaixo).
    const agenteCodigo = normalizarAgente(request.cookies.get(COOKIE_ATRIBUICAO)?.value)

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: buildStripeReturnUrl('/success', {
        plan: isCampanha90d ? PLANO_DURANTE_CAMPANHA : planId,
        reg_token: regToken || '',
        new_user: '1',
      }),
      cancel_url: buildStripeReturnUrl('/register', {}, { includeSessionPlaceholder: false }),
      // Morada, telemóvel e a nota de porque é que o cartão é obrigatório (no trial: só a nota).
      ...recolhaCompleta(isTrial),
      payment_method_collection: 'always',
      ...(isTrial ? paramsTrialSemCartao() : {}),
      ...(isCampanha90d ? paramsCampanha90d() : {}),
      metadata: {
        pending_registration: 'true',
        reg_token: regToken || '',
        // Na campanha a conta nasce Membro: o provisionamento lê o plano daqui.
        plan: isCampanha90d ? PLANO_DURANTE_CAMPANHA : planId,
        // QUEM TROUXE ESTA COMPRA. Vem do cookie que `components/agentes/captura-atribuicao.tsx`
        // escreve a partir do `?ag=` do link, e viaja no metadata para o webhook o poder gravar no
        // livro de vendas (`vendas_vendas.agente_codigo`, migração 170). Lê-se do cookie e não do
        // corpo do pedido pela mesma razão que o `opinly_anon_id`: um botão de compra que se
        // esquecesse de o mandar não dava erro — dava uma venda sem dono, indistinguível de uma que
        // nenhum agente trouxe. `normalizarAgente` devolve nulo a tudo o que não tenha a forma de
        // um código de agente, por isso um cupão de desconto no `?ag=` não credita ninguém.
        ...(agenteCodigo ? { agente_codigo: agenteCodigo } : {}),
        email,
        full_name: fullName,
        username,
        ...(request.cookies.get('opinly_anon_id')?.value ? { opinly_anon_id: request.cookies.get('opinly_anon_id')!.value } : {}),
        phone: phone || '',
        sponsor_username: sponsorUsername || '',
        coupon_code: couponCode,
        is_trial: isTrial ? '1' : '',
        periodo_gratis: isCampanha90d ? ORIGEM_CAMPANHA_90D : isTrial ? ORIGEM_TRIAL : '',
      },
    }

    // Trial e campanha já trazem o subscription_data (paramsTrialSemCartao / paramsCampanha90d).
    if (!isTrial && !isCampanha90d && couponCode) {
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

    // Ativar já o Premium mensal: 1º mês a 35€, renova a 65€ — também quando o cupão escrito
    // não deu desconto nenhum (um cupão inválido não pode sair mais caro do que nenhum).
    if (!isTrial && !isCampanha90d && planId === 'premium_monthly' && !sessionParams.discounts && !sessionParams.subscription_data) {
      sessionParams.discounts = [{ coupon: CUPAO_INTRO_PREMIUM }]
    }

    // O código também vai para a SUBSCRIÇÃO: com trial ou mês grátis esta sessão vale 0 € e o primeiro
    // dinheiro chega numa fatura dias depois — é pela subscrição que o webhook o liga ao agente.
    if (agenteCodigo && sessionParams.mode === 'subscription') {
      sessionParams.subscription_data = {
        ...(sessionParams.subscription_data ?? {}),
        metadata: { ...(sessionParams.subscription_data?.metadata ?? {}), agente_codigo: agenteCodigo },
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

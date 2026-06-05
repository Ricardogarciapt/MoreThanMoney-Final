import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
const supabaseAdmin = getSupabaseAdmin()

/**
 * Price IDs do Stripe — configurar em variáveis de ambiente Vercel ou definir aqui.
 * Para criar os produtos: https://dashboard.stripe.com/products
 */
const PRICE_IDS: Record<string, string> = {
  // Subscriptions mensais/anuais para Pack Membro e Pack Premium
  app_member_monthly:  process.env.STRIPE_PRICE_APP_MEMBER_MONTHLY  || '',
  app_member_annual:   process.env.STRIPE_PRICE_APP_MEMBER_ANNUAL   || '',
  premium_monthly:     process.env.STRIPE_PRICE_PREMIUM_MONTHLY     || '',
  premium_annual:      process.env.STRIPE_PRICE_PREMIUM_ANNUAL      || '',
  // Scanners (pagamento único)
  goldkiller_lifetime: process.env.STRIPE_PRICE_GOLDKILLER_LIFETIME || '',
  mtm_scanner_monthly: process.env.STRIPE_PRICE_MTM_SCANNER_MONTHLY || '',
  mtm_scanner_lifetime:process.env.STRIPE_PRICE_MTM_SCANNER_LIFETIME|| '',
  // Pack Total de Scanners
  scanners_monthly:    process.env.STRIPE_PRICE_SCANNERS_MONTHLY    || '',
  scanners_semestral:  process.env.STRIPE_PRICE_SCANNERS_SEMESTRAL  || '',
  scanners_lifetime:   process.env.STRIPE_PRICE_SCANNERS_LIFETIME   || '',
}

const SCANNER_LIFETIME_PLANS = new Set([
  'goldkiller_lifetime',
  'mtm_scanner_lifetime',
  'scanners_lifetime',
])

export async function POST(request: NextRequest) {
  try {
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

    const { planId, email, tradingview_username } = await request.json()

    if (!planId) {
      return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
    }

    const priceId = PRICE_IDS[planId]
    if (!priceId) {
      return NextResponse.json(
        { error: `Plano "${planId}" não encontrado ou preço não configurado` },
        { status: 400 }
      )
    }

    // Determinar se é subscrição recorrente ou pagamento único
    const isLifetime = SCANNER_LIFETIME_PLANS.has(planId) || planId.includes('lifetime') || planId.includes('semestral')
    const mode: 'subscription' | 'payment' = isLifetime ? 'payment' : 'subscription'

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'

    // Obter ou criar customer Stripe
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', user.id)
      .single()

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

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
      cancel_url: `${origin}/scanner`,
      metadata: {
        user_id: user.id,
        plan: planId,
        ...(tradingview_username ? { tradingview_username } : {}),
      },
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    // Registar sessão de checkout
    await supabaseAdmin.from('checkout_sessions').insert({
      stripe_session_id: session.id,
      user_id: user.id,
      plan: planId,
      status: 'pending',
      created_at: new Date().toISOString(),
    }).catch(() => {/* tabela pode não existir ainda */})

    return NextResponse.json({ url: session.url, sessionId: session.id })

  } catch (error: any) {
    console.error('❌ [CHECKOUT] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar sessão de pagamento' },
      { status: 500 }
    )
  }
}

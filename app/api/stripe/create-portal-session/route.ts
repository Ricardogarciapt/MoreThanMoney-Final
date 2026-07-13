import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { isIosAppRequest, IOS_IAP_REQUIRED } from '@/lib/is-native-request'

const supabaseAdmin = getSupabaseAdmin()

/**
 * Portal de faturação Stripe — mudar de pack (upgrade/downgrade, prorateado pela Stripe),
 * atualizar cartão ou cancelar. Só para quem tem subscrição Stripe (stripe_customer_id).
 * App iOS: bloqueado — as subscrições Apple gerem-se na App Store (Guideline 3.1.1).
 */
export async function POST(request: NextRequest) {
  try {
    if (isIosAppRequest(request)) {
      return NextResponse.json(IOS_IAP_REQUIRED, { status: 403 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
    }
    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, subscription_platform')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        {
          error: 'A tua subscrição não é gerida pelo Stripe. Se subscreveste na app iOS, gere na App Store.',
          code: 'no_stripe_customer',
        },
        { status: 400 }
      )
    }

    const origin = request.headers.get('origin') || new URL(request.url).origin
    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/member-area`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao abrir o portal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

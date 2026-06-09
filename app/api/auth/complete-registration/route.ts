import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import {
  memberCategoryForPlan,
  normalizeSubscriptionPlan,
} from '@/lib/stripe-prices'
import { handlePremiumStripeSkoolGrant, isPremiumStripePlan } from '@/lib/stripe-skool-admin'
import {
  linkMlmBuyerAfterRegistration,
  processMlmCheckoutCommission,
} from '@/lib/mlm-checkout-commission'

const supabaseAdmin = getSupabaseAdmin()

function resolvePlanFromSession(planId: string | undefined, plan: string, billing: string) {
  const id = planId || `${plan}_${billing}`
  return {
    subscriptionPlan: normalizeSubscriptionPlan(id),
    memberCategory: memberCategoryForPlan(id),
    billingCycle: id.includes('annual') ? 'annual' : 'monthly',
  }
}

/**
 * POST /api/auth/complete-registration
 * Cria conta Supabase + perfil após pagamento Stripe confirmado (/success).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sessionId,
      email,
      password,
      full_name,
      username,
      phone,
      whatsapp,
      plan,
      billing,
      sponsor_username,
    } = body

    if (!sessionId || !email || !password || !full_name || !username) {
      return NextResponse.json(
        { error: 'Dados incompletos. sessionId, email, password, full_name e username são obrigatórios.' },
        { status: 400 }
      )
    }

    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    })

    if (!session) {
      return NextResponse.json({ error: 'Sessão de pagamento não encontrada' }, { status: 404 })
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json(
        { error: `Pagamento não confirmado. Estado: ${session.payment_status}` },
        { status: 402 }
      )
    }

    const sessionEmail = session.metadata?.email || session.customer_details?.email
    if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Email não corresponde à sessão de pagamento' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, userId: existing.id, alreadyExists: true })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, username },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        const { data: existingUser } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        return NextResponse.json({ success: true, userId: existingUser?.id, alreadyExists: true })
      }
      console.error('❌ [COMPLETE-REG] Erro ao criar utilizador:', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const userId = authData.user.id
    const planIdFromSession = session.metadata?.plan || `${plan || 'app_member'}_${billing || 'monthly'}`
    const planMeta = resolvePlanFromSession(
      session.metadata?.plan,
      plan || 'app_member',
      billing || 'monthly'
    )
    const sponsor =
      sponsor_username ||
      session.metadata?.sponsor_username ||
      ''

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null
    let subscriptionId: string | null = null
    let periodEnd: string | null = null

    if (session.subscription) {
      const sub =
        typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription
      subscriptionId = sub.id
      periodEnd = new Date(sub.current_period_end * 1000).toISOString()
    }

    const profilePayload: Record<string, unknown> = {
      id: userId,
      email,
      full_name,
      username,
      phone: phone || session.metadata?.phone || null,
      whatsapp: whatsapp || null,
      user_type: 'member',
      member_category: planMeta.memberCategory,
      is_active: true,
      subscription_plan: planMeta.subscriptionPlan,
      subscription_billing_cycle: planMeta.billingCycle,
      subscription_status: 'active',
      subscription_platform: 'stripe',
      checkout_source: 'stripe',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_expires_at: periodEnd,
      next_billing_at: periodEnd,
      last_payment_at: new Date().toISOString(),
      payment_failed_count: 0,
      updated_at: new Date().toISOString(),
    }

    if (sponsor.trim()) {
      profilePayload.mlm_sponsor_username = sponsor.trim()
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })

    if (profileError) {
      console.error('❌ [COMPLETE-REG] Erro ao criar perfil:', profileError)
    }

    await supabaseAdmin
      .from('checkout_sessions')
      .upsert(
        {
          stripe_session_id: session.id,
          user_id: userId,
          plan: session.metadata?.plan || planMeta.subscriptionPlan,
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'stripe_session_id' }
      )
      .then(undefined, () => {})

    if (isPremiumStripePlan(planIdFromSession)) {
      try {
        await handlePremiumStripeSkoolGrant(supabaseAdmin, userId, planIdFromSession)
      } catch (err) {
        console.error('[SKOOL-ADMIN] Erro ao alertar admins pós-registo:', err)
      }
    }

    if (sponsor.trim()) {
      try {
        const { data: existingCommission } = await supabaseAdmin
          .from('mlm_commissions')
          .select('id')
          .eq('stripe_session_id', session.id)
          .maybeSingle()

        if (existingCommission) {
          await linkMlmBuyerAfterRegistration(supabaseAdmin, {
            stripeSessionId: session.id,
            userId,
            sponsorUsername: sponsor.trim(),
          })
        } else {
          await processMlmCheckoutCommission(supabaseAdmin, session, userId)
        }
      } catch (mlmErr) {
        console.error('[MLM] Erro ao ligar comprador após registo:', mlmErr)
      }
    }

    console.log(`✅ [COMPLETE-REG] Conta criada para ${email} (user: ${userId})`)

    return NextResponse.json({
      success: true,
      userId,
      alreadyExists: false,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    console.error('❌ [COMPLETE-REG] Erro inesperado:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

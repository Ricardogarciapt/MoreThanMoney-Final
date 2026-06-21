import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { isRegisteredMember } from '@/lib/member-access'
import { needsAccessRevalidation } from '@/lib/access-migration'
import {
  createProfileAfterPayment,
  findAuthUserByEmail,
  provisionStripeRegistrationFromSession,
} from '@/lib/stripe-complete-registration'
import {
  notifyNewMemberRegistration,
  notifyTeamSale,
} from '@/lib/notifications-sales'

const supabaseAdmin = getSupabaseAdmin()

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
      oauth,
    } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId é obrigatório.' }, { status: 400 })
    }

    const isOAuthRegistration = oauth === true

    if (!isOAuthRegistration && (!email || !password || !full_name || !username)) {
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

    if (isOAuthRegistration) {
      const oauthUserId = session.metadata?.oauth_user_id
      if (!oauthUserId || session.metadata?.registration_method !== 'oauth') {
        return NextResponse.json({ error: 'Sessão OAuth inválida.' }, { status: 400 })
      }

      const { data: existingOAuthProfile } = await supabaseAdmin
        .from('profiles')
        .select(
          'id, user_type, member_category, is_active, subscription_plan, stripe_subscription_id, subscription_expires_at, trial_expires_at, trial_expired, profile_data, email'
        )
        .eq('id', oauthUserId)
        .maybeSingle()

      if (
        isRegisteredMember(existingOAuthProfile) &&
        !needsAccessRevalidation(existingOAuthProfile)
      ) {
        return NextResponse.json({ success: true, userId: oauthUserId, alreadyExists: true })
      }

      const result = await provisionStripeRegistrationFromSession(session, {
        plan,
        billing,
        sponsor_username,
        skipNotifications: false,
      })

      if (!result.ok) {
        return NextResponse.json({ error: result.error || result.reason }, { status: 400 })
      }

      console.log(`✅ [COMPLETE-REG] Perfil OAuth criado (user: ${result.userId})`)
      return NextResponse.json({
        success: true,
        userId: result.userId,
        alreadyExists: result.alreadyExists,
        oauth: true,
      })
    }

    const sessionEmail = session.metadata?.email || session.customer_details?.email
    if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Email não corresponde à sessão de pagamento' }, { status: 400 })
    }

    const result = await provisionStripeRegistrationFromSession(session, {
      email,
      password,
      full_name,
      username,
      phone,
      whatsapp,
      plan,
      billing,
      sponsor_username,
      sendSetPasswordEmail: false,
    })

    if (!result.ok) {
      if (result.reason === 'auth_exists_no_profile') {
        const authUser = await findAuthUserByEmail(email)
        if (authUser) {
          await createProfileAfterPayment({
            userId: authUser.id,
            email,
            full_name,
            username,
            phone,
            whatsapp,
            plan,
            billing,
            sponsor_username,
            session,
          })
          const planId = session.metadata?.plan || `${plan || 'app_member'}_${billing || 'monthly'}`
          const effectiveSponsor = (sponsor_username || session.metadata?.sponsor_username || '').trim()
          const eventId = `reg_${session.id}`
          void notifyNewMemberRegistration({
            username,
            sponsorUsername: effectiveSponsor || undefined,
            eventId,
          })
          void notifyTeamSale({
            buyerUserId: authUser.id,
            username,
            planId,
            eventId: `${eventId}_sale`,
          })
          return NextResponse.json({
            success: true,
            userId: authUser.id,
            alreadyExists: true,
            profileUpdated: true,
          })
        }
      }
      return NextResponse.json({ error: result.error || result.reason }, { status: 500 })
    }

    console.log(`✅ [COMPLETE-REG] Conta criada/actualizada para ${email} (user: ${result.userId})`)

    return NextResponse.json({
      success: true,
      userId: result.userId,
      alreadyExists: result.alreadyExists,
      profileUpdated: result.profileUpdated,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    console.error('❌ [COMPLETE-REG] Erro inesperado:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

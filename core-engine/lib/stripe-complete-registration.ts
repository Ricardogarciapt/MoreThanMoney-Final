import { randomBytes } from 'crypto'
import type { User } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient, stripeSubscriptionPeriodEnd } from '@/lib/stripe-client'
import {
  memberCategoryForPlan,
  normalizeSubscriptionPlan,
} from '@/lib/stripe-prices'
import { handlePremiumStripeSkoolGrant, isPremiumStripePlan } from '@/lib/stripe-skool-admin'
import { finalizeStripeMemberAccess, subscriptionPlatformForStripeCheckout } from '@/lib/stripe-profile-sync'
import {
  linkMlmBuyerAfterRegistration,
  processMlmCheckoutCommission,
} from '@/lib/mlm-checkout-commission'
import { isRegisteredMember } from '@/lib/member-access'
import { needsAccessRevalidation } from '@/lib/access-migration'
import {
  notifyNewMemberRegistration,
  notifyTeamSale,
} from '@/lib/notifications-sales'
import { sendPasswordRecoveryEmail } from '@/lib/email-service'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'
import { sendNewMemberEmailToUplinesAndAdmin } from '@/lib/new-member-email'
import { getSiteUrl } from '@/lib/mail-transport'

const supabaseAdmin = getSupabaseAdmin()

export function resolvePlanFromSession(planId: string | undefined, plan: string, billing: string) {
  const id = planId || `${plan}_${billing}`
  return {
    subscriptionPlan: normalizeSubscriptionPlan(id),
    memberCategory: memberCategoryForPlan(id),
    billingCycle: id.includes('annual') ? ('annual' as const) : ('monthly' as const),
  }
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1

  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized)
    if (found) return found
    if (data.users.length < 1000) break
    page += 1
  }

  return null
}

export async function generatePasswordRecoveryLink(email: string): Promise<string | null> {
  const siteUrl = getSiteUrl()
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim().toLowerCase(),
    options: { redirectTo: `${siteUrl}/auth/reset-callback` },
  })

  if (error) {
    console.warn('[stripe-complete-reg] generateLink:', error.message)
    return null
  }

  const tokenHash =
    data.properties?.hashed_token ||
    (() => {
      const actionLink = data.properties?.action_link ?? ''
      const match = actionLink.match(/[?&]token=([^&]+)/)
      return match?.[1] ?? null
    })()

  if (!tokenHash) return null
  return `${siteUrl}/auth/reset-callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
}

async function sendSetPasswordEmail(
  email: string,
  fullName: string,
  username: string
): Promise<void> {
  const resetLink = await generatePasswordRecoveryLink(email)
  if (resetLink) {
    await sendPasswordRecoveryEmail(email, fullName, username, resetLink).catch((err) => {
      console.error('[stripe-complete-reg] recovery email:', err)
    })
  }
}

export async function createProfileAfterPayment(params: {
  userId: string
  email: string
  full_name: string
  username: string
  phone?: string
  whatsapp?: string
  plan?: string
  billing?: string
  sponsor_username?: string
  session: Stripe.Checkout.Session
}) {
  const { userId, email, full_name, username, phone, whatsapp, plan, billing, sponsor_username, session } =
    params
  const stripe = getStripeClient()
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
    periodEnd = new Date(stripeSubscriptionPeriodEnd(sub) * 1000).toISOString()
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
    subscription_platform: subscriptionPlatformForStripeCheckout(),
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

  const couponCode = (session.metadata?.coupon_code || '').trim().toUpperCase()
  if (couponCode) {
    profilePayload.coupon_code = couponCode
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })

  if (profileError) {
    console.error('❌ [STRIPE-COMPLETE-REG] Erro ao criar perfil:', profileError)
    throw new Error(profileError.message)
  }

  try {
    await finalizeStripeMemberAccess({
      userId,
      planId: planIdFromSession,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      periodEnd,
      billingCycle: planMeta.billingCycle,
    })
  } catch (migrationErr) {
    console.error('❌ [STRIPE-COMPLETE-REG] Erro ao finalizar acesso/migração:', migrationErr)
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

  void sendNewMemberWelcomeIfEligible({
    userId,
    source: 'stripe',
    planId: planIdFromSession,
    sponsorUsername: sponsor.trim() || undefined,
    eventId: `reg_${session.id}`,
  })

  return { userId, planIdFromSession }
}

function fireRegistrationNotifications(
  session: Stripe.Checkout.Session,
  userId: string,
  username: string,
  plan?: string,
  billing?: string,
  sponsor_username?: string
) {
  const planId = session.metadata?.plan || `${plan || 'app_member'}_${billing || 'monthly'}`
  const effectiveSponsor = (sponsor_username || session.metadata?.sponsor_username || '').trim()
  const eventId = `reg_${session.id}`
  void notifyNewMemberRegistration({
    username,
    sponsorUsername: effectiveSponsor || undefined,
    eventId,
  })
  void notifyTeamSale({
    buyerUserId: userId,
    username,
    planId,
    eventId: `${eventId}_sale`,
  })
  // Email "novo membro" → uplines (organização) + admin (ricardo.subtilgarcia + morethanmoney)
  void sendNewMemberEmailToUplinesAndAdmin({
    buyerUserId: userId,
    memberName: session.metadata?.full_name || username,
    memberUsername: username,
    planId,
  })
}

export type ProvisionStripeRegistrationResult =
  | { ok: true; userId: string; alreadyExists: boolean; profileUpdated: boolean; oauth?: boolean }
  | { ok: false; reason: string; error?: string }

export async function provisionStripeRegistrationFromSession(
  session: Stripe.Checkout.Session,
  options: {
    password?: string | null
    email?: string
    full_name?: string
    username?: string
    phone?: string
    whatsapp?: string
    plan?: string
    billing?: string
    sponsor_username?: string
    /** Envia email de definir password (quando a conta foi criada server-side sem password do cliente) */
    sendSetPasswordEmail?: boolean
    skipNotifications?: boolean
  } = {}
): Promise<ProvisionStripeRegistrationResult> {
  if (session.metadata?.pending_registration !== 'true') {
    return { ok: false, reason: 'not_pending_registration' }
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return { ok: false, reason: 'payment_not_confirmed' }
  }

  const { data: existingCheckout } = await supabaseAdmin
    .from('checkout_sessions')
    .select('status, user_id')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (existingCheckout?.status === 'completed' && existingCheckout.user_id) {
    return {
      ok: true,
      userId: existingCheckout.user_id,
      alreadyExists: true,
      profileUpdated: false,
    }
  }

  const isOAuth = session.metadata?.registration_method === 'oauth'

  if (isOAuth) {
    const oauthUserId = session.metadata?.oauth_user_id
    if (!oauthUserId) {
      return { ok: false, reason: 'oauth_user_missing' }
    }

    const { data: existingOAuthProfile } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, user_type, member_category, is_active, subscription_plan, stripe_subscription_id, subscription_expires_at, trial_expires_at, trial_expired, profile_data, email'
      )
      .eq('id', oauthUserId)
      .maybeSingle()

    if (isRegisteredMember(existingOAuthProfile) && !needsAccessRevalidation(existingOAuthProfile)) {
      await supabaseAdmin
        .from('checkout_sessions')
        .upsert(
          {
            stripe_session_id: session.id,
            user_id: oauthUserId,
            plan: session.metadata?.plan || 'unknown',
            status: 'completed',
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'stripe_session_id' }
        )
        .then(undefined, () => {})
      return { ok: true, userId: oauthUserId, alreadyExists: true, profileUpdated: false, oauth: true }
    }

    const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(oauthUserId)
    if (getUserError || !authUser?.user?.email) {
      return { ok: false, reason: 'oauth_user_not_found', error: getUserError?.message }
    }

    const oauthEmail = authUser.user.email
    const oauthFullName =
      options.full_name ||
      session.metadata?.full_name ||
      (typeof authUser.user.user_metadata?.full_name === 'string'
        ? authUser.user.user_metadata.full_name
        : oauthEmail.split('@')[0])
    const oauthUsername = options.username || session.metadata?.username || oauthEmail.split('@')[0]

    await createProfileAfterPayment({
      userId: oauthUserId,
      email: oauthEmail,
      full_name: oauthFullName,
      username: oauthUsername,
      phone: options.phone || session.metadata?.phone || '',
      whatsapp: options.whatsapp || '',
      plan: options.plan,
      billing: options.billing,
      sponsor_username: options.sponsor_username || session.metadata?.sponsor_username || '',
      session,
    })

    if (!options.skipNotifications) {
      fireRegistrationNotifications(
        session,
        oauthUserId,
        oauthUsername,
        options.plan,
        options.billing,
        options.sponsor_username
      )
    }

    return { ok: true, userId: oauthUserId, alreadyExists: false, profileUpdated: true, oauth: true }
  }

  const email =
    (options.email || session.metadata?.email || session.customer_details?.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { ok: false, reason: 'email_missing' }
  }

  const full_name =
    options.full_name ||
    session.metadata?.full_name ||
    email.split('@')[0]
  const username =
    options.username ||
    session.metadata?.username ||
    email.split('@')[0]

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, username, phone, whatsapp')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    await createProfileAfterPayment({
      userId: existingProfile.id,
      email,
      full_name: full_name || existingProfile.full_name || email.split('@')[0],
      username: username || existingProfile.username || email.split('@')[0],
      phone: options.phone || '',
      whatsapp: options.whatsapp || '',
      plan: options.plan,
      billing: options.billing,
      sponsor_username: options.sponsor_username,
      session,
    })

    return {
      ok: true,
      userId: existingProfile.id,
      alreadyExists: true,
      profileUpdated: true,
    }
  }

  let userId: string
  let createdNewAuth = false

  if (options.password) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: options.password,
      email_confirm: true,
      user_metadata: { full_name, username },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        const authUser = await findAuthUserByEmail(email)
        if (!authUser) {
          return { ok: false, reason: 'auth_exists_no_profile', error: authError.message }
        }
        userId = authUser.id
      } else {
        return { ok: false, reason: 'auth_create_failed', error: authError.message }
      }
    } else {
      userId = authData.user.id
      createdNewAuth = true
    }
  } else {
    const existingAuth = await findAuthUserByEmail(email)
    if (existingAuth) {
      userId = existingAuth.id
    } else {
      const tempPassword = randomBytes(32).toString('base64url')
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name, username },
      })
      if (authError) {
        return { ok: false, reason: 'auth_create_failed', error: authError.message }
      }
      userId = authData.user.id
      createdNewAuth = true
    }
  }

  await createProfileAfterPayment({
    userId,
    email,
    full_name,
    username,
    phone: options.phone,
    whatsapp: options.whatsapp,
    plan: options.plan,
    billing: options.billing,
    sponsor_username: options.sponsor_username,
    session,
  })

  if (createdNewAuth && options.sendSetPasswordEmail !== false && !options.password) {
    await sendSetPasswordEmail(email, full_name, username)
  }

  if (!options.skipNotifications) {
    fireRegistrationNotifications(
      session,
      userId,
      username,
      options.plan,
      options.billing,
      options.sponsor_username
    )
  }

  return {
    ok: true,
    userId,
    alreadyExists: !createdNewAuth,
    profileUpdated: true,
  }
}

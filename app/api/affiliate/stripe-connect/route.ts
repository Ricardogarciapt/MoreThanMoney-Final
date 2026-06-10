// /api/affiliate/stripe-connect
// GET  → devolve o estado da conta Connect do utilizador autenticado
// POST { action: 'create' }  → cria conta Express + devolve link de onboarding
// POST { action: 'refresh' } → renova link de onboarding (se expirou)
// POST { action: 'status' }  → verifica estado actual junto ao Stripe e sincroniza

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sanitizeEnv } from '@/lib/env-sanitize'
import { getStripeClient } from '@/lib/stripe-client'
import { getSiteOrigin } from '@/lib/site-url'

const stripe = getStripeClient()
const supabaseAdmin = getSupabaseAdmin()

async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const siteOrigin = () => getSiteOrigin()

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_connect_account_id, stripe_connect_status, stripe_connect_onboarded_at, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  // Se tem conta Connect, verificar estado actual junto ao Stripe
  if (profile.stripe_connect_account_id) {
    try {
      const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id)
      const isComplete = account.charges_enabled && account.payouts_enabled
      const status = isComplete ? 'complete' : account.details_submitted ? 'pending' : 'incomplete'

      if (status !== profile.stripe_connect_status) {
        await supabaseAdmin
          .from('profiles')
          .update({
            stripe_connect_status: status,
            ...(isComplete && !profile.stripe_connect_onboarded_at
              ? { stripe_connect_onboarded_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', user.id)
      }

      return NextResponse.json({
        connected: true,
        account_id: profile.stripe_connect_account_id,
        status,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        onboarded_at: profile.stripe_connect_onboarded_at,
      })
    } catch {
      // Conta pode ter sido deletada no Stripe
      return NextResponse.json({
        connected: false,
        status: 'error',
        account_id: profile.stripe_connect_account_id,
      })
    }
  }

  return NextResponse.json({
    connected: false,
    status: profile.stripe_connect_status || 'not_started',
  })
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { action } = body

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_connect_account_id, stripe_connect_status, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  // ── CREATE: cria nova conta Stripe Connect Express ───────────────────────
  if (action === 'create') {
    if (profile.stripe_connect_account_id) {
      return NextResponse.json({ error: 'Já tens uma conta Connect associada. Usa action: refresh.' }, { status: 400 })
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'PT',
      email: profile.email || user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: { user_id: user.id },
    })

    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_status: 'incomplete',
      })
      .eq('id', user.id)

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${siteOrigin()}/app-mobile?tab=settings&connect=refresh`,
      return_url: `${siteOrigin()}/app-mobile?tab=settings&connect=success`,
      type: 'account_onboarding',
    })

    return NextResponse.json({
      account_id: account.id,
      onboarding_url: accountLink.url,
    })
  }

  // ── REFRESH: renova link de onboarding ───────────────────────────────────
  if (action === 'refresh') {
    if (!profile.stripe_connect_account_id) {
      return NextResponse.json({ error: 'Sem conta Connect. Usa action: create.' }, { status: 400 })
    }

    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_connect_account_id,
      refresh_url: `${siteOrigin()}/app-mobile?tab=settings&connect=refresh`,
      return_url: `${siteOrigin()}/app-mobile?tab=settings&connect=success`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ onboarding_url: accountLink.url })
  }

  // ── STATUS: força re-verificação do estado ───────────────────────────────
  if (action === 'status') {
    if (!profile.stripe_connect_account_id) {
      return NextResponse.json({ connected: false, status: 'not_started' })
    }

    const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id)
    const isComplete = account.charges_enabled && account.payouts_enabled
    const status = isComplete ? 'complete' : account.details_submitted ? 'pending' : 'incomplete'

    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_connect_status: status,
        ...(isComplete ? { stripe_connect_onboarded_at: new Date().toISOString() } : {}),
      })
      .eq('id', user.id)

    return NextResponse.json({
      connected: isComplete,
      status,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    })
  }

  return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
}

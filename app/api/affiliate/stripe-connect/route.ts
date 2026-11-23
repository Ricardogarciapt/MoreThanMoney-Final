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
import { criarContaRecebimento, paisConnect, sincronizarConta } from '@/lib/pagamentos/connect'

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
    const { estado, conta } = await sincronizarConta(
      supabaseAdmin, stripe, user.id, profile.stripe_connect_account_id,
      profile.stripe_connect_status, profile.stripe_connect_onboarded_at,
    )
    if (!conta) {
      return NextResponse.json({ connected: false, status: 'error', account_id: profile.stripe_connect_account_id })
    }
    return NextResponse.json({
      connected: true,
      account_id: profile.stripe_connect_account_id,
      status: estado,
      payouts_enabled: conta.payouts_enabled,
      details_submitted: conta.details_submitted,
      onboarded_at: profile.stripe_connect_onboarded_at,
    })
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
    .select('stripe_connect_account_id, stripe_connect_status, stripe_connect_onboarded_at, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const destino = body.voltar === 'backoffice' ? '/backoffice/extracto' : '/app-mobile?tab=settings'
  const sep = destino.includes('?') ? '&' : '?'
  const linkDeRegisto = (accountId: string) =>
    stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteOrigin()}${destino}${sep}connect=refresh`,
      return_url: `${siteOrigin()}${destino}${sep}connect=success`,
      type: 'account_onboarding',
    })

  // ── CREATE: cria nova conta Stripe Connect Express ───────────────────────
  if (action === 'create') {
    if (profile.stripe_connect_account_id) {
      return NextResponse.json({ error: 'Já tens uma conta Connect associada. Usa action: refresh.' }, { status: 400 })
    }

    let account
    try {
      account = await criarContaRecebimento(stripe, {
        userId: user.id,
        email: profile.email || user.email || null,
        pais: paisConnect(body.pais),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[stripe-connect] criar conta falhou:', msg)
      return NextResponse.json({ error: 'Não foi possível abrir a conta de recebimento agora. Tenta mais tarde.', detalhe: msg }, { status: 502 })
    }

    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_status: 'incomplete',
      })
      .eq('id', user.id)

    const accountLink = await linkDeRegisto(account.id)

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

    const accountLink = await linkDeRegisto(profile.stripe_connect_account_id)

    return NextResponse.json({ onboarding_url: accountLink.url })
  }

  // ── STATUS: força re-verificação do estado ───────────────────────────────
  if (action === 'status') {
    if (!profile.stripe_connect_account_id) {
      return NextResponse.json({ connected: false, status: 'not_started' })
    }

    const { estado, conta } = await sincronizarConta(
      supabaseAdmin, stripe, user.id, profile.stripe_connect_account_id,
      profile.stripe_connect_status, profile.stripe_connect_onboarded_at,
    )
    return NextResponse.json({
      connected: estado === 'complete',
      status: estado,
      payouts_enabled: conta?.payouts_enabled ?? false,
    })
  }

  return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
}

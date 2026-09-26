// /api/stripe/webhook/route.ts
// Handles all Stripe webhook events — subscriptions, payments, cancellations

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendScannerAccessEmail, sendMTMcopierSetupNotification } from '@/lib/email-service'
import { sanitizeEnv } from '@/lib/env-sanitize'
import { opinlyTrack, opinlyTrackPurchase } from '@/lib/opinly/track'
import { getStripeClient, stripeInvoiceLinePrice, stripeSubscriptionPeriodEnd } from '@/lib/stripe-client'
import {
  getPlanIdFromPriceId,
  memberCategoryForPlan,
  normalizeSubscriptionPlan,
} from '@/lib/stripe-prices'
import {
  handlePremiumStripeSkoolGrant,
  isPremiumStripePlan,
  notifyAdminsStripeSkoolAction,
} from '@/lib/stripe-skool-admin'
import { processMlmCheckoutCommission } from '@/lib/mlm-checkout-commission'
import { estornarVenda, registarVendaConfirmada } from '@/lib/vendas/livro'
import { subscriptionPlatformForStripeCheckout } from '@/lib/stripe-profile-sync'
import { processMlmSubscriptionRenewal } from '@/lib/mlm-subscription-integration'
import { upsertSponsorNode } from '@/lib/mlm-tree'
import {
  notifyTeamSale,
  notifyTeamRenewal,
} from '@/lib/notifications-sales'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'
import {
  ehCheckoutDoEA,
  emitirLicencaDoCheckout,
  renovarLicencaDaSubscricao,
  revogarLicencaDaSubscricao,
} from '@/lib/licencas-stripe'
import {
  PLANO_ADDON_MTMCOPY,
  addonPagamento,
  addonSubscricaoAtualizada,
  addonSubscricaoCancelada,
  faturaEhAddon,
  fimDoPeriodo,
  subscricaoEhAddon,
} from '@/lib/mtmcopy/addon-stripe'
import { planoIncluiScanners, scannerDoPackFundador } from '@/lib/packs-fundador'

// Nomes amigáveis dos scanners por planId (para o email de instruções TradingView)
const SCANNER_PLAN_NAMES: Record<string, string> = {
  goldkiller_lifetime: 'Scanner Gold Killer (Vitalício)',
  mtm_scanner_monthly: 'Scanner MTM V3.4 (Mensal)',
  mtm_scanner_lifetime: 'Scanner MTM V3.4 (Vitalício)',
  scanners_monthly: 'Pack Total de Scanners MTM (Mensal)',
  scanners_semestral: 'Pack Total de Scanners MTM (Semestral)',
  scanners_lifetime: 'Pack Scanners MTM (Vitalício — inclui o Sensei)',
}

const stripe = getStripeClient()
const supabase = createClient(
  sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, sanitizeEnv(process.env.STRIPE_WEBHOOK_SECRET))
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency — skip already processed events
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .single()

  if (existing) {
    return NextResponse.json({ received: true, skipped: true })
  }

  // Record event
  await supabase.from('stripe_events').insert({ id: event.id, type: event.type, data: event.data })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        // Atribuição Opinly — best-effort, dedup pelo id da sessão (retries seguros)
        if (session.payment_status === 'paid' && session.amount_total) {
          const email = session.customer_details?.email ?? session.customer_email ?? undefined
          const anonId = session.metadata?.opinly_anon_id || undefined
          const value = session.amount_total / 100
          const currency = (session.currency ?? 'eur').toUpperCase()
          await opinlyTrackPurchase({ orderId: session.id, value, currency, email, anonId })
          if (session.mode === 'subscription') {
            await opinlyTrack(
              'subscribe',
              { plan: session.metadata?.plan_id ?? session.metadata?.plan ?? 'unknown', value, currency },
              { externalEventId: `subscribe_${session.id}`, email, anonId },
            )
          }
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        // Antes do handler de perfis: quem comprou só a licença do EA não tem perfil no site, e
        // `handleSubscriptionCanceled` desiste logo à primeira quando não encontra um.
        await revogarLicencaDaSubscricao(sub.id)
        await handleSubscriptionCanceled(sub)
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subDaFatura = (invoice as { subscription?: unknown }).subscription
        if (invoice.billing_reason === 'subscription_cycle' && typeof subDaFatura === 'string') {
          await renovarLicencaDaSubscricao(subDaFatura)
        }
        await handlePaymentSucceeded(invoice)
        // Só renovações: a 1.ª fatura já conta como purchase no checkout.session.completed
        if (invoice.billing_reason === 'subscription_cycle' && invoice.amount_paid > 0 && invoice.id) {
          await opinlyTrackPurchase({
            orderId: invoice.id,
            value: invoice.amount_paid / 100,
            currency: (invoice.currency ?? 'eur').toUpperCase(),
            email: invoice.customer_email ?? undefined,
          })
        }
        break
      }
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      /**
       * DEVOLUÇÃO E CHARGEBACK — o dinheiro volta para o cliente.
       *
       * Até aqui o sistema só sabia somar: um reembolso deixava de pé a comissão do patrocinador
       * (e, agora, as da equipa) sobre dinheiro que já não é nosso. Estes dois eventos são o
       * único sítio onde o Stripe nos diz isso, e é aqui que se reverte.
       *
       * O chargeback trata-se como devolução no momento em que é ABERTO, e não no fim da
       * disputa, de propósito: é melhor ter uma comissão suspensa que se volta a aprovar do que
       * pagar sobre dinheiro que está em disputa. Se a disputa for ganha, o admin reaprova.
       */
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await estornarCobranca(charge, `Reembolso Stripe (charge ${charge.id})`, charge.amount_refunded ?? null)
        break
      }
      case 'charge.dispute.created': {
        const disputa = event.data.object as Stripe.Dispute
        const chargeId = typeof disputa.charge === 'string' ? disputa.charge : disputa.charge?.id
        if (chargeId) {
          try {
            const charge = await stripe.charges.retrieve(chargeId)
            await estornarCobranca(charge, `Chargeback aberto no Stripe (disputa ${disputa.id})`, disputa.amount ?? null)
          } catch (err) {
            console.error('[VENDAS] não foi possível ler a cobrança da disputa:', err)
          }
        }
        break
      }
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id

  // Licença do MTM Sensei EA: vendida à parte, com ou sem conta no site. Sai daqui porque nada
  // do que vem a seguir (planos, MLM, categorias de membro) se aplica a uma licença de software.
  if (ehCheckoutDoEA(session)) {
    await emitirLicencaDoCheckout(session)
    return
  }

  // MTM Funded: um programa de avaliação. Sai daqui pela mesma razão — não é um plano do site,
  // não mexe no MLM e não muda a categoria de membro de ninguém. O que faz é emitir uma conta.
  if (session.metadata?.source === 'mtmfunded_program') {
    const { emitirContaDoProgramaPago } = await import('@/lib/mtmfunded/compra')
    await emitirContaDoProgramaPago(session)
    // Mas a venda conta para o livro da equipa: um desafio vendido por um closer paga-lhe, com o
    // tecto de 15 % que o dono definiu para o Funded. O pack é um só ('mtmfunded') porque o tecto
    // é do produto e não do tamanho da conta; qual foi o programa fica na nota.
    await registarVendaDaEquipa({
      referencia: session.id,
      compradorId: session.metadata?.user_id ?? null,
      emailComprador: session.customer_details?.email ?? null,
      pack: 'mtmfunded',
      valorCents: session.amount_total ?? 0,
      moeda: session.currency ?? 'eur',
      tipo: 'primeira',
      nota: `MTM Funded — programa ${session.metadata?.program_id ?? 'desconhecido'}`,
    })
    return
  }

  // Registo novo: provisionar conta server-side (não depende do browser / localStorage)
  if (!userId && session.metadata?.pending_registration === 'true') {
    await supabase
      .from('checkout_sessions')
      .upsert(
        {
          stripe_session_id: session.id,
          plan: session.metadata?.plan || 'unknown',
          status: 'paid_pending_account',
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'stripe_session_id' }
      )
      .then(undefined, () => {})

    try {
      await processMlmCheckoutCommission(supabase, session, null)
    } catch (mlmErr) {
      console.error('[MLM] Erro no registo novo (pending_registration):', mlmErr)
    }

    // Guardado fora do `try` porque a venda que se registra a seguir precisa dele, e um
    // provisionamento que falhou não pode levar a venda com ele.
    let compradorProvisionado: string | null = null

    try {
      const { provisionStripeRegistrationFromSession } = await import(
        '@/lib/stripe-complete-registration'
      )
      const provision = await provisionStripeRegistrationFromSession(session, {
        sendSetPasswordEmail: true,
      })
      if (provision.ok) {
        compradorProvisionado = provision.userId ?? null
        console.log(
          `✅ [STRIPE-WEBHOOK] Conta provisionada server-side: ${provision.userId} (session ${session.id})`
        )
      } else {
        console.warn(
          `[STRIPE-WEBHOOK] Provisionamento pendente falhou (${provision.reason}):`,
          provision.error || session.id
        )
      }
    } catch (provisionErr) {
      console.error('[STRIPE-WEBHOOK] Erro ao provisionar registo pós-pagamento:', provisionErr)
    }

    // A VENDA, para o livro da equipa. Este caminho — registar e pagar no MESMO checkout — saía
    // daqui com um `return` sem nunca a registar, e é o caminho principal de aquisição: quem a
    // equipa traz de fora não tem conta antes de pagar. Era o buraco maior, porque perdia
    // exactamente as vendas novas, as que pagam os 35 % do primeiro pagamento.
    //
    // O email vai sempre, com ou sem conta provisionada: é por ele que o negócio do lead que o
    // setter trabalhou antes do registo é encontrado. Se o provisionamento falhou, a venda fica
    // registada sem comprador — visível em `vendas_sem_atribuicao` — em vez de desaparecer.
    await registarVendaDaEquipa({
      referencia: session.id,
      compradorId: compradorProvisionado,
      emailComprador: session.customer_details?.email ?? session.metadata?.email ?? null,
      pack: session.metadata?.plan || 'app_member_monthly',
      valorCents: session.amount_total ?? 0,
      moeda: session.currency ?? 'eur',
      tipo: 'primeira',
      nota: compradorProvisionado ? undefined : 'Registo pago sem conta provisionada — comprador por ligar.',
    })
    return
  }

  // Checkout guest de scanner (sem conta MTM)
  if (!userId && session.metadata?.source === 'scanner_guest_checkout') {
    const tvUsername = session.metadata?.tradingview_username
    const planId = session.metadata?.plan
    const guestEmail = session.metadata?.email || session.customer_details?.email

    if (guestEmail && tvUsername && planId && SCANNER_PLAN_NAMES[planId]) {
      try {
        await sendScannerAccessEmail(
          guestEmail,
          'Trader',
          SCANNER_PLAN_NAMES[planId],
          tvUsername
        )
      } catch (err) {
        console.error('Erro ao enviar email de scanner (guest):', err)
      }
    }
    return
  }

  if (!userId) return

  const isAccessMigration = session.metadata?.access_migration === 'true'
  const planId = session.metadata?.plan || 'app_member_monthly'

  await supabase
    .from('checkout_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('stripe_session_id', session.id)

  // Compra de scanner com username TradingView → enviar email com instruções de acesso
  const tvUsername = session.metadata?.tradingview_username
  if (tvUsername && planId && SCANNER_PLAN_NAMES[planId]) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      if (profile?.email) {
        await sendScannerAccessEmail(
          profile.email,
          profile.full_name || 'Trader',
          SCANNER_PLAN_NAMES[planId],
          tvUsername
        )
      }

      // Guardar o username TradingView no perfil para referência/gestão de acessos
      await supabase
        .from('profiles')
        .update({ tradingview_username: tvUsername })
        .eq('id', userId)
        .then(undefined, () => {/* coluna pode não existir ainda — não bloquear o fluxo */})
    } catch (err) {
      console.error('Erro ao enviar email de acesso ao scanner:', err)
    }
  }

  // Addon MTMcopier (Telegram → MT5) — notificar a equipa para finalizar o onboarding manual
  const ehAddonMtmcopy = planId === PLANO_ADDON_MTMCOPY
  if (ehAddonMtmcopy) {
    try {
      const { activateMtmcopySubscription } = await import('@/lib/mtmcopy/subscription')
      // O fim do período vem SEMPRE datado: com a subscrição, é o current_period_end dela;
      // sem subscrição (pagamento único), 32 dias. Null deixava o acesso legado sem prazo.
      let periodEnd: string | null = null
      if (session.subscription) {
        const subAddon = await getStripeClient().subscriptions.retrieve(session.subscription as string)
        periodEnd = fimDoPeriodo(subAddon as unknown as Parameters<typeof fimDoPeriodo>[0])
      }
      await activateMtmcopySubscription(
        userId,
        periodEnd ?? new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
      )

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      const { data: existingConns } = await supabase
        .from('mtmcopy_connections')
        .select('telegram_channel, mt5_server, mt5_login_last4')
        .eq('user_id', userId)
        .neq('mt5_status', 'disconnected')

      const primaryConn = existingConns?.[0]

      if (existingConns?.length) {
        await supabase
          .from('mtmcopy_connections')
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .neq('mt5_status', 'disconnected')
      }

      if (profile?.email) {
        await sendMTMcopierSetupNotification(
          profile.email,
          profile.full_name || 'Trader',
          primaryConn?.telegram_channel,
          primaryConn?.mt5_server,
          primaryConn?.mt5_login_last4
        )
      }
    } catch (err) {
      console.error('Erro ao processar activação do MTMcopier:', err)
    }
  }

  if (ehAddonMtmcopy) {
    // O addon não é o plano principal: não mexe em subscription_plan, member_category,
    // stripe_subscription_id nem is_active. Só o registo do pagamento, com o plano certo.
    await supabase.from('payment_history').insert({
      user_id: userId,
      stripe_payment_intent_id: (session.payment_intent as string) ?? null,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      plan: PLANO_ADDON_MTMCOPY,
      billing_cycle: 'monthly',
      source: 'stripe',
    }).then(undefined, () => {})
  } else if (session.mode === 'payment') {
    const pack = session.metadata?.pack
    const expiresAt = pack === '65'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('profiles').update({
      stripe_customer_id: session.customer as string,
      subscription_status: 'active',
      subscription_plan: `pack_${pack}`,
      subscription_platform: subscriptionPlatformForStripeCheckout(),
      checkout_source: 'stripe',
      is_active: true,
      subscription_expires_at: expiresAt,
      last_payment_at: new Date().toISOString(),
      payment_failed_count: 0,
    }).eq('id', userId)

    await supabase.from('payment_history').insert({
      user_id: userId,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      plan: `pack_${pack}`,
      billing_cycle: 'one_time',
      source: 'stripe',
    })

  } else if (session.mode === 'subscription') {
    const couponCodeWebhook = (session.metadata?.coupon_code || '').trim().toUpperCase()
    const subscriptionUpdate: Record<string, unknown> = {
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      subscription_plan: normalizeSubscriptionPlan(planId),
      member_category: memberCategoryForPlan(planId),
      subscription_status: 'active',
      subscription_platform: subscriptionPlatformForStripeCheckout(),
      checkout_source: 'stripe',
      is_active: true,
      payment_failed_count: 0,
      last_payment_at: new Date().toISOString(),
    }
    if (couponCodeWebhook) subscriptionUpdate.coupon_code = couponCodeWebhook
    await supabase.from('profiles').update(subscriptionUpdate).eq('id', userId)

    if (isPremiumStripePlan(planId)) {
      try {
        await handlePremiumStripeSkoolGrant(supabase, userId, planId)
      } catch (err) {
        console.error('[SKOOL-ADMIN] Erro no alerta pós-checkout premium:', err)
      }
    }

    if (isAccessMigration) {
      try {
        const { completeAccessMigration } = await import('@/lib/access-migration')
        const stripe = getStripeClient()
        let periodEnd: string | null = null
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          periodEnd = new Date(stripeSubscriptionPeriodEnd(sub) * 1000).toISOString()
        }
        await completeAccessMigration({
          userId,
          planId,
          channel: 'stripe',
          billingCycle: planId.includes('annual') ? 'annual' : 'monthly',
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          periodEnd,
        })
      } catch (migrationErr) {
        console.error('[access-migration] Erro pós-checkout:', migrationErr)
      }
    }
  }

  try {
    await processMlmCheckoutCommission(supabase, session, userId)
  } catch (mlmErr) {
    console.error('[MLM] Erro ao processar MLM:', mlmErr)
  }

  // A VENDA, para o livro da equipa. Só aqui: este é o sítio onde se sabe que o dinheiro entrou.
  // Se o negócio tiver papéis atribuídos, é esta chamada que cria as comissões deles — e é por
  // isso que o MLM acima já não cria a sua (ver `lib/vendas/exclusividade.ts`).
  await registarVendaDaEquipa({
    referencia: session.id,
    compradorId: userId,
    emailComprador: session.customer_details?.email ?? null,
    pack: planId,
    valorCents: session.amount_total ?? 0,
    moeda: session.currency ?? 'eur',
    tipo: 'primeira',
  })

  // Notificar VIP/Admin + organização ascendente (fire-and-forget)
  try {
    const { data: saleMemberProfile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', userId)
      .single()
    const memberUsername = saleMemberProfile?.username || saleMemberProfile?.full_name || 'membro'
    const eventId = `checkout_${session.id}`
    void notifyTeamSale({
      buyerUserId: userId,
      username: memberUsername,
      planId,
      eventId,
    })
    void sendNewMemberWelcomeIfEligible({
      userId,
      source: 'stripe',
      planId,
      eventId: `welcome_${eventId}`,
    })
  } catch (notifErr) {
    console.error('[NOTIF] Erro ao notificar venda na equipa:', notifErr)
  }
}

/**
 * O addon do MTM Copy às vezes foi pago com OUTRO cliente Stripe (não o do plano principal, que é
 * o que fica em profiles.stripe_customer_id). Sem isto, os eventos do addon desses clientes caíam
 * no "perfil não encontrado" e as renovações nunca ficavam registadas. Só para eventos do addon.
 */
async function perfilDoAddonPeloEmail(customerId: string): Promise<{ id: string; full_name?: string | null; username?: string | null; mlm_sponsor_username?: string | null } | null> {
  try {
    const cliente = await getStripeClient().customers.retrieve(customerId)
    const email = 'deleted' in cliente && cliente.deleted ? null : (cliente as Stripe.Customer).email
    if (!email) return null
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, mlm_sponsor_username')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    return data ?? null
  } catch {
    return null
  }
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, username')
    .eq('stripe_customer_id', sub.customer as string)
    .maybeSingle()

  // Addon do MTM Copy: só os campos do addon. Nunca o plano principal.
  if (subscricaoEhAddon(sub as unknown as Parameters<typeof subscricaoEhAddon>[0])) {
    const alvo = profile ?? (await perfilDoAddonPeloEmail(sub.customer as string))
    if (alvo) await addonSubscricaoAtualizada(supabase, alvo.id, sub as unknown as Parameters<typeof fimDoPeriodo>[0])
    return
  }

  if (!profile) return

  const item = sub.items.data[0]
  const priceId = item?.price?.id || ''
  const planId = getPlanIdFromPriceId(priceId) || item?.price?.metadata?.plan || 'app_member_monthly'
  const plan = normalizeSubscriptionPlan(planId)
  const billingCycle = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly'
  const periodEnd = new Date(stripeSubscriptionPeriodEnd(sub) * 1000).toISOString()

  await supabase.from('profiles').update({
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId || null,
    subscription_status: sub.status === 'active' ? 'active' : sub.status,
    subscription_plan: plan,
    member_category: memberCategoryForPlan(planId),
    subscription_billing_cycle: billingCycle,
    subscription_platform: subscriptionPlatformForStripeCheckout(),
    subscription_expires_at: periodEnd,
    next_billing_at: periodEnd,
    subscription_auto_renew: !sub.cancel_at_period_end,
    is_active: sub.status === 'active' || sub.status === 'trialing',
    payment_failed_count: 0,
  }).eq('id', profile.id)

  // Packs de fundador prometem Premium E o pack de scanners. O Premium ficou na escrita acima; o
  // scanner vive noutro sítio (`profile_data.addons.scanner`) porque se compra e cancela sozinho,
  // e sem esta parte a pessoa pagava e recebia só metade, sem ninguém dar por isso.
  if (planoIncluiScanners(planId) && (sub.status === 'active' || sub.status === 'trialing')) {
    try {
      await concederScannerDoPack(supabase, profile.id, periodEnd)
    } catch (err) {
      console.error('[pack-fundador] falhou conceder o scanner:', err)
    }
  }

  if (
    isPremiumStripePlan(planId) &&
    (sub.status === 'active' || sub.status === 'trialing')
  ) {
    try {
      await handlePremiumStripeSkoolGrant(supabase, profile.id, planId)
    } catch (err) {
      console.error('[SKOOL-ADMIN] Erro no alerta subscription.updated:', err)
    }
  }
}

/**
 * Concede o pack de scanners a quem comprou um pack de fundador. Segue a validade da SUBSCRIÇÃO:
 * quando ela acaba, o scanner acaba com ela — dar validade maior era oferecer o que não foi vendido.
 */
async function concederScannerDoPack(
  db: typeof supabase,
  userId: string,
  validoAte: string,
): Promise<void> {
  const { data } = await db.from('profiles').select('profile_data').eq('id', userId).maybeSingle()
  const dados = (data?.profile_data ?? {}) as Record<string, unknown>
  const addons = (dados.addons ?? {}) as Record<string, unknown>
  await db.from('profiles').update({
    profile_data: {
      ...dados,
      addons: {
        ...addons,
        scanner: {
          plan_id: scannerDoPackFundador(),
          active: true,
          expires_at: validoAte,
          granted_by: 'stripe',
        },
      },
    },
  }).eq('id', userId)
}

async function handleSubscriptionCanceled(sub: Stripe.Subscription) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, member_category, subscription_plan, subscription_platform, checkout_source, stripe_customer_id')
    .eq('stripe_customer_id', sub.customer as string)
    .maybeSingle()

  // Cancelar o addon do MTM Copy desliga SÓ o addon — o perfil (Premium, Membro…) fica activo.
  if (subscricaoEhAddon(sub as unknown as Parameters<typeof subscricaoEhAddon>[0])) {
    const alvo = profile ?? (await perfilDoAddonPeloEmail(sub.customer as string))
    if (alvo) await addonSubscricaoCancelada(supabase, alvo.id)
    return
  }

  if (!profile) return

  const wasPremiumStripe =
    (profile.checkout_source === 'stripe' ||
      profile.subscription_platform === 'manual' ||
      profile.subscription_platform === 'stripe') &&
    Boolean(profile.stripe_customer_id) &&
    (profile.member_category === 'premium' || profile.subscription_plan === 'premium')

  await supabase.from('profiles').update({
    subscription_status: 'canceled',
    is_active: false,
    access_revoked_at: new Date().toISOString(),
    inactive_reason: 'subscription_canceled',
    inactive_since: new Date().toISOString(),
    subscription_auto_renew: false,
  }).eq('id', profile.id)

  if (wasPremiumStripe && profile.email) {
    try {
      await notifyAdminsStripeSkoolAction(supabase, {
        action: 'revoke',
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        username: profile.username,
        planId: profile.subscription_plan || 'premium',
      })
    } catch (err) {
      console.error('[SKOOL-ADMIN] Erro no alerta de cancelamento:', err)
    }
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, username, mlm_sponsor_username, subscription_renewal_count, subscription_plan')
    .eq('stripe_customer_id', invoice.customer as string)
    .maybeSingle()

  // Renovação do addon do MTM Copy: prolonga o addon e regista com o plano certo. Não reactiva o
  // perfil, não oferece desafio MTM Funded (é da renovação do plano principal) e não conta como
  // renovação do plano principal.
  if (faturaEhAddon(invoice as unknown as Parameters<typeof faturaEhAddon>[0])) {
    const alvo = profile ?? (await perfilDoAddonPeloEmail(invoice.customer as string))
    if (!alvo) return
    await addonPagamento(
      supabase,
      alvo.id,
      invoice as unknown as Parameters<typeof faturaEhAddon>[0] & object,
      'succeeded',
      invoice.billing_reason === 'subscription_cycle' ? 'renewal' : 'monthly',
    )
    if (invoice.billing_reason === 'subscription_cycle' && invoice.amount_paid > 0 && invoice.id) {
      void notifyTeamRenewal({
        memberUserId: alvo.id,
        username: alvo.username || alvo.full_name || 'membro',
        planId: PLANO_ADDON_MTMCOPY,
        eventId: `renewal_${invoice.id}`,
      })
      try {
        await processMlmSubscriptionRenewal(supabase, {
          userId: alvo.id,
          sponsorUsername: alvo.mlm_sponsor_username,
          paymentReference: invoice.id,
          amountCents: invoice.amount_paid,
          currency: invoice.currency?.toUpperCase() || 'EUR',
          planId: PLANO_ADDON_MTMCOPY,
        })
      } catch (mlmErr) {
        console.error('[MLM] Erro ao criar comissões de renovação (addon MTM Copy):', mlmErr)
      }
    }
    return
  }

  if (!profile) return

  await supabase.from('profiles').update({
    subscription_status: 'active',
    is_active: true,
    last_payment_at: new Date().toISOString(),
    payment_failed_count: 0,
    subscription_renewal_count: (profile.subscription_renewal_count || 0) + 1,
  }).eq('id', profile.id)

  // O PLANO tem de ficar gravado: sem ele não se consegue responder a "quantos anuais vendemos?"
  // nem separar receita por pack — os 25 pagamentos registados até aqui têm plan a null.
  const planoPago =
    (stripeInvoiceLinePrice(invoice.lines?.data?.[0])?.metadata?.plan as string | undefined) ||
    (stripeInvoiceLinePrice(invoice.lines?.data?.[0])?.id
      ? getPlanIdFromPriceId(stripeInvoiceLinePrice(invoice.lines?.data?.[0])!.id)
      : null) ||
    profile.subscription_plan ||
    null

  await supabase.from('payment_history').insert({
    user_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    plan: planoPago,
    billing_cycle: 'renewal',
    source: 'stripe',
  })

  /**
   * DESAFIO DA RENOVAÇÃO.
   *
   * Quem paga todos os meses ganha, todos os meses, uma oportunidade de chegar a trader
   * financiado: Premium leva um 10K de uma fase, a subscrição de 35 € leva um 3K. As regras
   * (um de cada vez, um por mês, pára quando for financiado) estão em `lib/mtmfunded/ofertas`.
   *
   * É BEST-EFFORT e vem depois de a renovação estar registada. Um erro a emitir um desafio
   * oferecido não pode fazer falhar o processamento de um pagamento que já entrou.
   */
  if (invoice.billing_reason === 'subscription_cycle' && invoice.amount_paid > 0) {
    try {
      const { ofertarDesafioDaRenovacao } = await import('@/lib/mtmfunded/ofertas')
      // A data da fatura, não a de agora: um evento reenviado dias depois continua a ser a
      // renovação daquele dia, e é por ela que a política decide.
      const r = await ofertarDesafioDaRenovacao(profile.id, {
        origem: `fatura ${invoice.id}`,
        em: invoice.created ? invoice.created * 1000 : undefined,
      })
      console.log(
        r.ok
          ? `🎁 [MTMFUNDED] desafio ${r.programa} oferecido a ${profile.id}`
          : `[MTMFUNDED] sem desafio para ${profile.id}: ${r.motivo}`,
      )
    } catch (e) {
      console.error('[MTMFUNDED] falhou a oferta da renovação:', e)
    }
  }

  // Notificações de renovação — VIP/Admin + sponsor + uplines
  if (invoice.billing_reason === 'subscription_cycle' && invoice.amount_paid > 0) {
    const renewalPlanId = planoPago || 'app_member_monthly'
    void notifyTeamRenewal({
      memberUserId: profile.id,
      username: profile.username || profile.full_name || 'membro',
      planId: renewalPlanId,
      eventId: `renewal_${invoice.id}`,
    })
  }

  // ── MLM: comissões em renovação (residual directo + residual de rank) ───
  if (invoice.billing_reason === 'subscription_cycle' && invoice.amount_paid > 0) {
    try {
      const planId =
        (stripeInvoiceLinePrice(invoice.lines?.data?.[0])?.metadata?.plan as string | undefined) ||
        profile.subscription_plan ||
        'app_member_monthly'

      // Sem id de fatura não há chave de deduplicação — e sem ela as comissões podiam
      // ser criadas duas vezes na mesma renovação. Mais vale não processar.
      if (!invoice.id) {
        console.warn('[MLM] Renovação sem invoice.id — comissões ignoradas')
        return
      }
      await processMlmSubscriptionRenewal(supabase, {
        userId: profile.id,
        sponsorUsername: profile.mlm_sponsor_username,
        paymentReference: invoice.id,
        amountCents: invoice.amount_paid,
        currency: invoice.currency?.toUpperCase() || 'EUR',
        planId,
      })
    } catch (mlmErr) {
      console.error('[MLM] Erro ao criar comissões de renovação:', mlmErr)
    }

    // A renovação também é uma venda confirmada: é dela que sai o residual da equipa. O livro
    // trata do resto (o residual só conta do 2.º pagamento em diante).
    if (invoice.id) {
      await registarVendaDaEquipa({
        referencia: invoice.id,
        compradorId: profile.id,
        pack: planoPago,
        valorCents: invoice.amount_paid,
        moeda: invoice.currency ?? 'eur',
        tipo: 'renovacao',
        pagoEm: invoice.created ? new Date(invoice.created * 1000).toISOString() : undefined,
      })
    }
  }
}

/**
 * Registar uma venda confirmada no livro da equipa, sem nunca fazer falhar o webhook.
 *
 * O dinheiro já entrou e o acesso já foi dado quando isto corre: um erro a calcular comissões não
 * pode devolver 500 ao Stripe e fazê-lo repetir o evento inteiro. O que falhar fica no log e a
 * venda pode ser relançada à mão no admin — a referência é única, por isso relançar não duplica.
 */
async function registarVendaDaEquipa(params: {
  referencia: string
  compradorId: string | null
  /** O email do checkout. Chega ao livro porque pode ser a única identidade que existe. */
  emailComprador?: string | null
  pack: string | null
  valorCents: number
  moeda: string
  tipo: 'primeira' | 'renovacao'
  pagoEm?: string
  nota?: string
}): Promise<void> {
  try {
    const r = await registarVendaConfirmada(supabase, {
      fonte: 'stripe',
      referencia: params.referencia,
      compradorId: params.compradorId,
      emailComprador: params.emailComprador ?? null,
      pack: params.pack,
      valorCents: params.valorCents,
      moeda: params.moeda,
      tipo: params.tipo,
      pagoEm: params.pagoEm,
      nota: params.nota,
    })
    if (r.resultado?.semRegra.length) {
      // Isto é para ser visto: alguém trabalhou a venda e não há percentagem definida para lhe
      // pagar. Silenciar era deixar uma dívida a acumular sem ninguém saber.
      console.warn('[VENDAS] venda sem regra de comissão para alguns papéis', {
        venda: r.vendaId,
        faltam: r.resultado.semRegra.map((s) => `${s.papel}: ${s.motivo}`),
      })
    }
  } catch (err) {
    console.error('[VENDAS] não foi possível registar a venda no livro da equipa:', err)
  }
}

/**
 * Uma cobrança devolvida (ou em disputa) → reverter o que ela pagou.
 *
 * As REFERÊNCIAS de uma venda nossa podem ser duas: o id da factura (renovações) e o id da sessão
 * de checkout (primeira compra). Uma `charge` do Stripe traz a factura, mas não a sessão — essa
 * procura-se pelo `payment_intent`. Sem isto, uma devolução de uma primeira compra não encontrava
 * a venda e não revertia nada.
 */
async function estornarCobranca(charge: Stripe.Charge, motivo: string, cents: number | null): Promise<void> {
  const referencias: string[] = []

  // `invoice` saiu dos tipos da Charge nesta versão da biblioteca, mas continua a vir no payload
  // do Stripe — é a mesma leitura por cast que o resto deste ficheiro já faz para `subscription`.
  const facturaBruta = (charge as unknown as { invoice?: string | { id?: string } }).invoice
  const facturaId = typeof facturaBruta === 'string' ? facturaBruta : facturaBruta?.id
  if (facturaId) referencias.push(facturaId)

  const intencao = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (intencao) {
    try {
      const sessoes = await stripe.checkout.sessions.list({ payment_intent: intencao, limit: 5 })
      for (const sessao of sessoes.data) referencias.push(sessao.id)
    } catch (err) {
      console.error('[VENDAS] não foi possível encontrar a sessão de checkout da cobrança:', err)
    }
  }

  if (referencias.length === 0) {
    console.warn('[VENDAS] devolução sem referência utilizável — nada revertido:', charge.id)
    return
  }

  try {
    const r = await estornarVenda(supabase, { fonte: 'stripe', referencias, motivo, cents })
    console.log('[VENDAS] devolução processada', { charge: charge.id, ...r })
  } catch (err) {
    console.error('[VENDAS] falhou a reversão da devolução:', err)
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, payment_failed_count, subscription_plan')
    .eq('stripe_customer_id', invoice.customer as string)
    .maybeSingle()

  // Falha do addon do MTM Copy: regista-se, mas o perfil (plano principal) não é tocado.
  if (faturaEhAddon(invoice as unknown as Parameters<typeof faturaEhAddon>[0])) {
    const alvo = profile ?? (await perfilDoAddonPeloEmail(invoice.customer as string))
    if (!alvo) return
    await addonPagamento(supabase, alvo.id, invoice as unknown as Parameters<typeof faturaEhAddon>[0] & object, 'failed', null)
    return
  }

  if (!profile) return

  const failCount = (profile.payment_failed_count || 0) + 1

  const updates: any = {
    payment_failed_count: failCount,
    subscription_status: failCount >= 3 ? 'unpaid' : 'past_due',
  }

  if (failCount >= 3) {
    updates.is_active = false
    updates.access_revoked_at = new Date().toISOString()
    updates.inactive_reason = 'payment_failed'
    updates.inactive_since = new Date().toISOString()
  }

  await supabase.from('profiles').update(updates).eq('id', profile.id)

  await supabase.from('payment_history').insert({
    user_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    plan:
      (stripeInvoiceLinePrice(invoice.lines?.data?.[0])?.metadata?.plan as string | undefined) ||
      profile.subscription_plan ||
      null,
    source: 'stripe',
  })
}

export const runtime = 'nodejs'

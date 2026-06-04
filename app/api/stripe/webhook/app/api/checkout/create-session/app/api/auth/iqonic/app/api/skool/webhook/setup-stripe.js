#!/usr/bin/env node
// setup-stripe.js — Cria produtos e preços Stripe para o MTM
// Correr UMA VEZ: node setup-stripe.js
// Depois copia os IDs gerados para as env vars do Vercel

const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

async function setup() {
  console.log('🚀 MTM Stripe Setup\n')

  // ─── PRODUTO 1: Subscrição MTM ───────────────────────────────────
  console.log('Criando produto: MTM Subscrição...')
  const subProduct = await stripe.products.create({
    name: 'MTM Subscrição',
    description: 'Acesso completo à plataforma MoreThanMoney — Scanner AI, Educação, Comunidade, Portfólio',
    metadata: { type: 'subscription', site: 'morethanmoney.pt' },
  })

  const priceMonthly = await stripe.prices.create({
    product: subProduct.id,
    unit_amount: 3500, // €35
    currency: 'eur',
    recurring: { interval: 'month' },
    nickname: 'MTM Mensal €35',
    metadata: { plan: 'monthly' },
  })

  const priceAnnual = await stripe.prices.create({
    product: subProduct.id,
    unit_amount: 29700, // €297
    currency: 'eur',
    recurring: { interval: 'year' },
    nickname: 'MTM Anual €297',
    metadata: { plan: 'annual' },
  })

  // ─── PRODUTO 2: Pack $65 ─────────────────────────────────────────
  console.log('Criando produto: Pack $65...')
  const pack65Product = await stripe.products.create({
    name: 'MTM Pack Starter',
    description: 'Pack de entrada MoreThanMoney — Acesso à plataforma + Onboarding personalizado',
    metadata: { type: 'pack', pack: '65' },
  })

  const pricepack65 = await stripe.prices.create({
    product: pack65Product.id,
    unit_amount: 6500, // $65
    currency: 'usd',
    nickname: 'MTM Pack Starter $65',
    metadata: { pack: '65', checkout_type: 'one_time' },
  })

  // ─── PRODUTO 3: Pack $35 ─────────────────────────────────────────
  console.log('Criando produto: Pack $35...')
  const pack35Product = await stripe.products.create({
    name: 'MTM Pack Basic',
    description: 'Pack básico MoreThanMoney — Acesso à plataforma',
    metadata: { type: 'pack', pack: '35' },
  })

  const pricepack35 = await stripe.prices.create({
    product: pack35Product.id,
    unit_amount: 3500, // $35
    currency: 'usd',
    nickname: 'MTM Pack Basic $35',
    metadata: { pack: '35', checkout_type: 'one_time' },
  })

  // ─── Customer Portal ─────────────────────────────────────────────
  console.log('\nConfigurando Customer Portal...')
  try {
    await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'MoreThanMoney — Gestão de Subscrição',
        privacy_policy_url: 'https://www.morethanmoney.pt/privacy',
        terms_of_service_url: 'https://www.morethanmoney.pt/terms',
      },
      features: {
        subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
        subscription_pause: { enabled: false },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: {
          enabled: true,
          allowed_updates: ['email', 'address', 'phone'],
        },
      },
    })
    console.log('✅ Customer Portal configurado')
  } catch (e) {
    console.log('⚠️  Customer Portal já configurado ou erro:', e.message)
  }

  // ─── Output ──────────────────────────────────────────────────────
  console.log('\n✅ CONCLUÍDO! Adiciona estas env vars ao Vercel:\n')
  console.log('─'.repeat(60))
  console.log(`STRIPE_PRICE_MONTHLY=${priceMonthly.id}`)
  console.log(`STRIPE_PRICE_ANNUAL=${priceAnnual.id}`)
  console.log(`STRIPE_PRICE_PACK_65=${pricepack65.id}`)
  console.log(`STRIPE_PRICE_PACK_35=${pricepack35.id}`)
  console.log(`STRIPE_PRODUCT_SUBSCRIPTION=${subProduct.id}`)
  console.log(`STRIPE_PRODUCT_PACK_65=${pack65Product.id}`)
  console.log(`STRIPE_PRODUCT_PACK_35=${pack35Product.id}`)
  console.log('─'.repeat(60))
  console.log('\nConfigura também o webhook em:')
  console.log('https://dashboard.stripe.com/webhooks')
  console.log('URL: https://www.morethanmoney.pt/api/stripe/webhook')
  console.log('Eventos: checkout.session.completed, customer.subscription.created,')
  console.log('         customer.subscription.updated, customer.subscription.deleted,')
  console.log('         invoice.payment_succeeded, invoice.payment_failed')
}

setup().catch(console.error)

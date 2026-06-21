import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isMailConfigured } from '@/lib/system-emails-registry'

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const supabase = getSupabaseAdmin()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'

  const integrations = []

  // Supabase
  let supabaseOk = false
  let profileCount = 0
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    supabaseOk = !error
    profileCount = count ?? 0
  } catch {
    supabaseOk = false
  }

  integrations.push({
    id: 'supabase',
    name: 'Supabase',
    category: 'database',
    configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    connected: supabaseOk,
    detail: supabaseOk ? `${profileCount} perfis na base` : 'Falha na ligação',
    envKeys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    adminLink: null,
  })

  // Stripe
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim())
  integrations.push({
    id: 'stripe',
    name: 'Stripe',
    category: 'payments',
    configured: stripeConfigured,
    connected: stripeConfigured && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    detail: stripeConfigured
      ? process.env.STRIPE_WEBHOOK_SECRET?.trim()
        ? 'Chaves configuradas · webhooks /api/stripe/webhook'
        : 'STRIPE_SECRET_KEY OK · falta STRIPE_WEBHOOK_SECRET'
      : 'STRIPE_SECRET_KEY em falta',
    envKeys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    adminLink: null,
  })

  // MLM
  let mlmActive = false
  let mlmCommission = 20
  try {
    const { data } = await supabase.from('mlm_settings').select('is_active, direct_commission_pct').eq('id', 1).maybeSingle()
    mlmActive = data?.is_active ?? false
    mlmCommission = data?.direct_commission_pct ?? 20
  } catch {
    /* table may not exist */
  }

  integrations.push({
    id: 'mlm',
    name: 'MLM / Afiliados',
    category: 'mlm',
    configured: true,
    connected: mlmActive,
    detail: mlmActive ? `Activo · comissão directa ${mlmCommission}%` : 'Programa MLM desactivado',
    envKeys: [],
    adminLink: '/admin/backoffice',
  })

  // Gmail
  integrations.push({
    id: 'gmail',
    name: 'Gmail SMTP',
    category: 'email',
    configured: isMailConfigured(),
    connected: isMailConfigured(),
    detail: isMailConfigured()
      ? `Envio via ${process.env.GMAIL_USER || 'morethanmoneypt@gmail.com'}`
      : 'GMAIL_APP_PASSWORD em falta',
    envKeys: ['GMAIL_USER', 'GMAIL_APP_PASSWORD'],
    adminLink: '/admin?tab=notifications',
  })

  // Telegram
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim())
  integrations.push({
    id: 'telegram',
    name: 'Telegram Bot',
    category: 'signals',
    configured: telegramConfigured,
    connected: telegramConfigured,
    detail: telegramConfigured ? 'Bot configurado · sinais → app-mobile' : 'TELEGRAM_BOT_TOKEN em falta',
    envKeys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_TRADE_IDEAS', 'TELEGRAM_CHANNEL_PREMIUM_SIGNALS'],
    adminLink: '/app-mobile?tab=chat',
  })

  // Vercel / Site
  integrations.push({
    id: 'vercel',
    name: 'Site / Vercel',
    category: 'hosting',
    configured: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    connected: true,
    detail: siteUrl,
    envKeys: ['NEXT_PUBLIC_SITE_URL'],
    adminLink: siteUrl,
  })

  // Chat channels
  let chatSynced = false
  let chatCount = 0
  try {
    const { data } = await supabase.from('chat_channels').select('slug')
    chatCount = data?.length ?? 0
    const slugs = new Set((data ?? []).map((c) => c.slug))
    chatSynced = ['geral', 'trading', 'trade-ideas-setup', 'premium-ideas'].every((s) => slugs.has(s))
  } catch {
    chatSynced = false
  }

  integrations.push({
    id: 'chat_channels',
    name: 'Chat app-mobile',
    category: 'chat',
    configured: chatCount > 0,
    connected: chatSynced,
    detail: chatSynced
      ? `${chatCount} canais sincronizados`
      : chatCount > 0
        ? `${chatCount} canais · falta sincronizar estrutura MTM`
        : 'Nenhum canal — sincronizar em Definições',
    envKeys: [],
    adminLink: '/app-mobile?tab=chat',
  })

  return NextResponse.json({
    success: true,
    siteUrl,
    integrations,
    summary: {
      total: integrations.length,
      connected: integrations.filter((i) => i.connected).length,
      configured: integrations.filter((i) => i.configured).length,
    },
  })
}

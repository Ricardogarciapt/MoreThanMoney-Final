import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { hasDcaCronRunToday, markDcaCronRun } from '@/lib/cron-dca-guard'
import { isCategoryEnabled, normalizeNotificationPreferences } from '@/lib/notification-preferences'
import { formatDcaChatPost } from '@/lib/dca-post-formatter'
import { resolveSystemUserId } from '@/lib/system-chat-user'

/**
 * CRON: publicação diária DCA Inteligente nos canais #cripto e #etf-stocks
 * Executado às 09:00 UTC
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHANNELS = {
  crypto: { slug: 'cripto', label: 'Cripto', emoji: '₿' },
  etf: { slug: 'etf-stocks', label: 'ETF & Stocks', emoji: '📈' },
} as const

async function publishDcaForType(
  siteUrl: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  systemUserId: string,
  assetType: 'crypto' | 'etf',
) {
  const cronKey = assetType === 'crypto' ? 'daily-dca-post-crypto' : 'daily-dca-post-etf'
  const channel = CHANNELS[assetType]

  if (await hasDcaCronRunToday(cronKey)) {
    return { skipped: true, reason: 'already_ran_today', assetType }
  }

  const dcaResponse = await fetch(`${siteUrl}/api/portfolio/dca-smart?type=${assetType}&ai=1`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  })

  if (!dcaResponse.ok) {
    throw new Error(`Erro ao buscar DCA ${assetType}`)
  }

  const dcaData = await dcaResponse.json()
  if (!dcaData.success) {
    throw new Error(`DCA API ${assetType} retornou erro`)
  }

  const opportunities = dcaData.data.opportunities || []
  const goodOpportunities = opportunities.filter(
    (opp: { recommendation?: string }) =>
      opp.recommendation === 'Forte Compra' || opp.recommendation === 'Compra',
  )

  if (goodOpportunities.length === 0) {
    await markDcaCronRun(cronKey, systemUserId)
    return { skipped: true, reason: 'no_opportunities', assetType, opportunities: 0 }
  }

  const postContent = formatDcaChatPost({
    assetType,
    goodOpportunities,
    aiSummary: dcaData.data.ai_summary,
  })

  const { data: newMessage, error: messageError } = await supabase
    .from('chat_messages')
    .insert({
      channel_slug: channel.slug,
      user_id: systemUserId,
      content: postContent,
      image_url: null,
      link_url: null,
      link_preview: null,
      message_type: 'text',
      reply_to_id: null,
    })
    .select('id, channel_slug, created_at')
    .single()

  if (messageError) {
    throw new Error(messageError.message || `Erro ao publicar em #${channel.slug}`)
  }

  const strongBuys = goodOpportunities.filter((o: { recommendation: string }) => o.recommendation === 'Forte Compra')
  const buys = goodOpportunities.filter((o: { recommendation: string }) => o.recommendation === 'Compra')

  const { data: allUsers } = await supabase
    .from('profiles')
    .select('id, notification_preferences, is_active')
    .eq('is_active', true)

  const dcaRecipients = (allUsers ?? []).filter((user) =>
    isCategoryEnabled(normalizeNotificationPreferences(user.notification_preferences), 'dca'),
  )

  if (dcaRecipients.length > 0) {
    const notificationTitle = `${channel.emoji} ${goodOpportunities.length} Oportunidades DCA · #${channel.label}`
    const notificationBody =
      strongBuys.length > 0
        ? `💎 ${strongBuys.length} FORTE COMPRA — abre #${channel.label} para ver a análise IA.`
        : `🔵 ${buys.length} ativos em boa posição de compra em #${channel.label}.`

    await supabase.from('notifications').insert(
      dcaRecipients.map((user) => ({
        user_id: user.id,
        type: 'dca_daily',
        title: notificationTitle,
        message: notificationBody,
        data: {
          opportunities: goodOpportunities.length,
          strong_buys: strongBuys.length,
          channel: channel.slug,
          asset_type: assetType,
          url: `/app-mobile?tab=chat&channel=${channel.slug}`,
        },
      })),
    )

    try {
      await fetch(`${siteUrl}/api/notifications/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all: true,
          skipInApp: true,
          title: notificationTitle,
          body: notificationBody,
          data: {
            type: 'dca_daily',
            url: `/app-mobile?tab=chat&channel=${channel.slug}`,
            channel: channel.slug,
            asset_type: assetType,
          },
        }),
      })
    } catch {
      /* push opcional */
    }
  }

  await markDcaCronRun(cronKey, systemUserId)

  return {
    skipped: false,
    assetType,
    message_id: newMessage.id,
    channel: channel.slug,
    opportunities: goodOpportunities.length,
    strong_buys: strongBuys.length,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').trim()
    const supabase = getSupabaseAdmin()
    const systemUserId = await resolveSystemUserId(supabase)

    const cryptoResult = await publishDcaForType(siteUrl, supabase, systemUserId, 'crypto')
    const etfResult = await publishDcaForType(siteUrl, supabase, systemUserId, 'etf')

    return NextResponse.json({
      success: true,
      message: 'Cron DCA diário processado (crypto + ETF)',
      crypto: cryptoResult,
      etf: etfResult,
    })
  } catch (error) {
    console.error('❌ [CRON DCA POST]', error)
    const details = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Erro ao processar DCA diário', details }, { status: 500 })
  }
}

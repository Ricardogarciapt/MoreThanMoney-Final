import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { hasDcaCronRunToday, markDcaCronRun } from '@/lib/cron-dca-guard'
import { resolveSystemUserId } from '@/lib/system-chat-user'
import { notifyChatChannelMessage } from '@/lib/chat-channel-notify'
import { gatherMorningBriefingMetrics } from '@/lib/morning-briefing-metrics'
import { generateMorningBriefing } from '@/lib/morning-briefing-ai'

/**
 * CRON: briefing matinal MTM Sistema
 * - Todos os dias: bom dia + briefing adaptativo em #geral + push
 * - Domingos: resumo semanal agregado + desejo de boa semana
 * Horário: 08:00 UTC (~09h Portugal inverno)
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_KEY = 'daily-morning-briefing'
const CHANNEL = 'geral'

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').trim()
    const supabase = getSupabaseAdmin()
    const systemUserId = await resolveSystemUserId(supabase)

    if (await hasDcaCronRunToday(CRON_KEY)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'already_ran_today',
      })
    }

    const metrics = await gatherMorningBriefingMetrics(siteUrl)
    const content = await generateMorningBriefing(metrics)

    const { data: message, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        channel_slug: CHANNEL,
        user_id: systemUserId,
        content: content.chatPost,
        image_url: null,
        link_url: null,
        link_preview: null,
        message_type: 'text',
        reply_to_id: null,
      })
      .select('id, channel_slug, created_at')
      .single()

    if (insertError) {
      throw new Error(insertError.message || 'Erro ao publicar briefing em #geral')
    }

    const pushResult = await notifyChatChannelMessage({
      channelSlug: CHANNEL,
      title: content.pushTitle,
      body: content.pushBody,
      messageId: message.id,
      excludeUserId: systemUserId,
    })

    await markDcaCronRun(CRON_KEY, systemUserId)

    return NextResponse.json({
      success: true,
      message_id: message.id,
      channel: CHANNEL,
      mode: metrics.isSunday ? 'sunday_weekly' : 'daily',
      push: pushResult,
      metrics: {
        active: metrics.community.totalActive,
        new_week: metrics.community.newMembersThisWeek,
      },
    })
  } catch (error) {
    console.error('❌ [CRON MORNING BRIEFING]', error)
    const details = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Erro ao processar briefing matinal', details }, { status: 500 })
  }
}

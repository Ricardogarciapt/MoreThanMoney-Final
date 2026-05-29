import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

// GET: Analytics de campanhas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')
    const period = searchParams.get('period') || '30days' // 7days, 30days, 90days, all
    
    if (campaignId) {
      // Analytics de campanha específica
      return await getCampaignAnalytics(campaignId)
    } else {
      // Analytics geral
      return await getOverallAnalytics(period)
    }
    
  } catch (error: any) {
    console.error('❌ [ANALYTICS] Erro:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// Analytics de campanha específica
async function getCampaignAnalytics(campaignId: string) {
  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()
  
  if (campaignError) throw campaignError
  
  // Buscar todos os envios desta campanha
  const { data: sends, error: sendsError } = await supabase
    .from('email_sends')
    .select('*')
    .eq('campaign_id', campaignId)
  
  if (sendsError) throw sendsError
  
  // Calcular métricas
  const total = sends?.length || 0
  const sent = sends?.filter(s => s.sent_at).length || 0
  const delivered = sends?.filter(s => s.delivered_at).length || 0
  const opened = sends?.filter(s => s.opened_at).length || 0
  const clicked = sends?.filter(s => s.first_clicked_at).length || 0
  const uniqueOpens = new Set(sends?.filter(s => s.opened_at).map(s => s.user_id)).size
  const uniqueClicks = new Set(sends?.filter(s => s.first_clicked_at).map(s => s.user_id)).size
  
  // Calcular taxas
  const openRate = sent > 0 ? (uniqueOpens / sent) * 100 : 0
  const clickRate = sent > 0 ? (uniqueClicks / sent) * 100 : 0
  const clickToOpenRate = uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0
  
  // Top links clicados
  const allClicks = sends?.flatMap(s => s.clicks || []) || []
  const clicksByUrl: Record<string, number> = {}
  
  allClicks.forEach((click: any) => {
    const url = click.url
    clicksByUrl[url] = (clicksByUrl[url] || 0) + 1
  })
  
  const topLinks = Object.entries(clicksByUrl)
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  
  // Timeline de aberturas (por hora)
  const opensByHour: Record<string, number> = {}
  
  sends?.forEach(send => {
    if (send.opened_at) {
      const hour = new Date(send.opened_at).getHours()
      const key = `${hour}:00`
      opensByHour[key] = (opensByHour[key] || 0) + 1
    }
  })
  
  return NextResponse.json({
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      sent_at: campaign.sent_at,
      type: campaign.type,
      segment: campaign.segment
    },
    metrics: {
      total,
      sent,
      delivered,
      opened,
      clicked,
      uniqueOpens,
      uniqueClicks,
      openRate: openRate.toFixed(2),
      clickRate: clickRate.toFixed(2),
      clickToOpenRate: clickToOpenRate.toFixed(2),
      bounced: campaign.emails_bounced || 0,
      unsubscribed: campaign.emails_unsubscribed || 0
    },
    topLinks,
    opensByHour: Object.entries(opensByHour)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
  })
}

// Analytics geral
async function getOverallAnalytics(period: string) {
  // Calcular data de início
  let startDate = new Date()
  
  switch (period) {
    case '7days':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30days':
      startDate.setDate(startDate.getDate() - 30)
      break
    case '90days':
      startDate.setDate(startDate.getDate() - 90)
      break
    case 'all':
      startDate = new Date('2024-01-01')
      break
  }
  
  // Buscar campanhas no período
  const { data: campaigns, error: campaignsError } = await supabase
    .from('email_campaigns')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })
  
  if (campaignsError) throw campaignsError
  
  // Buscar envios no período
  const { data: sends, error: sendsError } = await supabase
    .from('email_sends')
    .select('*')
    .gte('created_at', startDate.toISOString())
  
  if (sendsError) throw sendsError
  
  // Métricas gerais
  const totalCampaigns = campaigns?.length || 0
  const totalEmails = sends?.length || 0
  const totalSent = sends?.filter(s => s.sent_at).length || 0
  const totalOpened = new Set(sends?.filter(s => s.opened_at).map(s => `${s.campaign_id}-${s.user_id}`)).size
  const totalClicked = new Set(sends?.filter(s => s.first_clicked_at).map(s => `${s.campaign_id}-${s.user_id}`)).size
  
  // Calcular taxas médias
  const avgOpenRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0
  const avgClickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0
  
  // Campanhas top (por open rate)
  const campaignStats = campaigns?.map(campaign => {
    const campaignSends = sends?.filter(s => s.campaign_id === campaign.id) || []
    const sent = campaignSends.filter(s => s.sent_at).length
    const opened = new Set(campaignSends.filter(s => s.opened_at).map(s => s.user_id)).size
    const clicked = new Set(campaignSends.filter(s => s.first_clicked_at).map(s => s.user_id)).size
    
    return {
      id: campaign.id,
      name: campaign.name,
      sent,
      opened,
      clicked,
      openRate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : '0',
      clickRate: sent > 0 ? ((clicked / sent) * 100).toFixed(2) : '0',
      sent_at: campaign.sent_at
    }
  }) || []
  
  const topCampaigns = campaignStats
    .filter(c => c.sent > 0)
    .sort((a, b) => parseFloat(b.openRate) - parseFloat(a.openRate))
    .slice(0, 5)
  
  // Emails enviados por dia
  const emailsByDay: Record<string, number> = {}
  
  sends?.forEach(send => {
    if (send.sent_at) {
      const date = new Date(send.sent_at).toISOString().split('T')[0]
      emailsByDay[date] = (emailsByDay[date] || 0) + 1
    }
  })
  
  // Preferências de usuários
  const { data: preferences, error: prefsError } = await supabase
    .from('email_preferences')
    .select('*')
  
  const totalUsers = preferences?.length || 0
  const subscribedMarketing = preferences?.filter(p => p.marketing_emails).length || 0
  const subscribedDCA = preferences?.filter(p => p.dca_notifications).length || 0
  const unsubscribedAll = preferences?.filter(p => p.unsubscribed_all).length || 0
  
  return NextResponse.json({
    success: true,
    period,
    overview: {
      totalCampaigns,
      totalEmails,
      totalSent,
      totalOpened,
      totalClicked,
      avgOpenRate: avgOpenRate.toFixed(2),
      avgClickRate: avgClickRate.toFixed(2)
    },
    topCampaigns,
    emailsByDay: Object.entries(emailsByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    subscribers: {
      total: totalUsers,
      marketingEmails: subscribedMarketing,
      dcaNotifications: subscribedDCA,
      unsubscribed: unsubscribedAll
    },
    campaigns: campaignStats
  })
}


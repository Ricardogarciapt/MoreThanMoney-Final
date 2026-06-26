import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getProviderStrategyMetrics } from '@/lib/mtmcopy/provider-metrics'

export type MorningBriefingMetrics = {
  dateLabel: string
  weekdayLabel: string
  isSunday: boolean
  community: {
    totalActive: number
    newMembersThisWeek: number
    newMembersPriorWeek: number
    weekOverWeekPct: number | null
  }
  engagement: {
    chatMessagesThisWeek: number
    upcomingBookings: number
    bookingsCreatedThisWeek: number
  }
  /** Desempenho dos chats de trading nas últimas 24h (TPs atingidos). */
  trading: {
    tpHits24h: number
    perChannel: { premium: number; sensei: number; forex: number }
    newSenseiIdeas24h: number
  } | null
  /** Desempenho das estratégias MTMcopy (providers) — % de ganho e win rate. */
  providers: Array<{ label: string; gainPct: number | null; winRatePct: number | null; online: boolean }>
  dca: {
    cryptoStrongBuys: number
    cryptoBuys: number
    etfStrongBuys: number
    etfBuys: number
  } | null
}

const SIGNAL_CHANNELS = ['premium-ideas', 'sensei-scanner', 'trade-ideas-setup', 'trade-ideas'] as const

function isTpHit(content: string): boolean {
  const c = content.toLowerCase()
  return (c.includes('tp') && (c.includes('hit') || c.includes('atingi'))) || c.includes('take profit')
}

function lisbonWeekday(): { weekday: string; isSunday: boolean; dateLabel: string } {
  const now = new Date()
  const weekday = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
  }).format(now)
  const dateLabel = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    weekday: 'short',
  }).format(now)
  return { weekday, isSunday: short === 'Sun', dateLabel }
}

function weekOverWeekPct(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? 100 : null
  return Math.round(((current - prior) / prior) * 100)
}

async function fetchDcaSnapshot(siteUrl: string): Promise<MorningBriefingMetrics['dca']> {
  try {
    const [cryptoRes, etfRes] = await Promise.all([
      fetch(`${siteUrl}/api/portfolio/dca-smart?type=crypto&ai=0`, { cache: 'no-store' }),
      fetch(`${siteUrl}/api/portfolio/dca-smart?type=etf&ai=0`, { cache: 'no-store' }),
    ])
    if (!cryptoRes.ok && !etfRes.ok) return null

    const crypto = cryptoRes.ok ? await cryptoRes.json() : null
    const etf = etfRes.ok ? await etfRes.json() : null
    const cSummary = crypto?.data?.summary
    const eSummary = etf?.data?.summary

    return {
      cryptoStrongBuys: cSummary?.strong_buy_count ?? 0,
      cryptoBuys: cSummary?.buy_count ?? 0,
      etfStrongBuys: eSummary?.strong_buy_count ?? 0,
      etfBuys: eSummary?.buy_count ?? 0,
    }
  } catch {
    return null
  }
}

export async function gatherMorningBriefingMetrics(siteUrl: string): Promise<MorningBriefingMetrics> {
  const supabase = getSupabaseAdmin()
  const { weekday, isSunday, dateLabel } = lisbonWeekday()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [
    activeCount,
    newThisWeek,
    newPriorWeek,
    chatWeek,
    bookingsWeek,
    upcomingBookings,
    dca,
    tpHitMsgs,
    senseiIdeas24h,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fourteenDaysAgo)
      .lt('created_at', sevenDaysAgo),
    supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('calendly_bookings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('calendly_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('start_time', now.toISOString()),
    fetchDcaSnapshot(siteUrl),
    supabase
      .from('chat_messages')
      .select('channel_slug, content')
      .gte('created_at', oneDayAgo)
      .in('channel_slug', SIGNAL_CHANNELS as unknown as string[])
      .or('content.ilike.%hit%,content.ilike.%atingi%,content.ilike.%take profit%')
      .limit(800),
    supabase
      .from('sensei_trade_ideas')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo),
  ])

  const newMembersThisWeek = newThisWeek.count ?? 0
  const newMembersPriorWeek = newPriorWeek.count ?? 0

  const tpRows = ((tpHitMsgs as { data?: Array<{ channel_slug: string; content: string }> }).data ?? [])
    .filter((r) => isTpHit(r.content ?? ''))
  const trading = {
    tpHits24h: tpRows.length,
    perChannel: {
      premium: tpRows.filter((r) => r.channel_slug === 'premium-ideas').length,
      sensei: tpRows.filter((r) => r.channel_slug === 'sensei-scanner').length,
      forex: tpRows.filter((r) => r.channel_slug === 'trade-ideas-setup' || r.channel_slug === 'trade-ideas').length,
    },
    newSenseiIdeas24h: (senseiIdeas24h as { count?: number }).count ?? 0,
  }

  let providers: MorningBriefingMetrics['providers'] = []
  try {
    const perf = await getProviderStrategyMetrics()
    providers = (perf.providers ?? []).map((p) => ({
      label: p.label,
      gainPct: p.gainPct,
      winRatePct: p.winRatePct,
      online: p.online,
    }))
  } catch {
    providers = []
  }

  return {
    dateLabel,
    weekdayLabel: weekday,
    isSunday,
    community: {
      totalActive: activeCount.count ?? 0,
      newMembersThisWeek,
      newMembersPriorWeek,
      weekOverWeekPct: weekOverWeekPct(newMembersThisWeek, newMembersPriorWeek),
    },
    engagement: {
      chatMessagesThisWeek: chatWeek.count ?? 0,
      upcomingBookings: upcomingBookings.count ?? 0,
      bookingsCreatedThisWeek: bookingsWeek.count ?? 0,
    },
    trading,
    providers,
    dca,
  }
}

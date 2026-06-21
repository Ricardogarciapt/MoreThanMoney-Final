import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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
  dca: {
    cryptoStrongBuys: number
    cryptoBuys: number
    etfStrongBuys: number
    etfBuys: number
  } | null
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

  const [
    activeCount,
    newThisWeek,
    newPriorWeek,
    chatWeek,
    bookingsWeek,
    upcomingBookings,
    dca,
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
  ])

  const newMembersThisWeek = newThisWeek.count ?? 0
  const newMembersPriorWeek = newPriorWeek.count ?? 0

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
    dca,
  }
}

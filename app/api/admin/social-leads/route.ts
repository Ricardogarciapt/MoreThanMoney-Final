/**
 * API admin — Leads do funil IG (ig_leads) + log de engagement (ig_engagement_log).
 * Read-only para o painel /admin/social/leads.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const [leadsQ, engageQ, tgQ] = await Promise.all([
      supabase.from("ig_leads").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("ig_engagement_log").select("*").order("replied_at", { ascending: false }).limit(300),
      supabase.from("telegram_leads").select("*").order("updated_at", { ascending: false }).limit(300),
    ])
    const leads = (leadsQ.data || []) as Record<string, any>[]
    const engage = (engageQ.data || []) as Record<string, any>[]
    const telegram = (tgQ.data || []) as Record<string, any>[]

    const dmsSent = leads.filter((l) => l.dm_status === "sent").length
    const publicFb = leads.filter((l) => l.dm_status === "public_fallback").length
    const windowExp = leads.filter((l) => l.dm_status === "window_expired").length
    const byIntent = leads.reduce((acc: Record<string, number>, l) => {
      const k = l.intent || "?"
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
    const repliesOk = engage.filter((e) => e.status === "replied").length
    const tgByStage = telegram.reduce((acc: Record<string, number>, t) => {
      const k = t.stage || "?"
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
    const tgGranted = telegram.filter((t) => t.stage === "granted").length

    return NextResponse.json({
      leads,
      engage,
      telegram,
      stats: {
        totalLeads: leads.length, dmsSent, publicFb, windowExp, byIntent,
        totalReplies: engage.length, repliesOk,
        telegramTotal: telegram.length, tgGranted, tgByStage,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "erro", leads: [], engage: [], stats: {} }, { status: 500 })
  }
}

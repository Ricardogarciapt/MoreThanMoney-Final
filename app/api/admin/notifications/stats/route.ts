import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [
      { data: emailCampaigns },
      { data: emailSends },
      { data: pendingNotifications },
      { count: pushCount },
    ] = await Promise.all([
      supabase
        .from('email_campaigns')
        .select('emails_sent, emails_opened, emails_clicked, emails_bounced, status')
        .not('emails_sent', 'is', null),
      Promise.resolve(
        supabase
          .from('email_sends')
          .select('status')
          .gte('created_at', thirtyDaysAgo.toISOString()),
      ).catch(() => ({ data: [] as { status: string }[] })),
      supabase
        .from('notification_configs')
        .select('id, status')
        .eq('status', 'draft'),
      Promise.resolve(
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString()),
      ).catch(() => ({ count: 0 })),
    ])

    const campaignSent = emailCampaigns?.reduce((sum, c) => sum + (c.emails_sent || 0), 0) || 0
    const transactionalSent =
      (emailSends || []).filter((s) => s.status === 'sent' || s.status === 'delivered').length
    const totalEmail = campaignSent + transactionalSent
    const successCount = emailCampaigns?.filter((c) => c.status === 'sent').length || 0
    const totalCampaigns = emailCampaigns?.length || 0
    const failedTransactional = (emailSends || []).filter(
      (s) => s.status === 'failed' || s.status === 'bounced',
    ).length

    const stats = {
      totalSent: totalEmail + (pushCount || 0),
      emailNotifications: totalEmail,
      pushNotifications: pushCount || 0,
      successRate:
        totalCampaigns > 0 || transactionalSent > 0
          ? Math.round(
              ((successCount + transactionalSent) /
                Math.max(totalCampaigns + transactionalSent + failedTransactional, 1)) *
                100,
            )
          : 100,
      pendingNotifications: pendingNotifications?.length || 0,
      failedLast30Days: failedTransactional,
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json({ success: true, stats })
  } catch (error) {
    console.error('[NOTIFICATIONS_STATS] Error:', error)
    return NextResponse.json({
      success: true,
      stats: {
        totalSent: 0,
        emailNotifications: 0,
        pushNotifications: 0,
        successRate: 100,
        pendingNotifications: 0,
        failedLast30Days: 0,
        lastUpdated: new Date().toISOString(),
      },
    })
  }
}

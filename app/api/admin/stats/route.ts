import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { AdminStats } from "@/lib/admin-types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Get user statistics
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, user_type, is_active, created_at')

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    // Get content statistics
    const { data: content, error: contentError } = await supabase
      .from('site_content')
      .select('id, is_active, created_at')

    if (contentError) {
      console.warn('Site content table might not exist:', contentError.message)
    }

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: activity, error: activityError } = await supabase
      .from('activity_logs')
      .select('*')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(50)

    if (activityError) {
      console.warn('Activity logs table might not exist:', activityError.message)
    }

    const stats: AdminStats = {
      total_users: users?.length || 0,
      active_users: users?.filter(u => u.is_active).length || 0,
      pending_users: users?.filter(u => u.user_type === 'pending').length || 0,
      total_members: users?.filter(u => u.user_type === 'member').length || 0,
      total_content: content?.length || 0,
      active_content: content?.filter(c => c.is_active).length || 0,
      recent_activity: activity || []
    }

    return NextResponse.json({ data: stats })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

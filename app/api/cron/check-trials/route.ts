import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

/** Desativa trials expirados — corre diariamente via Vercel Cron. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date()

  const { data: trialUsers, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, user_type, trial_expires_at")
    .in("user_type", ["guest", "presentation"])
    .eq("trial_expired", false)
    .not("trial_expires_at", "is", null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const expired: string[] = []

  for (const user of trialUsers || []) {
    const expiryDate = new Date(user.trial_expires_at)
    if (expiryDate >= now) continue

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        is_active: false,
        trial_expired: true,
        updated_at: now.toISOString(),
      })
      .eq("id", user.id)

    if (!updateError) expired.push(user.email || user.id)
  }

  return NextResponse.json({
    success: true,
    checked_at: now.toISOString(),
    total_checked: trialUsers?.length || 0,
    expired_count: expired.length,
    expired_users: expired,
  })
}

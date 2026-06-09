import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { addDays, isSubscriptionCategory } from "@/lib/member-subscription"

export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === "development"
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

/** Renova subscrições IQ/Skool (+30d) ou desativa contas expiradas sem auto-renovação. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: due, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, member_category, subscription_expires_at, subscription_auto_renew, subscription_billing_cycle, user_type")
    .in("member_category", ["iq", "skool", "premium"])
    .not("subscription_expires_at", "is", null)
    .lt("subscription_expires_at", nowIso)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const renewed: string[] = []
  const deactivated: string[] = []

  for (const row of due || []) {
    if (!isSubscriptionCategory(row.member_category)) continue

    if (row.subscription_auto_renew !== false) {
      // Respeitar ciclo de faturação: anual = 365 dias, mensal = 30 dias
      const renewDays = row.subscription_billing_cycle === "annual" ? 365 : 30
      const newExpiry = addDays(new Date(), renewDays).toISOString()

      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_expires_at: newExpiry,
          is_active: true,
          user_type: row.user_type === "inactive" ? "member" : row.user_type,
          updated_at: nowIso,
        })
        .eq("id", row.id)

      if (!error) renewed.push(row.email || row.id)
    } else {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_active: false,
          user_type: "inactive",
          updated_at: nowIso,
        })
        .eq("id", row.id)

      if (!error) deactivated.push(row.email || row.id)
    }
  }

  return NextResponse.json({
    success: true,
    checked_at: nowIso,
    expired_found: due?.length || 0,
    renewed_count: renewed.length,
    deactivated_count: deactivated.length,
    renewed,
    deactivated,
  })
}

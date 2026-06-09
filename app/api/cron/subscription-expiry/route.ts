import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === "development"
  return request.headers.get("authorization") === `Bearer ${secret}`
}

/**
 * Cron diário às 8h — avisa utilizadores cujas subscrições expiram em 7, 3 ou 1 dia(s).
 * Só notifica utilizadores com subscription_auto_renew = false (quem tem auto-renovação não precisa de aviso).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt"

  const warnings = [
    { days: 7, label: "7 dias" },
    { days: 3, label: "3 dias" },
    { days: 1, label: "1 dia" },
  ]

  let totalNotified = 0
  const errors: string[] = []
  const notified: string[] = []

  for (const { days, label } of warnings) {
    // Janela de ±12h em torno do alvo para não duplicar avisos
    const windowStart = new Date(now.getTime() + (days - 0.5) * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + (days + 0.5) * 24 * 60 * 60 * 1000)

    const { data: expiring, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, full_name, subscription_expires_at, member_category")
      .in("member_category", ["iq", "skool", "premium"])
      .eq("subscription_auto_renew", false)
      .eq("is_active", true)
      .gte("subscription_expires_at", windowStart.toISOString())
      .lt("subscription_expires_at", windowEnd.toISOString())

    if (fetchError) {
      errors.push(`Erro ao buscar (${days}d): ${fetchError.message}`)
      continue
    }

    for (const user of expiring || []) {
      try {
        const title = `⚠️ Subscrição expira em ${label}`
        const message = `A tua subscrição MTM expira em ${label}. Renova para continuares a ter acesso completo.`

        // Guardar notificação in-app
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "subscription_expiry",
          title,
          message,
          read: false,
          data: {
            days_remaining: days,
            expires_at: user.subscription_expires_at,
            url: "/member-area?tab=subscription",
          },
        })

        // Enviar push notification
        const pushRes = await fetch(`${siteUrl}/api/notifications/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            title,
            body: message,
            data: {
              type: "subscription_expiry",
              url: "/member-area?tab=subscription",
              days_remaining: String(days),
            },
          }),
        })

        if (!pushRes.ok) {
          console.warn(`⚠️ [EXPIRY CRON] Push falhou para ${user.email}`)
        }

        notified.push(`${user.email} (${days}d)`)
        totalNotified++
      } catch (err) {
        errors.push(`Erro ao notificar ${user.email}: ${err instanceof Error ? err.message : "unknown"}`)
      }
    }
  }

  return NextResponse.json({
    success: true,
    checked_at: now.toISOString(),
    total_notified: totalNotified,
    notified,
    errors: errors.length ? errors : undefined,
  })
}

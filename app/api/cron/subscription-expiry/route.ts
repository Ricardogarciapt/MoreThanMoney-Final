import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isInternalApiRequest } from "@/lib/internal-api"
import { mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } from "@/lib/mail-transport"
import { buildRenewalEmail } from "@/lib/renewal-emails"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  if (isInternalApiRequest(request)) return true
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === "development"
  return request.headers.get("authorization") === `Bearer ${secret}`
}

function firstName(full?: string | null, email?: string): string {
  const n = (full || "").trim()
  if (n) return n.split(/\s+/)[0]
  return (email || "").split("@")[0]
}

/**
 * Aviso de renovação por EMAIL, 2 dias antes de a subscrição terminar.
 *
 * Cobre os dois casos, ao contrário dos avisos push (que só falam a quem não tem
 * auto-renovação): quem renova sozinho recebe um aviso de transparência com o dia e o
 * valor, quem não renova recebe o pedido de renovação com a escolha de pack.
 *
 * Idempotente pelo registo em `notifications` (type='renewal_email'): mesmo que o cron
 * corra duas vezes no mesmo dia, cada pessoa só recebe um email por ciclo.
 */
async function sendRenewalEmails(opts: { dryRun: boolean; daysAhead: number }) {
  const supabase = getSupabaseAdmin()
  const now = new Date()
  // Janela CUMULATIVA, não uma fatia de ±12h: avisa toda a gente a quem faltam `daysAhead`
  // dias ou menos e que ainda não foi avisada deste ciclo (a idempotência abaixo trata dos
  // repetidos). Uma fatia estreita deixava passar quem expirava a umas horas do limite.
  const windowStart = new Date(now.getTime() - 86_400_000)
  const windowEnd = new Date(now.getTime() + opts.daysAhead * 86_400_000)

  const { data: due } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_expires_at, subscription_plan, subscription_billing_cycle, subscription_auto_renew")
    .eq("is_active", true)
    .not("subscription_expires_at", "is", null)
    .gte("subscription_expires_at", windowStart.toISOString())
    .lt("subscription_expires_at", windowEnd.toISOString())

  const alvos = (due ?? []).filter((u) => u.email)
  const enviados: string[] = []
  const saltados: string[] = []

  if (!alvos.length) return { enviados, saltados, total: 0 }

  const transporter =
    !opts.dryRun && process.env.GMAIL_APP_PASSWORD
      ? nodemailer.createTransport({
          pool: true,
          maxConnections: 1,
          maxMessages: Infinity,
          service: "gmail",
          auth: { user: process.env.GMAIL_USER || "morethanmoneypt@gmail.com", pass: process.env.GMAIL_APP_PASSWORD },
          rateDelta: 1000,
          rateLimit: 3,
        })
      : null

  for (const u of alvos) {
    // Já avisado neste ciclo? (mesma data de expiração → mesmo aviso)
    const { data: jaEnviado } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", u.id)
      .eq("type", "renewal_email")
      .eq("data->>expires_at", u.subscription_expires_at as string)
      .maybeSingle()
    if (jaEnviado) {
      saltados.push(`${u.email} (já avisado)`)
      continue
    }

    // Valor do último pagamento — só para dizer o número certo a quem renova sozinho.
    const { data: ultimo } = await supabase
      .from("payment_history")
      .select("amount, currency")
      .eq("user_id", u.id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const kind = u.subscription_auto_renew === false ? "manual" : "auto"
    const mail = buildRenewalEmail(kind, {
      nome: firstName(u.full_name, u.email as string),
      email: u.email as string,
      expiraEm: u.subscription_expires_at as string,
      plan: u.subscription_plan,
      ciclo: u.subscription_billing_cycle,
      ultimoValorCents: (ultimo as { amount?: number } | null)?.amount ?? null,
      moeda: (ultimo as { currency?: string } | null)?.currency ?? null,
    })

    if (transporter) {
      try {
        await transporter.sendMail({
          from: mailFrom(),
          to: u.email as string,
          subject: mail.subject,
          html: prepareBrandedEmailHtml(mail.html),
          text: mail.text,
          attachments: brandedMailAttachments(),
        })
        await supabase.from("notifications").insert({
          user_id: u.id,
          type: "renewal_email",
          title: mail.subject,
          message: `Aviso de renovação enviado (${kind}).`,
          read: false,
          data: { expires_at: u.subscription_expires_at, kind, url: "/member-area?tab=subscription" },
        })
      } catch (err) {
        saltados.push(`${u.email}: ${err instanceof Error ? err.message : "erro"}`)
        continue
      }
    }
    enviados.push(`${u.email} (${kind})`)
  }

  transporter?.close()
  return { enviados, saltados, total: alvos.length }
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

  // Aviso por email a 2 dias — cobre auto-renovação e renovação manual.
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1"
  const daysAhead = Number(request.nextUrl.searchParams.get("days") ?? 2)
  const renewal = await sendRenewalEmails({ dryRun, daysAhead })

  return NextResponse.json({
    success: true,
    checked_at: now.toISOString(),
    total_notified: totalNotified,
    notified,
    renewal_emails: renewal,
    errors: errors.length ? errors : undefined,
  })
}

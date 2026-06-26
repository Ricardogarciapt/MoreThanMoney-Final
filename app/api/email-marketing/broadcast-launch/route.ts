import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  createMailTransporter,
  mailFrom,
  brandedMailAttachments,
  prepareBrandedEmailHtml,
} from "@/lib/mail-transport"
import { platformLaunchEmailTemplate } from "@/lib/email-templates"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Broadcast ONE-OFF do email de lançamento MoreThanMoney a todos os membros.
 * Protegido por chave de uso único (ONE_TIME_KEY) — esta rota é removida após o envio.
 */
const ONE_TIME_KEY = "mtm-launch-2026-06-26-9f8a7b6c5d4e3f2a"
const SUBJECT = "🚀 Chegou a MoreThanMoney — ativa o teu acesso"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (body.key !== ONE_TIME_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: "GMAIL_APP_PASSWORD em falta" }, { status: 500 })
  }

  const dryRun = body.dryRun === true
  const supabase = getSupabaseAdmin()
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .not("email", "is", null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // dedupe por email válido
  const seen = new Set<string>()
  const recipients = (profiles ?? [])
    .map((p) => ({ email: String(p.email ?? "").trim().toLowerCase(), name: (p.full_name as string | null) ?? "" }))
    .filter((r) => {
      if (!r.email || !r.email.includes("@") || seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })

  if (dryRun) {
    return NextResponse.json({ dryRun: true, recipients: recipients.length, sample: recipients.slice(0, 3).map((r) => r.email) })
  }

  const transporter = createMailTransporter()
  const attachments = brandedMailAttachments()
  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const r of recipients) {
    try {
      const html = prepareBrandedEmailHtml(platformLaunchEmailTemplate(r.name || undefined))
      await transporter.sendMail({
        from: mailFrom(),
        to: r.email,
        subject: SUBJECT,
        html,
        attachments,
      })
      sent++
    } catch (e) {
      failed++
      if (errors.length < 8) errors.push(`${r.email}: ${e instanceof Error ? e.message : "erro"}`)
    }
    // pequeno atraso para evitar throttling do Gmail SMTP
    await new Promise((res) => setTimeout(res, 350))
  }

  return NextResponse.json({ success: true, total: recipients.length, sent, failed, errors })
}

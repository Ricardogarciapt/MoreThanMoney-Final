import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  mailFrom,
  brandedMailAttachments,
  prepareBrandedEmailHtml,
} from "@/lib/mail-transport"
import { platformLaunchEmailTemplate } from "@/lib/email-templates"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Broadcast ONE-OFF do email de lançamento MoreThanMoney.
 * Protegido por chave de uso único — esta rota é removida após o envio.
 * Usa transporte POOLED (1 ligação / 1 login) para evitar o throttle do Gmail.
 */
const ONE_TIME_KEY = "mtm-launch-2026-06-26-9f8a7b6c5d4e3f2a"
const SUBJECT = "🚀 Chegou a MoreThanMoney — ativa o teu acesso"

async function loadRecipients() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .not("email", "is", null)
  if (error) throw new Error(error.message)
  const seen = new Set<string>()
  return (data ?? [])
    .map((p) => ({ email: String(p.email ?? "").trim().toLowerCase(), name: (p.full_name as string | null) ?? "" }))
    .filter((r) => {
      if (!r.email || !r.email.includes("@") || seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (body.key !== ONE_TIME_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let recipients = await loadRecipients()

  // mode=list → devolve a lista ordenada exatamente como o envio a processa
  if (body.mode === "list") {
    return NextResponse.json({ total: recipients.length, emails: recipients.map((r) => r.email) })
  }

  // onlyEmails → enviar apenas a este subconjunto (ex.: reenviar falhados)
  if (Array.isArray(body.onlyEmails) && body.onlyEmails.length) {
    const only = new Set((body.onlyEmails as string[]).map((e) => String(e).trim().toLowerCase()))
    recipients = recipients.filter((r) => only.has(r.email))
  }

  if (body.dryRun === true) {
    return NextResponse.json({ dryRun: true, recipients: recipients.length, sample: recipients.slice(0, 3).map((r) => r.email) })
  }
  if (!process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: "GMAIL_APP_PASSWORD em falta" }, { status: 500 })
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 1,
    maxMessages: 200,
    auth: {
      user: process.env.GMAIL_USER || "morethanmoneypt@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "",
    },
  })

  const attachments = brandedMailAttachments()
  let sent = 0
  let failed = 0
  const failedEmails: string[] = []

  for (const r of recipients) {
    try {
      const html = prepareBrandedEmailHtml(platformLaunchEmailTemplate(r.name || undefined))
      await transporter.sendMail({ from: mailFrom(), to: r.email, subject: SUBJECT, html, attachments })
      sent++
    } catch {
      failed++
      failedEmails.push(r.email)
    }
    await new Promise((res) => setTimeout(res, 600))
  }
  transporter.close()

  return NextResponse.json({ success: true, total: recipients.length, sent, failed, failedEmails })
}

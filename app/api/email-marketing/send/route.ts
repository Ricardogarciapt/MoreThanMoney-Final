import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { brandedMailAttachments, prepareBrandedEmailHtml, getSiteUrl } from "@/lib/mail-transport"
import { isInternalApiRequest } from "@/lib/internal-api"
import { requireAdmin } from "@/lib/admin-api-helpers"
import * as emailTemplates from "@/lib/email-templates"

/** Templates branded disponíveis para envio transacional (1 destinatário). */
const TRANSACTIONAL_TEMPLATES: Record<string, { subject: string; render: (name?: string, siteUrl?: string) => string }> = {
  unsubscribe_confirmation: {
    subject: "Confirmação — saíste da lista MoreThanMoney",
    render: emailTemplates.unsubscribeConfirmationEmailTemplate,
  },
  android_update: {
    subject: "A app Android MoreThanMoney foi atualizada",
    render: emailTemplates.androidUpdateEmailTemplate,
  },
}

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER || "morethanmoneypt@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "",
    },
  })

/** Envio transacional simples (admin notifications, alertas manuais). */
export async function POST(request: NextRequest) {
  if (!isInternalApiRequest(request)) {
    const denied = await requireAdmin(request)
    if (denied) return denied
  }
  try {
    const body = await request.json()
    let { subject, html } = body as { subject?: string; html?: string }
    const { to, text, template, userName } = body as {
      to?: string
      text?: string
      template?: string
      userName?: string
    }

    // Template branded (ex.: 'unsubscribe_confirmation') → renderiza server-side,
    // basta { to, template } (subject/html preenchidos automaticamente).
    if (template && TRANSACTIONAL_TEMPLATES[template]) {
      const t = TRANSACTIONAL_TEMPLATES[template]
      html = t.render(userName, getSiteUrl())
      subject = subject || t.subject
    }

    if (!to || !subject || (!html && !text)) {
      return NextResponse.json(
        { success: false, error: "to, subject e html/text são obrigatórios" },
        { status: 400 }
      )
    }

    if (!process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "GMAIL_APP_PASSWORD não configurada" },
        { status: 500 }
      )
    }

    const transporter = createTransporter()
    await transporter.sendMail({
      from: `"MoreThanMoney" <${process.env.GMAIL_USER || "morethanmoneypt@gmail.com"}>`,
      to,
      subject,
      html: html ? prepareBrandedEmailHtml(html) : undefined,
      text: text || undefined,
      attachments: html ? brandedMailAttachments() : undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[EMAIL SEND] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao enviar email",
      },
      { status: 500 }
    )
  }
}

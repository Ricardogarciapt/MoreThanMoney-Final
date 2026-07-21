import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { isInternalApiRequest } from "@/lib/internal-api"
import {
  mailFrom,
  prepareBrandedEmailHtml,
  brandedMailAttachments,
} from "@/lib/mail-transport"
import { buildBroadcast } from "@/lib/broadcast-emails"

/**
 * Transporter POOLED: uma única ligação/login reutilizado para todo o lote.
 * (O Gmail bloqueia com "454 Too many login attempts" se cada email reautenticar.)
 */
function createPooledTransporter() {
  return nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: Infinity,
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER || "morethanmoneypt@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "",
    },
    rateDelta: 1000,
    rateLimit: 3,
  })
}

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST /api/admin/broadcast
 * Envio em massa à comunidade (profiles com email) via Gmail (credenciais da Vercel).
 * Auth: token interno OU sessão admin.
 * Body: { template?: "app_review"|"monthly_challenge", dryRun?, test?, testTo?, offset?, limit? }
 * - dryRun: só conta destinatários.
 * - test: envia 1 email (testTo ou GMAIL_USER).
 * - offset/limit: processa um lote (default: todos). Devolve nextOffset/done p/ repetir.
 */
function firstName(p: { full_name?: string | null; username?: string | null }): string {
  const n = (p.full_name || p.username || "").trim()
  return n ? n.split(/\s+/)[0] : "Malta"
}

export async function POST(request: NextRequest) {
  if (!isInternalApiRequest(request)) {
    const denied = await requireAdmin(request)
    if (denied) return denied
  }

  if (!process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { success: false, error: "GMAIL_APP_PASSWORD não configurada" },
      { status: 503 },
    )
  }

  let body: any = {}
  try { body = await request.json() } catch { /* vazio */ }
  const template = String(body.template || "app_review")
  const segment = body.segment ? String(body.segment) : null
  const dryRun = !!body.dryRun
  const test = !!body.test
  const testTo = body.testTo ? String(body.testTo) : (process.env.GMAIL_USER || "morethanmoneypt@gmail.com")
  const offset = Number.isFinite(body.offset) ? Math.max(0, Number(body.offset)) : 0
  const limit = Number.isFinite(body.limit) ? Math.max(1, Number(body.limit)) : 1000

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, username, conversion_deadline, stripe_subscription_id, subscription_platform")
    .not("email", "is", null)
    .order("id", { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const recipients = (data || [])
    .filter((p: any) => p.email && /@/.test(p.email))
    .filter((p: any) => {
      const k = String(p.email).toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

  // Segmentação opcional. "founder_conversion": só o cohort grátis-concedido (Fundador)
  // com deadline ativo, sem subscrição paga, excluindo emails de teste.
  let filtered = recipients
  if (segment === "founder_conversion") {
    const now = Date.now()
    filtered = recipients.filter(
      (p: any) =>
        p.conversion_deadline &&
        new Date(p.conversion_deadline).getTime() > now &&
        !p.stripe_subscription_id &&
        !["stripe", "apple"].includes(String(p.subscription_platform || "").toLowerCase()) &&
        !/@test\.|@example\./i.test(String(p.email)),
    )
  }

  const total = filtered.length

  if (dryRun) {
    return NextResponse.json({ success: true, dryRun: true, total, template, segment })
  }

  const transporter = createPooledTransporter()

  if (test) {
    const mail = buildBroadcast(template, "Ricardo")
    await transporter.sendMail({
      from: mailFrom(),
      to: testTo,
      subject: `[TESTE] ${mail.subject}`,
      html: prepareBrandedEmailHtml(mail.html),
      text: mail.text,
      attachments: brandedMailAttachments(),
    })
    transporter.close()
    return NextResponse.json({ success: true, test: true, to: testTo, subject: mail.subject })
  }

  const batch = filtered.slice(offset, offset + limit)
  let sent = 0
  let failed = 0
  const failures: string[] = []

  for (const p of batch) {
    try {
      const mail = buildBroadcast(template, firstName(p))
      await transporter.sendMail({
        from: mailFrom(),
        to: p.email,
        subject: mail.subject,
        html: prepareBrandedEmailHtml(mail.html),
        text: mail.text,
        attachments: brandedMailAttachments(),
      })
      sent++
      await new Promise((r) => setTimeout(r, 350))
    } catch (e: any) {
      failed++
      failures.push(`${p.email}: ${e?.message || "erro"}`)
    }
  }

  transporter.close()
  const nextOffset = offset + batch.length
  const done = nextOffset >= total

  return NextResponse.json({
    success: true,
    template,
    total,
    processed: batch.length,
    sent,
    failed,
    failures: failures.slice(0, 50),
    nextOffset: done ? null : nextOffset,
    done,
  })
}

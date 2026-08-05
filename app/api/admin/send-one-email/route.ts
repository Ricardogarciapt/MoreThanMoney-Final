import { NextRequest, NextResponse } from 'next/server'
import {
  createMailTransporter,
  mailFrom,
  prepareBrandedEmailHtml,
  brandedMailAttachments,
} from '@/lib/mail-transport'

/**
 * Envio one-off de email transacional pelo transporter do site (Gmail SMTP → morethanmoneypt@gmail.com).
 * Bearer CRON_SECRET. body: { to, subject, html, text? }. Uso pontual (ex.: link de pagamento a um cliente).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as { to?: string; subject?: string; html?: string; text?: string }
  const to = (b.to || '').trim()
  const subject = (b.subject || '').trim()
  const html = b.html || ''
  if (!to || !subject || !html.trim()) {
    return NextResponse.json({ ok: false, error: 'to, subject e html obrigatórios' }, { status: 400 })
  }
  try {
    const transporter = createMailTransporter()
    const info = await transporter.sendMail({
      from: mailFrom(),
      to,
      subject,
      html: prepareBrandedEmailHtml(html),
      text: b.text || undefined,
      attachments: brandedMailAttachments(),
    })
    return NextResponse.json({ ok: true, messageId: info.messageId, accepted: info.accepted })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

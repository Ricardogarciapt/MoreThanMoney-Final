import { NextRequest, NextResponse } from 'next/server'
import {
  createMailTransporter,
  mailFrom,
  prepareBrandedEmailHtml,
  brandedMailAttachments,
} from '@/lib/mail-transport'

/**
 * Envio one-off de email transacional pelo transporter do site (Gmail SMTP → morethanmoneypt@gmail.com).
 * Bearer CRON_SECRET. body: { to, subject, html, text?, anexos? }. Uso pontual (ex.: link de pagamento a
 * um cliente).
 *
 * ANEXOS (25/09): um email com um guia de instalação em PDF não se resolvia por aqui — a rota só
 * sabia mandar texto, e a alternativa era pôr o ficheiro em `public/`, o que o deixava acessível a
 * quem adivinhasse o URL. Agora aceita `anexos: [{ nome, base64, tipo? }]`, com um tecto de 10 MB
 * no total: o Gmail recusa acima de 25 MB e um anexo grande faz a mensagem cair no spam, o que num
 * email de recuperação de cliente é pior do que não o mandar.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as {
    to?: string; subject?: string; html?: string; text?: string
    anexos?: Array<{ nome?: string; base64?: string; tipo?: string }>
  }
  const to = (b.to || '').trim()
  const subject = (b.subject || '').trim()
  const html = b.html || ''
  if (!to || !subject || !html.trim()) {
    return NextResponse.json({ ok: false, error: 'to, subject e html obrigatórios' }, { status: 400 })
  }
  // Os anexos entram DEPOIS dos da marca (o logótipo embutido), para não os substituir.
  const LIMITE_ANEXOS = 10 * 1024 * 1024
  const anexos: Array<{ filename: string; content: Buffer; contentType?: string }> = []
  let totalAnexos = 0
  for (const a of b.anexos ?? []) {
    if (!a?.nome || !a?.base64) continue
    const conteudo = Buffer.from(a.base64, 'base64')
    totalAnexos += conteudo.length
    if (totalAnexos > LIMITE_ANEXOS) {
      return NextResponse.json({ ok: false, error: 'anexos acima de 10 MB' }, { status: 400 })
    }
    anexos.push({ filename: a.nome, content: conteudo, contentType: a.tipo })
  }

  try {
    const transporter = createMailTransporter()
    const info = await transporter.sendMail({
      from: mailFrom(),
      to,
      subject,
      html: prepareBrandedEmailHtml(html),
      text: b.text || undefined,
      attachments: [...brandedMailAttachments(), ...anexos],
    })
    return NextResponse.json({ ok: true, messageId: info.messageId, accepted: info.accepted })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

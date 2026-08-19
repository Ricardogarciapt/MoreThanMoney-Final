import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { validateSubmission, SLUG_RE, type CustomFormField } from '@/lib/custom-forms'
import { createMailTransporter, mailFrom } from '@/lib/mail-transport'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'morethanmoneypt@gmail.com'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function submissionEmailHtml(formTitle: string, fields: CustomFormField[], data: Record<string, unknown>) {
  const rows = fields
    .filter((f) => f.type !== 'checkbox' && data[f.name] !== undefined && data[f.name] !== '')
    .map((f) => {
      const v = data[f.name]
      const value = Array.isArray(v) ? v.join(', ') : String(v)
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(f.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#111;font-size:13px;white-space:pre-wrap;">${esc(value)}</td>
      </tr>`
    })
    .join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#111;">📋 Nova submissão — ${esc(formTitle)}</h2>
    <p style="color:#666;font-size:13px;">Recebida em morethanmoney.pt/docs/forms · consulta e gestão em
      <a href="https://www.morethanmoney.pt/admin/forms">/admin/forms</a></p>
    <table style="border-collapse:collapse;width:100%;background:#fafafa;border:1px solid #eee;border-radius:8px;">${rows}</table>
  </div>`
}

/** GET /api/forms/[slug] — definição pública de um formulário ativo. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  try {
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('custom_forms')
      .select('slug, title, subtitle, description, badge, fields')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }
    return NextResponse.json({ form: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 })
  }
}

/** POST /api/forms/[slug] — submissão pública: valida, grava e notifica por email. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  try {
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rate = checkRateLimit(`form-submit:${ip}`, 8, 60_000)
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many attempts — please try again in a minute.' }, { status: 429 })
    }

    const supabase = getSupabaseAdmin()
    const { data: form, error: formError } = await supabase
      .from('custom_forms')
      .select('slug, title, fields')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
    if (formError) {
      return NextResponse.json({ error: formError.message }, { status: 500 })
    }
    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const fields = (form.fields || []) as CustomFormField[]
    const result = validateSubmission(fields, body?.data)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Anti-duplicado: 1 submissão por email em cada formulário
    if (result.email) {
      const { data: existing } = await supabase
        .from('form_submissions')
        .select('id')
        .eq('form_slug', slug)
        .eq('email', result.email)
        .limit(1)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ success: true, duplicate: true })
      }
    }

    const { error: insertError } = await supabase.from('form_submissions').insert({
      form_slug: slug,
      form_title: form.title,
      email: result.email || null,
      data: result.clean,
    })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Notificação por email (best effort — a submissão já está gravada)
    try {
      if (process.env.GMAIL_APP_PASSWORD) {
        const transporter = createMailTransporter()
        await transporter.sendMail({
          from: mailFrom(),
          to: ADMIN_EMAIL,
          replyTo: result.email || undefined,
          subject: `📋 Nova submissão — ${form.title}`,
          html: submissionEmailHtml(form.title, fields, result.clean),
        })
      }
    } catch (mailError) {
      console.error('⚠️ [FORMS] Falha ao enviar email de notificação:', mailError)
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 })
  }
}

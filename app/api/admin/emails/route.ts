import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { internalApiHeaders } from '@/lib/internal-api'
import {
  SYSTEM_EMAILS,
  isMailConfigured,
  renderSystemEmailHtml,
} from '@/lib/system-emails-registry'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [
      { data: recentSends },
      { data: activeEnrollments },
      { count: pendingSequences },
    ] = await Promise.all([
      supabase
        .from('email_sends')
        .select('status, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .then((r) => r)
        .catch(() => ({ data: [] as { status: string; created_at: string }[] })),
      supabase
        .from('email_sequence_enrollments')
        .select('id')
        .eq('status', 'active')
        .then((r) => r)
        .catch(() => ({ data: [] as { id: string }[] })),
      supabase
        .from('email_sequence_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .then((r) => r)
        .catch(() => ({ count: 0 })),
    ])

    const sends = recentSends || []
    const sentCount = sends.filter((s) => s.status === 'sent' || s.status === 'delivered').length
    const failedCount = sends.filter((s) => s.status === 'failed' || s.status === 'bounced').length

    return NextResponse.json({
      success: true,
      mailConfigured: isMailConfigured(),
      mailFrom: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      templates: SYSTEM_EMAILS,
      stats: {
        sentLast30Days: sentCount,
        failedLast30Days: failedCount,
        activeSequenceEnrollments: activeEnrollments?.length ?? pendingSequences ?? 0,
        totalTemplates: SYSTEM_EMAILS.length,
        automatedTemplates: SYSTEM_EMAILS.filter((t) => t.automated).length,
      },
    })
  } catch (error) {
    console.error('[ADMIN_EMAILS] GET error:', error)
    return NextResponse.json({
      success: true,
      mailConfigured: isMailConfigured(),
      mailFrom: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      templates: SYSTEM_EMAILS,
      stats: {
        sentLast30Days: 0,
        failedLast30Days: 0,
        activeSequenceEnrollments: 0,
        totalTemplates: SYSTEM_EMAILS.length,
        automatedTemplates: SYSTEM_EMAILS.filter((t) => t.automated).length,
      },
    })
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const action = body.action as string

    if (action === 'preview') {
      const rendered = renderSystemEmailHtml(body.templateId, body.sampleData)
      if (!rendered) {
        return NextResponse.json({ success: false, error: 'Template não encontrado' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        html: rendered.html,
        subject: rendered.subject,
      })
    }

    if (action === 'send-test') {
      if (!isMailConfigured()) {
        return NextResponse.json(
          { success: false, error: 'GMAIL_APP_PASSWORD não configurada na Vercel' },
          { status: 503 },
        )
      }

      const { templateId, to, sampleData } = body
      if (!templateId || !to) {
        return NextResponse.json(
          { success: false, error: 'templateId e to são obrigatórios' },
          { status: 400 },
        )
      }

      const rendered = renderSystemEmailHtml(templateId, sampleData)
      if (!rendered) {
        return NextResponse.json({ success: false, error: 'Template não encontrado' }, { status: 404 })
      }

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
      const emailResponse = await fetch(`${siteUrl}/api/email-marketing/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalApiHeaders() },
        body: JSON.stringify({
          to,
          subject: `[TESTE] ${rendered.subject}`,
          html: rendered.html,
        }),
      })

      if (!emailResponse.ok) {
        const err = await emailResponse.text()
        return NextResponse.json(
          { success: false, error: `Falha ao enviar: ${err}` },
          { status: 500 },
        )
      }

      return NextResponse.json({
        success: true,
        message: `Email de teste enviado para ${to}`,
        subject: rendered.subject,
      })
    }

    return NextResponse.json({ success: false, error: 'Acção inválida' }, { status: 400 })
  } catch (error) {
    console.error('[ADMIN_EMAILS] POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { canWriteChannel } from '@/lib/chat-channel-permissions'
import { getSiteOrigin } from '@/lib/site-url'

const supabase = getSupabaseAdmin()

/**
 * Notifica membros activos sobre nova mensagem no chat (push + in-app).
 * Respeita preferências de notificação por categoria.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, user_type, member_category, subscription_plan, is_active, created_at')
      .eq('id', authData.user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 403 })
    }

    const body = await request.json()
    const channelSlug = String(body.channel_slug || '').trim()
    const title = String(body.title || 'Nova mensagem no chat')
    const messageBody = String(body.body || 'Nova mensagem!')
    const messageId = typeof body.message_id === 'string' ? body.message_id : undefined

    if (!channelSlug) {
      return NextResponse.json({ error: 'channel_slug obrigatório' }, { status: 400 })
    }

    if (!canWriteChannel(channelSlug, profile)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const siteUrl = getSiteOrigin()
    const pushRes = await fetch(`${siteUrl}/api/notifications/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        all: true,
        excludeUserId: authData.user.id,
        title,
        body: messageBody,
        url: `/app-mobile?tab=chat&channel=${encodeURIComponent(channelSlug)}`,
        data: {
          type: 'chat_message',
          channel: channelSlug,
          url: `/app-mobile?tab=chat&channel=${encodeURIComponent(channelSlug)}`,
          ...(messageId ? { message_id: messageId } : {}),
        },
        tag: `chat_${channelSlug}`,
      }),
    })

    const pushData = await pushRes.json().catch(() => ({}))
    if (!pushRes.ok) {
      return NextResponse.json(
        { error: pushData.error || 'Falha ao enviar notificações' },
        { status: pushRes.status },
      )
    }

    return NextResponse.json({ success: true, ...pushData })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

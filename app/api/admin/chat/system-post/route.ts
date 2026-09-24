import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { resolveSystemUserId } from '@/lib/system-chat-user'
import { notifyChatChannelMessage } from '@/lib/chat-channel-notify'
import { buildEtfStocksWelcomePost } from '@/lib/etf-stocks-welcome-post'

/**
 * Publica mensagem de sistema num canal de chat e opcionalmente notifica membros.
 * POST { channel_slug, content?, notify?, push_title?, push_body?, template? }
 * template: "etf-stocks-welcome" — conteúdo pré-definido de boas-vindas
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const channelSlug = String(body.channel_slug || '').trim()
    if (!channelSlug) {
      return NextResponse.json({ error: 'channel_slug obrigatório' }, { status: 400 })
    }

    let content = typeof body.content === 'string' ? body.content.trim() : ''
    if (body.template === 'etf-stocks-welcome') {
      content = buildEtfStocksWelcomePost()
    }
    if (!content) {
      return NextResponse.json({ error: 'content ou template em falta' }, { status: 400 })
    }

    const notify = body.notify !== false
    const supabase = getSupabaseAdmin()
    const systemUserId = await resolveSystemUserId(supabase)

    const { data: existingWelcome } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('channel_slug', channelSlug)
      .eq('user_id', systemUserId)
      .limit(1)
      .maybeSingle()

    if (body.template === 'etf-stocks-welcome' && existingWelcome?.id) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'welcome_already_posted',
        message_id: existingWelcome.id,
      })
    }

    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        channel_slug: channelSlug,
        user_id: systemUserId,
        content,
        image_url: null,
        link_url: null,
        link_preview: null,
        message_type: 'text',
        reply_to_id: null,
      })
      .select('id, channel_slug, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let pushResult: Record<string, unknown> | null = null
    if (notify) {
      const pushTitle =
        typeof body.push_title === 'string' && body.push_title.trim()
          ? body.push_title.trim()
          : channelSlug === 'etf-stocks'
            ? '📈 Novo canal ETF & Stocks'
            : `💬 Nova mensagem em #${channelSlug}`

      const pushBody =
        typeof body.push_body === 'string' && body.push_body.trim()
          ? body.push_body.trim()
          : 'Conhece o portfólio ETF MTM e a estratégia DCA. Abre o chat!'

      const result = await notifyChatChannelMessage({
        channelSlug,
        title: pushTitle,
        body: pushBody,
        messageId: message.id,
        // O texto publicado decide o destino: entrada → Tap to Trade; o resto → chat na mensagem.
        content,
      })
      pushResult = { ok: result.ok, status: result.status, ...(result.data ?? {}) }
    }

    return NextResponse.json({
      success: true,
      message_id: message.id,
      channel: channelSlug,
      push: pushResult,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[ADMIN CHAT SYSTEM POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSocialSession } from '@/lib/social-request-auth'
import { notifyNewSocialPost } from '@/lib/social-push-notify'

/**
 * Notificações server-side após criar post no feed (posts).
 * POST { post_id, content, mentioned_user_ids? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSocialSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const postId = String(body.post_id || '').trim()
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const mentionedUserIds = Array.isArray(body.mentioned_user_ids)
      ? body.mentioned_user_ids.filter((id: unknown) => typeof id === 'string')
      : []

    if (!postId) {
      return NextResponse.json({ error: 'post_id obrigatório' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: post } = await supabase
      .from('posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle()

    if (!post || post.user_id !== session.userId) {
      return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, member_category')
      .eq('id', session.userId)
      .single()

    if (!profile || (profile.user_type !== 'admin' && profile.member_category !== 'vip')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    void notifyNewSocialPost({
      authorId: session.userId,
      authorName: session.fullName,
      postId,
      content,
      mentionedUserIds,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[social/feed/notify]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

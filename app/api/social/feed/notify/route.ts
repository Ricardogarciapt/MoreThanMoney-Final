import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSocialSession } from '@/lib/social-request-auth'
import { notifyNewSocialPost } from '@/lib/social-push-notify'
import { fetchLinkPreview } from '@/lib/link-preview-fetch'
import { enriquecerLinkDoPost, extrairPrimeiroUrl } from '@/lib/social/link-preview'

/**
 * Notificações server-side após criar post no feed (posts).
 * POST { post_id, content, mentioned_user_ids? }
 *
 * Desde 05/10/2026 também garante a thumbnail do link: o browser só obtinha o preview
 * quando o post não tinha média (e nem sempre), por isso aqui, já com o post gravado e o
 * cliente admin, preenche-se `link_url`/`link_preview` se faltarem. Corre depois da
 * resposta ao utilizador — nunca atrasa a publicação.
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
      .select('id, user_id, content, link_url, link_preview')
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

    if (!post.link_preview && extrairPrimeiroUrl(post.content)) {
      void enriquecerLinkDoPost(post.content, fetchLinkPreview)
        .then((enr) => supabase.from('posts').update(enr).eq('id', postId))
        .then(({ error }) => {
          if (error) console.warn('[social/feed/notify] link_preview:', error.message)
        })
        .catch((e) => console.warn('[social/feed/notify] link_preview:', e))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[social/feed/notify]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

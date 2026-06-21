import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSocialSession } from '@/lib/social-request-auth'
import { notifyPostComment, notifySocialMentions } from '@/lib/social-push-notify'
import { awardXp } from '@/lib/xp-service'

function extractMentionIds(content: string): string[] {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
  const ids: string[] = []
  let match
  while ((match = mentionRegex.exec(content)) !== null) {
    if (match[2]) ids.push(match[2])
  }
  return [...new Set(ids)]
}

/** Comentário em posts do feed (tabela post_comments). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSocialSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const postId = params.id
    const body = await request.json()
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) {
      return NextResponse.json({ error: 'Comentário vazio' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: post } = await supabase
      .from('posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle()

    if (!post) {
      return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 })
    }

    const mentionedUserIds = extractMentionIds(content)

    const { data: newComment, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: session.userId,
        user_name: session.fullName,
        content,
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      })
      .select()
      .single()

    if (error) {
      console.error('[social/feed/comments]', error.message)
      return NextResponse.json({ error: 'Erro ao criar comentário' }, { status: 500 })
    }

    const xpResult = await awardXp(supabase, session.userId, 'social_create_comment', {
      actionDescription: `Comentário post ${postId}`,
    })

    if (post.user_id) {
      notifyPostComment({
        postAuthorId: post.user_id,
        commenterId: session.userId,
        commenterName: session.fullName,
        postId,
        preview: content,
      })
    }

    if (mentionedUserIds.length > 0) {
      notifySocialMentions({
        mentionedUserIds,
        authorId: session.userId,
        authorName: session.fullName,
        preview: content,
        postId,
      })
    }

    return NextResponse.json({
      comment: newComment,
      xp: { ...xpResult, action_type: 'social_create_comment' },
    })
  } catch (error) {
    console.error('[social/feed/comments]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

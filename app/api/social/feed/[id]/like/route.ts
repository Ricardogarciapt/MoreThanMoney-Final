import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSocialSession } from '@/lib/social-request-auth'
import { notifyPostLike } from '@/lib/social-push-notify'
import { awardXp } from '@/lib/xp-service'

/** Toggle like em posts do feed (tabela posts / post_likes). */
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
    const supabase = getSupabaseAdmin()

    const { data: post } = await supabase
      .from('posts')
      .select('id, user_id, likes_count')
      .eq('id', postId)
      .maybeSingle()

    if (!post) {
      return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 })
    }

    const { data: existingLike } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', session.userId)
      .maybeSingle()

    let xp = null

    if (existingLike) {
      await supabase.from('post_likes').delete().eq('id', existingLike.id)
    } else {
      await supabase.from('post_likes').insert({
        post_id: postId,
        user_id: session.userId,
      })

      const xpResult = await awardXp(supabase, session.userId, 'social_like_post', {
        actionDescription: `Like post ${postId}`,
      })
      xp = { ...xpResult, action_type: 'social_like_post' }

      if (post.user_id) {
        notifyPostLike({
          postAuthorId: post.user_id,
          likerId: session.userId,
          likerName: session.fullName,
          postId,
        })
      }
    }

    const { count } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)

    const likesCount = count ?? post.likes_count ?? 0
    await supabase.from('posts').update({ likes_count: likesCount }).eq('id', postId)

    return NextResponse.json({
      liked: !existingLike,
      likes_count: likesCount,
      xp,
    })
  } catch (error) {
    console.error('[social/feed/like]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

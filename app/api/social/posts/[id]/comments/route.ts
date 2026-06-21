import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { awardXp } from '@/lib/xp-service'
import { notifyPostComment, notifySocialMentions } from '@/lib/social-push-notify'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const postId = params.id

    // Buscar comentários do post
    const { data: comments, error } = await supabase
      .from('social_post_comments')
      .select(`
        *,
        profiles!social_post_comments_user_id_fkey (
          id,
          full_name,
          username,
          avatar_url,
          user_type,
          member_category
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erro ao buscar comentários:', error)
      return NextResponse.json({ error: 'Erro ao buscar comentários' }, { status: 500 })
    }

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Erro na API de comentários:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const postId = params.id
    const body = await request.json()
    const { content } = body

    const supabaseAdmin = getSupabaseAdmin()
    const { data: postMeta } = await supabaseAdmin
      .from('social_posts')
      .select('user_id')
      .eq('id', postId)
      .maybeSingle()

    // Criar comentário
    const { data: newComment, error } = await supabase
      .from('social_post_comments')
      .insert({
        post_id: postId,
        user_id: session.user.id,
        content
      })
      .select(`
        *,
        profiles!social_post_comments_user_id_fkey (
          id,
          full_name,
          username,
          avatar_url,
          user_type,
          member_category
        )
      `)
      .single()

    if (error) {
      console.error('Erro ao criar comentário:', error)
      return NextResponse.json({ error: 'Erro ao criar comentário' }, { status: 500 })
    }

    // Incrementar contador de comentários
    await supabase.rpc('increment_comments_count', { post_id: postId })
    
    const supabaseAdminForXp = getSupabaseAdmin()
    const xp = await awardXp(supabaseAdminForXp, session.user.id, 'social_create_comment', {
      actionDescription: `Comentário post ${params.id}`,
    })

    const commenterName =
      newComment?.profiles?.full_name ||
      newComment?.profiles?.username ||
      session.user.email ||
      'Membro'

    if (postMeta?.user_id) {
      notifyPostComment({
        postAuthorId: postMeta.user_id,
        commenterId: session.user.id,
        commenterName,
        postId,
        preview: content,
      })
    }

    return NextResponse.json({
      comment: newComment,
      xp: { ...xp, action_type: 'social_create_comment' },
    })
  } catch (error) {
    console.error('Erro na API de comentários:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

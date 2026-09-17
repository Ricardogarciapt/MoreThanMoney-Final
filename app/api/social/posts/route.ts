import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { awardXp } from '@/lib/xp-service'
import { notifyNewSocialPost } from '@/lib/social-push-notify'
import { ehAdminUi, ehVipUi } from '@/lib/perfil-ui'

export async function GET() {
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

    const { data: posts, error } = await supabase
      .from('social_posts')
      .select(`
        *,
        profiles!social_posts_user_id_fkey (
          id,
          full_name,
          username,
          avatar_url,
          user_type,
          member_category
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar posts:', error)
      return NextResponse.json({ error: 'Erro ao buscar posts' }, { status: 500 })
    }

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Erro na API de posts:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { content, media_url, media_type } = body

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, member_category, membership_level, subscription_plan, is_active')
      .eq('id', session.user.id)
      .single()

    // Admin ou VIP — e VIP é-o por qualquer dos campos onde a marca vive.
    if (!ehAdminUi(profile) && !ehVipUi(profile)) {
      return NextResponse.json({ error: 'Sem permissão para criar posts' }, { status: 403 })
    }

    const { data: newPost, error } = await supabase
      .from('social_posts')
      .insert({
        user_id: session.user.id,
        content,
        media_url,
        media_type,
        likes_count: 0,
        comments_count: 0
      })
      .select(`
        *,
        profiles!social_posts_user_id_fkey (
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
      console.error('Erro ao criar post:', error)
      return NextResponse.json({ error: 'Erro ao criar post' }, { status: 500 })
    }

    const postAuthorName = newPost?.profiles?.full_name || newPost?.profiles?.username || 'MTM'
    void notifyNewSocialPost({
      authorId: session.user.id,
      authorName: postAuthorName,
      postId: newPost?.id ?? '',
      content: content ?? '',
    })

    const supabaseAdmin = getSupabaseAdmin()
    const xp = await awardXp(supabaseAdmin, session.user.id, 'social_create_post', {
      actionDescription: `Post ${newPost.id}`,
    })

    return NextResponse.json({ post: newPost, xp: { ...xp, action_type: 'social_create_post' } })
  } catch (error) {
    console.error('Erro na API de posts:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

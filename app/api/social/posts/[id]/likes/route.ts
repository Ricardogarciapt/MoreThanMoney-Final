import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { awardXp } from '@/lib/xp-service'

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

    // Verificar se já deu like
    const { data: existingLike } = await supabase
      .from('social_post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', session.user.id)
      .single()

    let xp = null
    if (existingLike) {
      // Remover like
      await supabase
        .from('social_post_likes')
        .delete()
        .eq('id', existingLike.id)

      // Decrementar contador
      await supabase.rpc('decrement_likes_count', { post_id: postId })
    } else {
      // Adicionar like
      await supabase
        .from('social_post_likes')
        .insert({
          post_id: postId,
          user_id: session.user.id
        })

      // Incrementar contador
      await supabase.rpc('increment_likes_count', { post_id: postId })
      
      // Adicionar XP para dar like
      const supabaseAdmin = getSupabaseAdmin()
      const xpResult = await awardXp(supabaseAdmin, session.user.id, 'social_like_post', {
        actionDescription: `Like post ${postId}`,
      })
      xp = { ...xpResult, action_type: 'social_like_post' }
    }

    // Buscar novo contador
    const { data: post } = await supabase
      .from('social_posts')
      .select('likes_count')
      .eq('id', postId)
      .single()

    return NextResponse.json({ 
      liked: !existingLike,
      likes_count: post?.likes_count || 0,
      xp,
    })
  } catch (error) {
    console.error('Erro na API de likes:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

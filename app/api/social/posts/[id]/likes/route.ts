import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
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
      try {
        // Buscar configuração de XP
        const { data: xpConfig } = await supabase
          .from('xp_config')
          .select('xp_amount')
          .eq('action_type', 'social_like')
          .single()

        const xpAmount = xpConfig?.xp_amount || 2

        // Buscar XP atual
        const { data: existingXP } = await supabase
          .from('user_xp')
          .select('*')
          .eq('user_id', session.user.id)
          .single()

        if (existingXP) {
          const newTotalXP = existingXP.total_xp + xpAmount
          const newLevel = Math.floor(newTotalXP / 1000) + 1
          await supabase
            .from('user_xp')
            .update({ total_xp: newTotalXP, current_level: newLevel })
            .eq('user_id', session.user.id)
        } else {
          await supabase
            .from('user_xp')
            .insert({ user_id: session.user.id, total_xp: xpAmount, current_level: 1 })
        }

        // Log XP
        await supabase
          .from('xp_log')
          .insert({ user_id: session.user.id, xp_amount: xpAmount, action_type: 'social_like' })
      } catch (xpError) {
        console.error('Erro ao adicionar XP:', xpError)
      }
    }

    // Buscar novo contador
    const { data: post } = await supabase
      .from('social_posts')
      .select('likes_count')
      .eq('id', postId)
      .single()

    return NextResponse.json({ 
      liked: !existingLike,
      likes_count: post?.likes_count || 0 
    })
  } catch (error) {
    console.error('Erro na API de likes:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

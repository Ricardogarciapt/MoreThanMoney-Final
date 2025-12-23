import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    const body = await request.json()
    const { content } = body

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
    
    // Adicionar XP para comentar
    try {
      // Buscar configuração de XP
      const { data: xpConfig } = await supabase
        .from('xp_config')
        .select('xp_amount')
        .eq('action_type', 'social_comment')
        .single()

      const xpAmount = xpConfig?.xp_amount || 5

      // Buscar XP atual
      const { data: existingXP } = await supabase
        .from('user_xp')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (existingXP) {
        const newTotalXP = existingXP.total_xp + xpAmount
        const newLevel = Math.floor(newTotalXP / 100) + 1
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
        .insert({ user_id: session.user.id, xp_amount: xpAmount, action_type: 'social_comment' })
    } catch (xpError) {
      console.error('Erro ao adicionar XP:', xpError)
    }

    return NextResponse.json({ comment: newComment })
  } catch (error) {
    console.error('Erro na API de comentários:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

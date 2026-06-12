import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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

    // Buscar posts do Supabase
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

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { content, media_url, media_type } = body

    // Verificar se o usuário pode criar posts (VIP ou Admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, member_category')
      .eq('id', session.user.id)
      .single()

    if (!profile || (profile.user_type !== 'admin' && profile.member_category !== 'vip')) {
      return NextResponse.json({ error: 'Sem permissão para criar posts' }, { status: 403 })
    }

    // Criar post no Supabase
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

    // Notificar todos os membros ativos sobre o novo post VIP/Admin (não-bloqueante)
    const postAuthorName = newPost?.profiles?.full_name || newPost?.profiles?.username || 'MTM'
    const notifTitle = `📢 Novo post de ${postAuthorName}`
    const notifBody = content?.substring(0, 120) || 'Publicação nova disponível.'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'

    ;(async () => {
      try {
        const adminDb = getSupabaseAdmin()

        // 1. Buscar todos os membros activos (excepto o autor)
        const { data: activeUsers } = await adminDb
          .from('profiles')
          .select('id')
          .eq('is_active', true)
          .neq('id', session.user.id)

        if (activeUsers && activeUsers.length > 0) {
          // 2. Guardar notificação in-app para todos
          await adminDb.from('notifications').insert(
            activeUsers.map((u) => ({
              user_id: u.id,
              type: 'social_post',
              title: notifTitle,
              message: notifBody,
              read: false,
              data: {
                post_id: newPost?.id,
                author_id: session.user.id,
                url: '/app-mobile?tab=social',
              },
            }))
          )

          // 3. Enviar push para todos os dispositivos registados
          // Nota: omitir data.type para evitar duplicar na tabela notifications
          // (a inserção direta acima já cobre todos os utilizadores activos)
          await fetch(`${siteUrl}/api/notifications/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              all: true,
              skipInApp: true,
              title: notifTitle,
              body: notifBody,
              data: {
                type: 'social_post',
                post_id: newPost?.id ?? '',
                url: '/app-mobile?tab=social',
              },
              tag: 'social_post',
            }),
          })
        }
      } catch (notifErr) {
        console.error('❌ [POSTS] Erro ao enviar notificações:', notifErr)
      }
    })()

    // Adicionar XP para criar post
    try {
      // Buscar configuração de XP
      const { data: xpConfig } = await supabase
        .from('xp_config')
        .select('xp_amount')
        .eq('action_type', 'social_create_post')
        .single()

      const xpAmount = xpConfig?.xp_amount || 15

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
        .insert({ user_id: session.user.id, xp_amount: xpAmount, action_type: 'social_create_post' })
    } catch (xpError) {
      console.error('Erro ao adicionar XP:', xpError)
    }

    return NextResponse.json({ post: newPost })
  } catch (error) {
    console.error('Erro na API de posts:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { IRoom, IDirectRoom, IGroupRoom } from '@/lib/messaging-types'

/**
 * GET /api/messages/rooms
 * Devolve todas as "salas" do utilizador (DMs + grupos) no formato inspirado em Rocket.Chat.
 * Útil para uma lista unificada no site e na app-mobile, com tipo t: 'd' | 'c' | 'p'.
 */
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams
    const mobileOnly = searchParams.get('mobile_only') === 'true'

    const userId = session.user.id

    // Perfil para regras can_post
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', userId)
      .maybeSingle()

    const rooms: IRoom[] = []

    // --- Conversas (DM) → tipo 'd'
    let conversations: any[] = []
    try {
      const res = await supabase
        .from('conversations')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      conversations = res.data || []
    } catch (e) {
      console.warn('[ROOMS API] Erro ao buscar conversas:', e)
    }

    for (const c of conversations) {
      const otherUserId = c.user1_id === userId ? c.user2_id : c.user1_id
      let otherUser: any = null
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url, email')
          .eq('id', otherUserId)
          .maybeSingle()
        otherUser = data
      } catch (_) {}

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { count: unread } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('read', false)
        .neq('sender_id', userId)

      const direct: IDirectRoom = {
        _id: c.id,
        t: 'd',
        uids: [c.user1_id, c.user2_id],
        lm: c.last_message_at ?? c.created_at,
        lastMessage: lastMsg ? { content: lastMsg.content, created_at: lastMsg.created_at } : undefined,
        unread: unread ?? 0,
        otherUser: otherUser || { id: otherUserId },
      }
      rooms.push(direct)
    }

    // --- Grupos → tipo 'c' (público) ou 'p' (privado)
    let groups: any[] = []
    try {
      if (profile?.user_type === 'admin' && !mobileOnly) {
        const { data } = await supabase
          .from('group_conversations')
          .select('*')
          .order('created_at', { ascending: false })
        groups = data || []
      } else {
        const [pub, mobile] = await Promise.all([
          supabase.from('group_conversations').select('*').eq('is_public', true),
          supabase.from('group_conversations').select('*').eq('is_mobile_visible', true),
        ])
        const combined = [...(pub.data || []), ...(mobile.data || [])]
        groups = Array.from(new Map(combined.map((g: any) => [g.id, g])).values())
        if (mobileOnly) {
          groups = groups.filter((g: any) =>
            ['trade', 'crypto', 'social'].some((k) => (g.name || '').toLowerCase().includes(k))
          )
        }
        if (profile?.user_type !== 'admin') {
          const { data: memberships } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('user_id', userId)
          const memberIds = (memberships || []).map((m: any) => m.group_id)
          groups = groups.filter(
            (g: any) => g.is_public || g.is_mobile_visible || memberIds.includes(g.id)
          )
        }
      }
    } catch (e) {
      console.warn('[ROOMS API] Erro ao buscar grupos:', e)
    }

    for (const g of groups) {
      const { data: member } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', g.id)
        .eq('user_id', userId)
        .maybeSingle()

      const name = (g.name || '').toLowerCase()
      const isSocial = name.includes('social')
      const isTrade = name.includes('trade')
      const isCrypto = name.includes('crypto')
      const isAdmin = profile?.user_type === 'admin'
      const isVip = profile?.membership_level === 'vip'
      let canPost = isSocial || isAdmin || isVip || !!member
      if ((isTrade || isCrypto) && !isAdmin && !isVip) canPost = false

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('group_id', g.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { count: unread } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)
        .eq('read', false)
        .neq('sender_id', userId)

      const { count: memberCount } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)

      const groupRoom: IGroupRoom = {
        _id: g.id,
        t: g.is_public ? 'c' : 'p',
        name: g.name,
        description: g.description,
        avatar_url: g.avatar_url,
        is_public: g.is_public,
        is_mobile_visible: g.is_mobile_visible,
        created_by: g.created_by,
        lm: g.last_message_at ?? g.created_at,
        usersCount: memberCount ?? 0,
        lastMessage: lastMsg ? { content: lastMsg.content, created_at: lastMsg.created_at } : undefined,
        unread: unread ?? 0,
        can_post: canPost,
        is_member: !!member,
        member_count: memberCount ?? 0,
      }
      rooms.push(groupRoom)
    }

    // Ordenar por última atividade
    rooms.sort((a, b) => {
      const aTime = a.lm ? new Date(a.lm).getTime() : 0
      const bTime = b.lm ? new Date(b.lm).getTime() : 0
      return bTime - aTime
    })

    return NextResponse.json({ rooms })
  } catch (error) {
    console.error('[ROOMS API] Erro:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

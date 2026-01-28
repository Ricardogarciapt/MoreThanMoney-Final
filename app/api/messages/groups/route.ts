import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter grupos do utilizador
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

    // Buscar perfil do utilizador para verificar se é admin/VIP
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_type')
      .eq('id', session.user.id)
      .single()

    let query
    if (mobileOnly) {
      // Se for mobile_only, TODOS os utilizadores veem grupos com is_mobile_visible = true
      // Não precisa ser membro para ver, apenas para publicar
      query = supabase
        .from('group_conversations')
        .select('*')
        .eq('is_mobile_visible', true)
    } else if (profile?.user_type === 'admin') {
      // Admin vê todos os grupos
      query = supabase
        .from('group_conversations')
        .select('*')
    } else {
      // Utilizador normal vê apenas grupos onde é membro (para grupos não-mobile)
      query = supabase
        .from('group_conversations')
        .select(`
          *,
          members:group_members!inner(user_id)
        `)
        .eq('members.user_id', session.user.id)
    }
    
    const { data: groups, error } = await query.order('last_message_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar grupos:', error)
      return NextResponse.json({ error: 'Erro ao buscar grupos' }, { status: 500 })
    }

    // Buscar última mensagem e contagem de não lidas para cada grupo
    // Verificar se o utilizador é membro de cada grupo
    const groupsWithMessages = await Promise.all(
      (groups || []).map(async (group) => {
        // Verificar se o utilizador é membro
        const { data: member } = await supabase
          .from('group_members')
          .select('role')
          .eq('group_id', group.id)
          .eq('user_id', session.user.id)
          .single()

        // Verificar se pode publicar (admin, VIP, ou Social Chat)
        const isAdmin = profile?.user_type === 'admin'
        const isVip = profile?.membership_type === 'vip'
        const isSocialChat = group.name?.toLowerCase().includes('social')
        const canPost = isAdmin || isVip || isSocialChat || !!member

        // Última mensagem
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('group_id', group.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Contagem de não lidas (simplificado - pode melhorar)
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id)
          .eq('read', false)
          .neq('sender_id', session.user.id)

        // Contar membros
        const { count: memberCount } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id)

        return {
          ...group,
          lastMessage,
          unreadCount: unreadCount || 0,
          member_count: memberCount || 0,
          can_post: canPost,
          is_member: !!member
        }
      })
    )

    return NextResponse.json({ groups: groupsWithMessages })
  } catch (error) {
    console.error('Erro na API de grupos:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// POST: Criar novo grupo
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
    const { name, description, avatar_url, is_public, is_mobile_visible, member_ids } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome do grupo é obrigatório' }, { status: 400 })
    }

    // Criar grupo
    const { data: group, error: groupError } = await supabase
      .from('group_conversations')
      .insert({
        name,
        description,
        avatar_url,
        is_public: is_public || false,
        is_mobile_visible: is_mobile_visible || false,
        created_by: session.user.id
      })
      .select()
      .single()

    if (groupError || !group) {
      console.error('Erro ao criar grupo:', groupError)
      return NextResponse.json({ error: 'Erro ao criar grupo' }, { status: 500 })
    }

    // Adicionar criador como admin
    await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: session.user.id,
        role: 'admin'
      })

    // Adicionar membros se fornecidos
    if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
      await supabase
        .from('group_members')
        .insert(
          member_ids.map((userId: string) => ({
            group_id: group.id,
            user_id: userId,
            role: 'member'
          }))
        )
    }

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Erro na API de grupos:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


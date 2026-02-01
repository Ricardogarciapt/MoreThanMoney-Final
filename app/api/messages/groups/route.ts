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
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_type, membership_type')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) {
      console.error('❌ [GROUPS API] Erro ao buscar perfil:', profileError)
      // Continuar mesmo com erro no perfil
    }


    // Construir query base
    let query = supabase.from('group_conversations').select('*')
    let groups: any[] | null = null
    
    try {
      if (profile?.user_type === 'admin') {
        // Admin vê TODOS os grupos (sem filtros)
      } else if (mobileOnly) {
        // Se for mobile_only, TODOS os utilizadores veem grupos com is_mobile_visible = true
        query = query.eq('is_mobile_visible', true)
      } else {
        // Utilizador normal vê grupos onde é membro OU grupos públicos OU grupos mobile_visible
        query = query.or(`is_public.eq.true,is_mobile_visible.eq.true`)
      }
      
      // Ordenar por created_at
      const { data, error } = await query.order('created_at', { ascending: false })
      groups = data

      if (error) {
        console.error('❌ [GROUPS API] Erro na query de grupos:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        return NextResponse.json({ 
          error: 'Erro ao buscar grupos',
          details: error.message,
          code: error.code
        }, { status: 500 })
      }


    } catch (queryError: any) {
      console.error('❌ [GROUPS API] Erro ao construir query:', queryError)
      return NextResponse.json({ 
        error: 'Erro ao construir query de grupos',
        details: queryError.message
      }, { status: 500 })
    }

    // Se não for admin e não for mobile_only, filtrar grupos onde o utilizador é membro
    let filteredGroups = groups || []
    if (!mobileOnly && profile?.user_type !== 'admin') {
      try {
        // Buscar grupos onde o utilizador é membro
        const { data: userMemberships, error: membershipError } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', session.user.id)
        
        if (membershipError) {
          console.warn('⚠️ [GROUPS API] Erro ao buscar membros (continuando):', membershipError)
        }
        
        const memberGroupIds = (userMemberships || []).map((m: any) => m.group_id)
        
        // Filtrar: manter grupos públicos, mobile_visible OU onde é membro
        filteredGroups = (groups || []).filter((group: any) => 
          group.is_public || 
          group.is_mobile_visible || 
          memberGroupIds.includes(group.id)
        )
      } catch (filterError: any) {
        console.warn('⚠️ [GROUPS API] Erro ao filtrar grupos (usando todos):', filterError)
        // Em caso de erro, usar todos os grupos retornados
        filteredGroups = groups || []
      }
    }
    
    console.log('📋 [GROUPS API] Grupos após filtro:', filteredGroups.length)
    
    // Buscar última mensagem e contagem de não lidas para cada grupo
    // Verificar se o utilizador é membro de cada grupo
    const groupsWithMessages = await Promise.all(
      (filteredGroups || []).map(async (group: any) => {
        try {
          // Verificar se o utilizador é membro
          const { data: member, error: memberError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', group.id)
            .eq('user_id', session.user.id)
            .maybeSingle()

          if (memberError && memberError.code !== 'PGRST116') {
            console.warn(`⚠️ [GROUPS] Erro ao verificar membro do grupo ${group.id}:`, memberError)
          }

          // Verificar se pode publicar (admin, VIP, ou Social Chat)
          const isAdmin = profile?.user_type === 'admin'
          const isVip = profile?.membership_type === 'vip'
          const isSocialChat = group.name?.toLowerCase().includes('social')
          const canPost = isAdmin || isVip || isSocialChat || !!member

          // Última mensagem
          const { data: lastMessage, error: lastMessageError } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('group_id', group.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (lastMessageError && lastMessageError.code !== 'PGRST116') {
            console.warn(`⚠️ [GROUPS] Erro ao buscar última mensagem do grupo ${group.id}:`, lastMessageError)
          }

          // Contagem de não lidas (simplificado - pode melhorar)
          const { count: unreadCount, error: unreadError } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)
            .eq('read', false)
            .neq('sender_id', session.user.id)

          if (unreadError && unreadError.code !== 'PGRST116') {
            console.warn(`⚠️ [GROUPS] Erro ao contar não lidas do grupo ${group.id}:`, unreadError)
          }

          // Contar membros
          const { count: memberCount, error: memberCountError } = await supabase
            .from('group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)

          if (memberCountError && memberCountError.code !== 'PGRST116') {
            console.warn(`⚠️ [GROUPS] Erro ao contar membros do grupo ${group.id}:`, memberCountError)
          }

          return {
            ...group,
            lastMessage: lastMessage || null,
            unreadCount: unreadCount || 0,
            member_count: memberCount || 0,
            can_post: canPost,
            is_member: !!member
          }
        } catch (error: any) {
          console.error(`❌ [GROUPS] Erro ao processar grupo ${group?.id || 'unknown'}:`, error)
          // Retornar grupo básico em caso de erro
          return {
            ...group,
            lastMessage: null,
            unreadCount: 0,
            member_count: 0,
            can_post: false,
            is_member: false
          }
        }
      })
    )

    return NextResponse.json({ groups: groupsWithMessages })
  } catch (error: any) {
    console.error('❌ [GROUPS API] Erro geral na API:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      details: error.message || 'Erro desconhecido'
    }, { status: 500 })
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


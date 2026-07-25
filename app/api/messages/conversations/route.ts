import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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

    // Buscar conversas do usuário (sem join a profiles - os perfis são buscados depois por conversa)
    const result = await supabase
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`)

    let conversations: any[] | null = result.data
    const error = result.error

    if (error) {
      console.error('❌ [CONVERSATIONS API] Erro ao buscar conversas:', error)
      return NextResponse.json({ error: 'Erro ao buscar conversas', details: error.message }, { status: 500 })
    }
    
    // Ordenar por last_message_at se existir, senão por created_at
    if (conversations) {
      try {
        conversations.sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0)
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0)
          return bTime - aTime
        })
      } catch (sortError) {
        console.warn('⚠️ [CONVERSATIONS API] Erro ao ordenar conversas:', sortError)
      }
    }

    // Sub-reads via admin (bypass RLS — já scoped às conversas do user acima). Evita
    // previews/contagens vazias quando o token do cookie está stale (mesmo motivo do
    // "conversa em branco").
    const adminDb = getSupabaseAdmin()

    // Buscar última mensagem e contagem de não lidas para cada conversa
    const conversationsWithMessages = await Promise.all(
      (conversations || []).map(async (conv) => {
        const otherUserId = conv.user1_id === session.user.id ? conv.user2_id : conv.user1_id

        let otherUser: { id: string; full_name?: string; username?: string; avatar_url?: string; email?: string } | null = null
        if (otherUserId) {
          const { data: profile } = await adminDb
            .from('profiles')
            .select('id, full_name, username, avatar_url, email')
            .eq('id', otherUserId)
            .maybeSingle()
          otherUser = profile || null
        }

        // Última mensagem
        const { data: lastMessage, error: lastMessageError } = await adminDb
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastMessageError && lastMessageError.code !== 'PGRST116') {
          console.warn(`⚠️ [CONVERSATIONS API] Erro ao buscar última mensagem da conversa ${conv.id}:`, lastMessageError)
        }

        // Contagem de não lidas
        const { count: unreadCount, error: unreadError } = await adminDb
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('read', false)
          .neq('sender_id', session.user.id)

        if (unreadError && unreadError.code !== 'PGRST116') {
          console.warn(`⚠️ [CONVERSATIONS API] Erro ao contar não lidas da conversa ${conv.id}:`, unreadError)
        }

        return {
          ...conv,
          otherUser: otherUser || { id: otherUserId },
          lastMessage: lastMessage || null,
          unreadCount: unreadCount || 0
        }
      })
    )

    return NextResponse.json({ conversations: conversationsWithMessages })
  } catch (error) {
    console.error('Erro na API de conversas:', error)
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
    const { otherUserId } = body

    if (!otherUserId) {
      return NextResponse.json({ error: 'otherUserId é obrigatório' }, { status: 400 })
    }

    // Verificar se o utilizador existe
    const { data: otherUserProfile, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', otherUserId)
      .single()

    if (userError || !otherUserProfile) {
      console.error('Erro: Utilizador não encontrado:', userError)
      return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })
    }

    // Tentar obter ou criar conversa usando RPC
    let conversationId: string | null = null
    const { data: rpcResult, error: functionError } = await supabase.rpc(
      'get_or_create_conversation',
      {
        p_user1_id: session.user.id,
        p_user2_id: otherUserId
      }
    )

    if (functionError) {
      console.error('Erro ao chamar RPC get_or_create_conversation:', functionError)
      
      // Fallback: tentar criar manualmente
      const user1Id = session.user.id < otherUserId ? session.user.id : otherUserId
      const user2Id = session.user.id < otherUserId ? otherUserId : session.user.id
      
      // Verificar se já existe
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('user1_id', user1Id)
        .eq('user2_id', user2Id)
        .single()
      
      if (existingConv) {
        conversationId = existingConv.id
      } else {
        // Criar nova conversa
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            user1_id: user1Id,
            user2_id: user2Id
          })
          .select('id')
          .single()
        
        if (createError || !newConv) {
          console.error('Erro ao criar conversa manualmente:', createError)
          return NextResponse.json({ 
            error: 'Erro ao criar conversa',
            details: createError?.message 
          }, { status: 500 })
        }
        
        conversationId = newConv.id
      }
    } else {
      conversationId = rpcResult
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'Não foi possível criar ou encontrar a conversa' }, { status: 500 })
    }

    // Buscar conversa (sem join a profiles)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      console.error('Erro ao buscar conversa:', convError)
      return NextResponse.json({ 
        error: 'Erro ao buscar conversa',
        details: convError?.message 
      }, { status: 500 })
    }

    const otherUserIdForProfile = conversation.user1_id === session.user.id ? conversation.user2_id : conversation.user1_id
    let otherUser: { id: string; full_name?: string; username?: string; avatar_url?: string; email?: string } = { id: otherUserIdForProfile }
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, email')
      .eq('id', otherUserIdForProfile)
      .maybeSingle()
    if (otherProfile) otherUser = otherProfile

    return NextResponse.json({
      conversation: {
        ...conversation,
        otherUser,
        lastMessage: null,
        unreadCount: 0
      }
    })
  } catch (error) {
    console.error('Erro na API de conversas:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


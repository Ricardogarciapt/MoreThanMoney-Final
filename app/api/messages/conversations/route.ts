import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

    // Buscar conversas do usuário
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:profiles!conversations_user1_id_fkey(id, full_name, username, avatar_url, email),
        user2:profiles!conversations_user2_id_fkey(id, full_name, username, avatar_url, email)
      `)
      .or(`user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`)
      .order('last_message_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar conversas:', error)
      return NextResponse.json({ error: 'Erro ao buscar conversas' }, { status: 500 })
    }

    // Buscar última mensagem e contagem de não lidas para cada conversa
    const conversationsWithMessages = await Promise.all(
      (conversations || []).map(async (conv) => {
        const otherUserId = conv.user1_id === session.user.id ? conv.user2_id : conv.user1_id
        const otherUser = conv.user1_id === session.user.id ? conv.user2 : conv.user1

        // Última mensagem
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Contagem de não lidas
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('read', false)
          .neq('sender_id', session.user.id)

        return {
          ...conv,
          otherUser,
          lastMessage,
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
    const { data: otherUser, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', otherUserId)
      .single()

    if (userError || !otherUser) {
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

    // Buscar conversa completa
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:profiles!conversations_user1_id_fkey(id, full_name, username, avatar_url, email),
        user2:profiles!conversations_user2_id_fkey(id, full_name, username, avatar_url, email)
      `)
      .eq('id', conversationId)
      .single()

    if (convError) {
      console.error('Erro ao buscar conversa:', convError)
      return NextResponse.json({ 
        error: 'Erro ao buscar conversa',
        details: convError.message 
      }, { status: 500 })
    }

    const otherUser = conversation.user1_id === session.user.id ? conversation.user2 : conversation.user1

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


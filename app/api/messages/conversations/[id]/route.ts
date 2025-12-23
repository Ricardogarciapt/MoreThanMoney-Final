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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const conversationId = params.id

    // Verificar se o usuário tem acesso à conversa
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    if (conversation.user1_id !== session.user.id && conversation.user2_id !== session.user.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Buscar mensagens
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, username, avatar_url, email)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erro ao buscar mensagens:', error)
      return NextResponse.json({ error: 'Erro ao buscar mensagens' }, { status: 500 })
    }

    // Marcar mensagens como lidas
    await supabase
      .from('messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', session.user.id)
      .eq('read', false)

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error('Erro na API de mensagens:', error)
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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const conversationId = params.id
    const body = await request.json()
    const { content } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo da mensagem é obrigatório' }, { status: 400 })
    }

    // Verificar se o usuário tem acesso à conversa
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    if (conversation.user1_id !== session.user.id && conversation.user2_id !== session.user.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Criar mensagem
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: session.user.id,
        content: content.trim()
      })
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, username, avatar_url, email)
      `)
      .single()

    if (error) {
      console.error('Erro ao criar mensagem:', error)
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 })
    }

    // Enviar notificação push para o outro usuário
    const otherUserId = conversation.user1_id === session.user.id 
      ? conversation.user2_id 
      : conversation.user1_id

    try {
      await fetch(`${request.nextUrl.origin}/api/notifications/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: otherUserId,
          title: `💬 Nova mensagem de ${session.user.user_metadata?.full_name || 'Alguém'}`,
          body: content.trim().substring(0, 100),
          data: {
            type: 'message',
            conversation_id: conversationId,
            sender_id: session.user.id
          },
          tag: 'message'
        })
      })
    } catch (notifError) {
      console.error('Erro ao enviar notificação:', notifError)
      // Não bloquear o envio da mensagem se a notificação falhar
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Erro na API de mensagens:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


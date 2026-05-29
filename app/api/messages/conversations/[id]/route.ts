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

    const resolvedParams = await Promise.resolve(params)
    const conversationId = resolvedParams?.id
    if (!conversationId) {
      return NextResponse.json({ error: 'Conversa inválida' }, { status: 400 })
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

    // Buscar mensagens (sem join a profiles)
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erro ao buscar mensagens:', error)
      return NextResponse.json({ error: 'Erro ao buscar mensagens' }, { status: 500 })
    }

    const list = messages || []
    const senderIds = [...new Set(list.map((m: { sender_id: string }) => m.sender_id).filter(Boolean))]
    const senderMap: Record<string, { id: string; full_name?: string; username?: string; avatar_url?: string; email?: string }> = {}
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, email')
        .in('id', senderIds)
      for (const p of profiles || []) senderMap[p.id] = p
    }
    const messagesWithSenders = list.map((m: { sender_id: string; [k: string]: unknown }) => ({
      ...m,
      sender: senderMap[m.sender_id] || { id: m.sender_id }
    }))

    // Marcar mensagens como lidas
    await supabase
      .from('messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', session.user.id)
      .eq('read', false)

    return NextResponse.json({ messages: messagesWithSenders })
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

    const resolvedParams = await Promise.resolve(params)
    const conversationId = resolvedParams?.id
    if (!conversationId) {
      return NextResponse.json({ error: 'Conversa inválida' }, { status: 400 })
    }
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

    // Criar mensagem (sem join a profiles)
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: session.user.id,
        content: content.trim()
      })
      .select('*')
      .single()

    if (error) {
      console.error('Erro ao criar mensagem:', error)
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 })
    }

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, email')
      .eq('id', session.user.id)
      .maybeSingle()
    const messageWithSender = message
      ? { ...message, sender: senderProfile || { id: session.user.id } }
      : message

    // Atualizar last_message_at na conversa
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)

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

    return NextResponse.json({ message: messageWithSender })
  } catch (error) {
    console.error('Erro na API de mensagens:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


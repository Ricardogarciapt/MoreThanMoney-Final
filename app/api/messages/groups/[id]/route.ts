import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter mensagens do grupo
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

    const groupId = params.id

    // Verificar se o utilizador é membro do grupo
    const { data: member } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Não és membro deste grupo' }, { status: 403 })
    }

    // Buscar mensagens
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, username, avatar_url, email)
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erro ao buscar mensagens:', error)
      return NextResponse.json({ error: 'Erro ao buscar mensagens' }, { status: 500 })
    }

    // Marcar mensagens como lidas (opcional - pode melhorar)
    await supabase
      .from('messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .neq('sender_id', session.user.id)
      .eq('read', false)

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error('Erro na API de mensagens do grupo:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// POST: Enviar mensagem no grupo
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

    const groupId = params.id
    const body = await request.json()
    const { content } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo da mensagem é obrigatório' }, { status: 400 })
    }

    // Verificar se o utilizador é membro do grupo
    const { data: member } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Não és membro deste grupo' }, { status: 403 })
    }

    // Criar mensagem
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        group_id: groupId,
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

    // Enviar notificações push para outros membros do grupo
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .neq('user_id', session.user.id)

    if (members && members.length > 0) {
      // Enviar notificações (pode melhorar para batch)
      for (const member of members) {
        try {
          await fetch(`${request.nextUrl.origin}/api/notifications/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: member.user_id,
              title: `💬 ${session.user.user_metadata?.full_name || 'Alguém'} em ${message.group?.name || 'grupo'}`,
              body: content.trim().substring(0, 100),
              data: {
                type: 'group_message',
                group_id: groupId,
                sender_id: session.user.id
              },
              tag: 'group_message'
            })
          })
        } catch (notifError) {
          console.error('Erro ao enviar notificação:', notifError)
        }
      }
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Erro na API de mensagens do grupo:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


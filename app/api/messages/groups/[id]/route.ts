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

    const resolvedParams = await Promise.resolve(params)
    const groupId = resolvedParams.id

    // Buscar informações do grupo
    const { data: group } = await supabase
      .from('group_conversations')
      .select('name, is_mobile_visible')
      .eq('id', groupId)
      .single()

    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
    }

    // Se for grupo mobile visível, todos podem ver mensagens
    // Caso contrário, apenas membros podem ver
    if (!group.is_mobile_visible) {
      const { data: member } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', session.user.id)
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Não és membro deste grupo' }, { status: 403 })
      }
    }

    // Buscar mensagens (sem join a profiles)
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
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

    // Marcar mensagens como lidas (opcional - pode melhorar)
    await supabase
      .from('messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .neq('sender_id', session.user.id)
      .eq('read', false)

    return NextResponse.json({ messages: messagesWithSenders })
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

    const resolvedParams = await Promise.resolve(params)
    const groupId = resolvedParams.id
    const body = await request.json()
    const { content } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo da mensagem é obrigatório' }, { status: 400 })
    }

    // Buscar informações do grupo e perfil do utilizador
    const { data: group } = await supabase
      .from('group_conversations')
      .select('name, is_mobile_visible')
      .eq('id', groupId)
      .single()

    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
    }

    // Verificar perfil do utilizador
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', session.user.id)
      .single()

    const isAdmin = profile?.user_type === 'admin'
    const isVip = profile?.membership_level === 'vip'
    const name = (group.name || '').toLowerCase()
    const isSocialChat = name.includes('social')
    const isTradeChat = name.includes('trade')
    const isCryptoChat = name.includes('crypto')

    // Verificar se o utilizador é membro do grupo
    const { data: member } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .single()

    // Pode publicar se:
    // 1. Social Chat: todos podem publicar
    // 2. Trade/Crypto Chat: apenas admins e VIPs
    // 3. Outros grupos: admin, VIP ou membro do grupo
    let canPost = false
    if (isSocialChat) {
      canPost = true
    } else if (isTradeChat || isCryptoChat) {
      canPost = isAdmin || isVip
    } else {
      canPost = isAdmin || isVip || !!member
    }

    if (!canPost) {
      return NextResponse.json({ 
        error: 'Não tens permissão para publicar neste grupo. Apenas admins, VIPs e membros podem publicar.' 
      }, { status: 403 })
    }

    // Criar mensagem (sem join a profiles)
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        group_id: groupId,
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

    // Atualizar last_message_at no grupo
    await supabase
      .from('group_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', groupId)

    // Usar o grupo já buscado anteriormente para notificação

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
              title: `💬 ${session.user.user_metadata?.full_name || 'Alguém'} em ${group?.name || 'grupo'}`,
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

    return NextResponse.json({ message: messageWithSender })
  } catch (error) {
    console.error('Erro na API de mensagens do grupo:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// PUT: Atualizar grupo (apenas admin ou criador)
export async function PUT(
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

    // Verificar se é admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', session.user.id)
      .single()

    if (profile?.user_type !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado. Apenas admins podem atualizar grupos' }, { status: 403 })
    }

    const groupId = params.id
    const body = await request.json()
    const { name, description, avatar_url, is_public, is_mobile_visible } = body

    const { data: group, error } = await supabase
      .from('group_conversations')
      .update({
        name,
        description,
        avatar_url,
        is_public,
        is_mobile_visible,
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar grupo:', error)
      return NextResponse.json({ error: 'Erro ao atualizar grupo' }, { status: 500 })
    }

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Erro na API de atualização de grupo:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// DELETE: Eliminar grupo (apenas admin)
export async function DELETE(
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

    // Verificar se é admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', session.user.id)
      .single()

    if (profile?.user_type !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado. Apenas admins podem eliminar grupos' }, { status: 403 })
    }

    const groupId = params.id

    // Eliminar grupo (cascade elimina mensagens e membros)
    const { error } = await supabase
      .from('group_conversations')
      .delete()
      .eq('id', groupId)

    if (error) {
      console.error('Erro ao eliminar grupo:', error)
      return NextResponse.json({ error: 'Erro ao eliminar grupo' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro na API de eliminação de grupo:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


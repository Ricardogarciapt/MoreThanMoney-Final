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
      return NextResponse.json({ count: 0 })
    }

    // Buscar conversas do usuário primeiro
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .or(`user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`)

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ count: 0 })
    }

    const conversationIds = conversations.map(c => c.id)

    // Contar mensagens não lidas
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
      .neq('sender_id', session.user.id)
      .in('conversation_id', conversationIds)

    if (error) {
      console.error('Erro ao contar mensagens não lidas:', error)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    console.error('Erro na API de contagem:', error)
    return NextResponse.json({ count: 0 })
  }
}


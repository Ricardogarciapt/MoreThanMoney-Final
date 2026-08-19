import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter membros de um grupo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

    const groupId = id

    // Verificar se o utilizador é admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', session.user.id)
      .single()

    if (profile?.user_type !== 'admin') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Buscar membros do grupo (sem join a profiles)
    const { data: members, error } = await supabase
      .from('group_members')
      .select('id, user_id, role')
      .eq('group_id', groupId)

    if (error) {
      console.error('Erro ao buscar membros:', error)
      return NextResponse.json({ error: 'Erro ao buscar membros' }, { status: 500 })
    }

    const list = members || []
    const userIds = list.map((m: { user_id: string }) => m.user_id).filter(Boolean)
    const userMap: Record<string, { id: string; full_name?: string; username?: string; email?: string; avatar_url?: string }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, avatar_url')
        .in('id', userIds)
      for (const p of profiles || []) userMap[p.id] = p
    }
    const membersWithUsers = list.map((m: { user_id: string; [k: string]: unknown }) => ({
      ...m,
      user: userMap[m.user_id] || { id: m.user_id }
    }))

    return NextResponse.json({ members: membersWithUsers })
  } catch (error) {
    console.error('Erro na API de membros:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


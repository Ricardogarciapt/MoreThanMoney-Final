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

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''

    if (query.length < 2) {
      return NextResponse.json({ users: [] })
    }

    // Pesquisar utilizadores por nome, username ou email
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, email')
      .or(`full_name.ilike.%${query}%,username.ilike.%${query}%,email.ilike.%${query}%`)
      .neq('id', session.user.id) // Excluir o próprio utilizador
      .limit(20)

    if (error) {
      console.error('Erro ao pesquisar utilizadores:', error)
      return NextResponse.json({ error: 'Erro ao pesquisar utilizadores' }, { status: 500 })
    }

    return NextResponse.json({ users: users || [] })
  } catch (error) {
    console.error('Erro na API de pesquisa:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}


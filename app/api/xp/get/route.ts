import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter XP do utilizador
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

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    // Buscar XP do utilizador
    const { data: userXP, error } = await supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    // Se não existe registo, criar um vazio
    if (error && error.code === 'PGRST116') {
      return NextResponse.json({
        success: true,
        user_xp: {
          user_id: session.user.id,
          total_xp: 0,
          current_level: 1,
          badges: []
        }
      })
    }

    if (error) {
      console.error('Erro ao buscar XP:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user_xp: {
        user_id: userXP.user_id,
        total_xp: userXP.total_xp || 0,
        current_level: userXP.current_level || 1,
        badges: userXP.badges || []
      }
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


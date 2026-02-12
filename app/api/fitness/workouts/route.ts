import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar workouts do utilizador
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
    const includeTemplates = searchParams.get('include_templates') === 'true'

    let query = supabase
      .from('workouts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (includeTemplates) {
      query = query.or(`user_id.eq.${session.user.id},is_template.eq.true`)
    }

    const { data: workouts, error } = await query

    if (error) {
      console.error('❌ [WORKOUTS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar workouts' }, { status: 500 })
    }

    return NextResponse.json({ workouts: workouts || [] })
  } catch (error: any) {
    console.error('❌ [WORKOUTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar novo workout
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
    const { name, description, comment, is_template } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({
        user_id: session.user.id,
        name,
        description,
        comment,
        is_template: is_template || false,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUTS API] Erro ao criar:', error)
      return NextResponse.json({ error: 'Erro ao criar workout' }, { status: 500 })
    }

    return NextResponse.json({ workout })
  } catch (error: any) {
    console.error('❌ [WORKOUTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}



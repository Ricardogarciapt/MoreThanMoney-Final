import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar exercícios (públicos + do utilizador)
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
    const category = searchParams.get('category')
    const equipment = searchParams.get('equipment')
    const search = searchParams.get('search')

    let query = supabase
      .from('exercises')
      .select('*')
      .or(`is_public.eq.true,created_by.eq.${session.user.id}`)
      .order('name', { ascending: true })

    if (category) {
      query = query.eq('category', category)
    }

    if (equipment) {
      query = query.eq('equipment', equipment)
    }

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data: exercises, error } = await query

    if (error) {
      console.error('❌ [EXERCISES API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar exercícios' }, { status: 500 })
    }

    return NextResponse.json({ exercises: exercises || [] })
  } catch (error: any) {
    console.error('❌ [EXERCISES API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar novo exercício
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
    const { name, description, category, equipment, muscles_primary, muscles_secondary, instructions, image_url, video_url, is_public } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const { data: exercise, error } = await supabase
      .from('exercises')
      .insert({
        name,
        description,
        category: category || 'other',
        equipment: equipment || 'none',
        muscles_primary: muscles_primary || [],
        muscles_secondary: muscles_secondary || [],
        instructions,
        image_url,
        video_url,
        is_public: is_public !== false,
        created_by: session.user.id
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [EXERCISES API] Erro ao criar:', error)
      return NextResponse.json({ error: 'Erro ao criar exercício' }, { status: 500 })
    }

    return NextResponse.json({ exercise })
  } catch (error: any) {
    console.error('❌ [EXERCISES API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}



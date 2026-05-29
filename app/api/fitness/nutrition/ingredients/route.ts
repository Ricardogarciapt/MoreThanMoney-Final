import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar ingredientes (públicos + do utilizador)
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
    const search = searchParams.get('search')
    const barcode = searchParams.get('barcode')

    let query = supabase
      .from('ingredients')
      .select('*')
      .or(`is_public.eq.true,created_by.eq.${session.user.id}`)
      .order('name', { ascending: true })
      .limit(100)

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (barcode) {
      query = query.eq('barcode', barcode)
    }

    const { data: ingredients, error } = await query

    if (error) {
      console.error('❌ [INGREDIENTS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar ingredientes' }, { status: 500 })
    }

    return NextResponse.json({ ingredients: ingredients || [] })
  } catch (error: any) {
    console.error('❌ [INGREDIENTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar novo ingrediente
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
    const { name, energy_kcal, protein, carbs, fat, fiber, sodium, barcode, image_url, is_public } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const { data: ingredient, error } = await supabase
      .from('ingredients')
      .insert({
        name,
        energy_kcal: energy_kcal || 0,
        protein: protein || 0,
        carbs: carbs || 0,
        fat: fat || 0,
        fiber: fiber || 0,
        sodium: sodium || 0,
        barcode,
        image_url,
        is_public: is_public !== false,
        created_by: session.user.id
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [INGREDIENTS API] Erro ao criar:', error)
      return NextResponse.json({ error: 'Erro ao criar ingrediente' }, { status: 500 })
    }

    return NextResponse.json({ ingredient })
  } catch (error: any) {
    console.error('❌ [INGREDIENTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}



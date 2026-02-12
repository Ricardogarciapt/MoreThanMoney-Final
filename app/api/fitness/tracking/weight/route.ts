import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar registos de peso
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
    const limit = parseInt(searchParams.get('limit') || '100')

    const { data: entries, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('❌ [WEIGHT API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar registos de peso' }, { status: 500 })
    }

    return NextResponse.json({ entries: entries || [] })
  } catch (error: any) {
    console.error('❌ [WEIGHT API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar registo de peso
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
    const { weight, date, notes } = body

    if (!weight || weight <= 0) {
      return NextResponse.json({ error: 'Peso válido é obrigatório' }, { status: 400 })
    }

    const { data: entry, error } = await supabase
      .from('weight_entries')
      .insert({
        user_id: session.user.id,
        weight,
        date: date || new Date().toISOString().split('T')[0],
        notes
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [WEIGHT API] Erro ao criar:', error)
      return NextResponse.json({ error: 'Erro ao criar registo de peso' }, { status: 500 })
    }

    return NextResponse.json({ entry })
  } catch (error: any) {
    console.error('❌ [WEIGHT API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}



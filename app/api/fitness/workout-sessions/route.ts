import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar sessões de treino
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
    const limit = parseInt(searchParams.get('limit') || '50')
    const date = searchParams.get('date')

    let query = supabase
      .from('workout_sessions')
      .select(`
        *,
        workouts (
          id,
          name,
          description
        )
      `)
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit)

    if (date) {
      query = query.eq('date', date)
    }

    const { data: sessions, error } = await query

    if (error) {
      console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar sessões' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error: any) {
    console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar nova sessão de treino
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
    const { workout_id, workout_day_id, date, start_time, notes } = body

    if (workout_id) {
      const { data: workout } = await supabase
        .from('workouts')
        .select('id, user_id')
        .eq('id', workout_id)
        .single()
      if (!workout || workout.user_id !== session.user.id) {
        return NextResponse.json({ error: 'Plano não encontrado ou não te pertence' }, { status: 403 })
      }
    }

    const { data: workoutSession, error } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: session.user.id,
        workout_id,
        workout_day_id,
        date: date || new Date().toISOString().split('T')[0],
        start_time: start_time || new Date().toISOString(),
        notes
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUT SESSIONS API] Erro ao criar:', error)
      return NextResponse.json({ error: 'Erro ao criar sessão' }, { status: 500 })
    }

    return NextResponse.json({ session: workoutSession })
  } catch (error: any) {
    console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PUT: Atualizar sessão (completar, adicionar duração, rating)
export async function PUT(request: NextRequest) {
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
    const { id, end_time, duration_minutes, rating, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'ID da sessão é obrigatório' }, { status: 400 })
    }

    // Verificar ownership
    const { data: existing } = await supabase
      .from('workout_sessions')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const updates: any = {}
    if (end_time) updates.end_time = end_time
    if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes
    if (rating !== undefined) updates.rating = rating
    if (notes !== undefined) updates.notes = notes

    const { data: updated, error } = await supabase
      .from('workout_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUT SESSIONS API] Erro ao atualizar:', error)
      return NextResponse.json({ error: 'Erro ao atualizar sessão' }, { status: 500 })
    }

    return NextResponse.json({ session: updated })
  } catch (error: any) {
    console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}



import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter sessões de treino
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

    const { searchParams } = new URL(request.url)
    const workoutId = searchParams.get('workout_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('workout_sessions')
      .select('*, workouts(*)')
      .eq('user_id', session.user.id)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (workoutId) {
      query = query.eq('workout_id', workoutId)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar sessões' }, { status: 500 })
    }

    return NextResponse.json({ sessions: data || [] })
  } catch (error: any) {
    console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar/iniciar sessão de treino
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
    const { workout_id, completed, exercises_completed, notes, rating, duration_minutes } = body

    if (!workout_id) {
      return NextResponse.json({ error: 'ID do treino é obrigatório' }, { status: 400 })
    }

    // Se completed, atualizar sessão existente ou criar completa
    if (completed) {
      const { data: sessionData, error } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: session.user.id,
          workout_id,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_minutes: duration_minutes || null,
          exercises_completed: exercises_completed || [],
          notes,
          rating
        })
        .select()
        .single()

      if (error) {
        console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
        return NextResponse.json({ error: 'Erro ao salvar sessão' }, { status: 500 })
      }

      return NextResponse.json({ success: true, session: sessionData })
    } else {
      // Iniciar nova sessão
      const { data: sessionData, error } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: session.user.id,
          workout_id,
          started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
        return NextResponse.json({ error: 'Erro ao iniciar sessão' }, { status: 500 })
      }

      return NextResponse.json({ success: true, session: sessionData })
    }
  } catch (error: any) {
    console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PUT: Atualizar sessão de treino (completar)
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
    const { session_id, exercises_completed, notes, rating, duration_minutes } = body

    if (!session_id) {
      return NextResponse.json({ error: 'ID da sessão é obrigatório' }, { status: 400 })
    }

    const { data: sessionData, error } = await supabase
      .from('workout_sessions')
      .update({
        completed_at: new Date().toISOString(),
        duration_minutes,
        exercises_completed: exercises_completed || [],
        notes,
        rating
      })
      .eq('id', session_id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao atualizar sessão' }, { status: 500 })
    }

    return NextResponse.json({ success: true, session: sessionData })
  } catch (error: any) {
    console.error('❌ [WORKOUT SESSIONS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}


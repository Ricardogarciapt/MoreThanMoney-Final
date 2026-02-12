import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** POST: Registar log de um set (workout_set_logs) na Supabase */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const { workout_session_id, exercise_id, set_number, reps, weight, duration_seconds, rest_seconds, notes } = body
    if (!workout_session_id || !exercise_id || set_number == null) {
      return NextResponse.json({ error: 'workout_session_id, exercise_id e set_number obrigatórios' }, { status: 400 })
    }

    const { data: log, error } = await supabase
      .from('workout_set_logs')
      .insert({
        workout_session_id,
        exercise_id,
        set_number,
        reps: reps ?? null,
        weight: weight ?? null,
        duration_seconds: duration_seconds ?? null,
        rest_seconds: rest_seconds ?? null,
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUT SET LOGS]', error)
      return NextResponse.json({ error: 'Erro ao registar log' }, { status: 500 })
    }
    return NextResponse.json({ log })
  } catch (e: any) {
    console.error('❌ [WORKOUT SET LOGS]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** GET: Listar logs de uma sessão */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const sessionId = request.nextUrl.searchParams.get('workout_session_id')
    if (!sessionId) return NextResponse.json({ error: 'workout_session_id obrigatório' }, { status: 400 })

    const { data: logs, error } = await supabase
      .from('workout_set_logs')
      .select('*, exercises(id, name)')
      .eq('workout_session_id', sessionId)
      .order('set_number', { ascending: true })

    if (error) {
      console.error('❌ [WORKOUT SET LOGS]', error)
      return NextResponse.json({ error: 'Erro ao buscar logs' }, { status: 500 })
    }
    return NextResponse.json({ logs: logs || [] })
  } catch (e: any) {
    console.error('❌ [WORKOUT SET LOGS]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

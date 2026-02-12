import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** GET: Listar sets do dia (workout_sets) na Supabase */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dayId: string }> }
) {
  try {
    const { dayId } = await params
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

    const { data: sets, error } = await supabase
      .from('workout_sets')
      .select('*, exercises(id, name, category, equipment)')
      .eq('workout_day_id', dayId)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('❌ [WORKOUT SETS]', error)
      return NextResponse.json({ error: 'Erro ao buscar sets' }, { status: 500 })
    }
    return NextResponse.json({ sets: sets || [] })
  } catch (e: any) {
    console.error('❌ [WORKOUT SETS]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** POST: Adicionar set ao dia (Supabase workout_sets) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dayId: string }> }
) {
  try {
    const { dayId } = await params
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
    const { exercise_id, sets, reps_min, reps_max, weight, duration_seconds, rest_seconds, order_index, notes } = body
    if (!exercise_id) return NextResponse.json({ error: 'exercise_id obrigatório' }, { status: 400 })

    const { data: set, error } = await supabase
      .from('workout_sets')
      .insert({
        workout_day_id: dayId,
        exercise_id,
        sets: sets ?? 3,
        reps_min: reps_min ?? null,
        reps_max: reps_max ?? null,
        weight: weight ?? null,
        duration_seconds: duration_seconds ?? null,
        rest_seconds: rest_seconds ?? 60,
        order_index: order_index ?? 0,
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUT SETS]', error)
      return NextResponse.json({ error: 'Erro ao criar set' }, { status: 500 })
    }
    return NextResponse.json({ set })
  } catch (e: any) {
    console.error('❌ [WORKOUT SETS]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

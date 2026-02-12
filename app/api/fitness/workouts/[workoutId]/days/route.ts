import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** GET: Listar dias do plano (workout_days) na Supabase */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workoutId: string }> }
) {
  try {
    const { workoutId } = await params
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

    const { data: days, error } = await supabase
      .from('workout_days')
      .select('*')
      .eq('workout_id', workoutId)
      .order('day_number', { ascending: true })

    if (error) {
      console.error('❌ [WORKOUT DAYS]', error)
      return NextResponse.json({ error: 'Erro ao buscar dias' }, { status: 500 })
    }
    return NextResponse.json({ days: days || [] })
  } catch (e: any) {
    console.error('❌ [WORKOUT DAYS]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** POST: Criar dia no plano (Supabase workout_days) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workoutId: string }> }
) {
  try {
    const { workoutId } = await params
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
    const { day_number, description } = body
    if (day_number == null || day_number < 1 || day_number > 7) {
      return NextResponse.json({ error: 'day_number entre 1 e 7' }, { status: 400 })
    }

    const { data: day, error } = await supabase
      .from('workout_days')
      .insert({ workout_id: workoutId, day_number, description: description || null })
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUT DAYS]', error)
      return NextResponse.json({ error: 'Erro ao criar dia' }, { status: 500 })
    }
    return NextResponse.json({ day })
  } catch (e: any) {
    console.error('❌ [WORKOUT DAYS]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

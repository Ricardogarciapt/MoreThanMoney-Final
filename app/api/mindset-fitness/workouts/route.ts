import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter treinos do user ou treinos padrão
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
    const includeDefaults = searchParams.get('include_defaults') !== 'false'
    const trainerId = searchParams.get('trainer_id')

    // Verificar se é VIP (Personal Trainer)
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', session.user.id)
      .single()

    const isTrainer = profile?.membership_level === 'vip' || profile?.user_type === 'admin'

    let query = supabase
      .from('workouts')
      .select('*')
      .order('created_at', { ascending: false })

    if (isTrainer && trainerId) {
      // Trainer vê treinos de um user específico
      query = query.eq('user_id', trainerId)
    } else if (isTrainer) {
      // Trainer vê todos os treinos que criou
      query = query.eq('trainer_id', session.user.id)
    } else {
      // User normal vê seus treinos + padrões
      if (includeDefaults) {
        query = query.or(`user_id.eq.${session.user.id},is_default.eq.true`)
      } else {
        query = query.eq('user_id', session.user.id)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [WORKOUTS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar treinos' }, { status: 500 })
    }

    return NextResponse.json({ workouts: data || [] })
  } catch (error: any) {
    console.error('❌ [WORKOUTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar novo treino
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
    const { name, description, workout_type, difficulty, duration_minutes, exercises, user_id } = body

    if (!name || !workout_type || !exercises) {
      return NextResponse.json(
        { error: 'Nome, tipo e exercícios são obrigatórios' },
        { status: 400 }
      )
    }

    // Verificar se é trainer (pode criar treinos para outros users)
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', session.user.id)
      .single()

    const isTrainer = profile?.membership_level === 'vip' || profile?.user_type === 'admin'
    const targetUserId = (isTrainer && user_id) ? user_id : session.user.id

    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({
        user_id: targetUserId,
        trainer_id: isTrainer ? session.user.id : null,
        name,
        description,
        workout_type,
        difficulty: difficulty || 'beginner',
        duration_minutes,
        exercises: Array.isArray(exercises) ? exercises : [],
        is_default: false
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUTS API] Erro ao criar treino:', error)
      return NextResponse.json({ error: 'Erro ao criar treino' }, { status: 500 })
    }

    return NextResponse.json({ success: true, workout })
  } catch (error: any) {
    console.error('❌ [WORKOUTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PUT: Atualizar treino (apenas trainer ou owner)
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
    const { workout_id, name, description, workout_type, difficulty, duration_minutes, exercises, is_active } = body

    if (!workout_id) {
      return NextResponse.json({ error: 'ID do treino é obrigatório' }, { status: 400 })
    }

    // Verificar se é trainer ou owner do treino
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('user_id, trainer_id')
      .eq('id', workout_id)
      .single()

    if (!existingWorkout) {
      return NextResponse.json({ error: 'Treino não encontrado' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', session.user.id)
      .single()

    const isTrainer = profile?.membership_level === 'vip' || profile?.user_type === 'admin'
    const isOwner = existingWorkout.user_id === session.user.id
    const isTrainerOfWorkout = existingWorkout.trainer_id === session.user.id

    if (!isOwner && !isTrainer && !isTrainerOfWorkout) {
      return NextResponse.json({ error: 'Sem permissão para editar este treino' }, { status: 403 })
    }

    // Preparar dados de atualização
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (workout_type !== undefined) updateData.workout_type = workout_type
    if (difficulty !== undefined) updateData.difficulty = difficulty
    if (duration_minutes !== undefined) updateData.duration_minutes = duration_minutes
    if (exercises !== undefined) updateData.exercises = exercises
    if (is_active !== undefined) updateData.is_active = is_active
    updateData.updated_at = new Date().toISOString()

    const { data: workout, error } = await supabase
      .from('workouts')
      .update(updateData)
      .eq('id', workout_id)
      .select()
      .single()

    if (error) {
      console.error('❌ [WORKOUTS API] Erro ao atualizar treino:', error)
      return NextResponse.json({ error: 'Erro ao atualizar treino' }, { status: 500 })
    }

    return NextResponse.json({ success: true, workout })
  } catch (error: any) {
    console.error('❌ [WORKOUTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE: Deletar treino (apenas trainer ou owner)
export async function DELETE(request: NextRequest) {
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
    const workoutId = searchParams.get('id')

    if (!workoutId) {
      return NextResponse.json({ error: 'ID do treino é obrigatório' }, { status: 400 })
    }

    // Verificar permissões
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('user_id, trainer_id, is_default')
      .eq('id', workoutId)
      .single()

    if (!existingWorkout) {
      return NextResponse.json({ error: 'Treino não encontrado' }, { status: 404 })
    }

    // Não permitir deletar treinos padrão
    if (existingWorkout.is_default) {
      return NextResponse.json({ error: 'Não é possível deletar treinos padrão' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', session.user.id)
      .single()

    const isTrainer = profile?.membership_level === 'vip' || profile?.user_type === 'admin'
    const isOwner = existingWorkout.user_id === session.user.id
    const isTrainerOfWorkout = existingWorkout.trainer_id === session.user.id

    if (!isOwner && !isTrainer && !isTrainerOfWorkout) {
      return NextResponse.json({ error: 'Sem permissão para deletar este treino' }, { status: 403 })
    }

    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId)

    if (error) {
      console.error('❌ [WORKOUTS API] Erro ao deletar treino:', error)
      return NextResponse.json({ error: 'Erro ao deletar treino' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Treino deletado com sucesso' })
  } catch (error: any) {
    console.error('❌ [WORKOUTS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// POST: Criar os 3 treinos padrão para um user
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
    const targetUserId = body.user_id || session.user.id

    // Verificar se já existem treinos padrão
    const { data: existingDefaults } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('is_default', true)

    if (existingDefaults && existingDefaults.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Treinos padrão já existem',
        workouts: existingDefaults
      })
    }

    // Criar os 3 treinos padrão
    const defaultWorkouts = [
      {
        user_id: targetUserId,
        name: 'Treino Full Body - Iniciante',
        description: 'Treino completo para todo o corpo, ideal para iniciantes',
        workout_type: 'strength',
        difficulty: 'beginner',
        duration_minutes: 45,
        exercises: [
          { name: 'Agachamentos', sets: 3, reps: 12, rest: 60 },
          { name: 'Flexões', sets: 3, reps: 10, rest: 60 },
          { name: 'Prancha', sets: 3, duration: 30, rest: 60 },
          { name: 'Lunges', sets: 3, reps: 10, rest: 60 },
          { name: 'Abdominais', sets: 3, reps: 15, rest: 45 }
        ],
        is_default: true
      },
      {
        user_id: targetUserId,
        name: 'Treino Cardio - Intermediário',
        description: 'Treino cardiovascular para melhorar resistência',
        workout_type: 'cardio',
        difficulty: 'intermediate',
        duration_minutes: 30,
        exercises: [
          { name: 'Corrida', duration: 5, intensity: 'moderate' },
          { name: 'Burpees', sets: 3, reps: 10, rest: 60 },
          { name: 'Jumping Jacks', sets: 3, reps: 20, rest: 45 },
          { name: 'Mountain Climbers', sets: 3, duration: 30, rest: 45 },
          { name: 'High Knees', sets: 3, duration: 30, rest: 45 }
        ],
        is_default: true
      },
      {
        user_id: targetUserId,
        name: 'Treino Flexibilidade',
        description: 'Treino de alongamento e flexibilidade',
        workout_type: 'flexibility',
        difficulty: 'beginner',
        duration_minutes: 20,
        exercises: [
          { name: 'Alongamento de pernas', duration: 60 },
          { name: 'Alongamento de braços', duration: 60 },
          { name: 'Alongamento de costas', duration: 60 },
          { name: 'Yoga poses básicas', duration: 300 },
          { name: 'Respiração profunda', duration: 120 }
        ],
        is_default: true
      }
    ]

    const { data: workouts, error } = await supabase
      .from('workouts')
      .insert(defaultWorkouts)
      .select()

    if (error) {
      console.error('❌ [DEFAULT WORKOUTS] Erro:', error)
      return NextResponse.json({ error: 'Erro ao criar treinos padrão' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: '3 treinos padrão criados com sucesso',
      workouts
    })
  } catch (error: any) {
    console.error('❌ [DEFAULT WORKOUTS] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}


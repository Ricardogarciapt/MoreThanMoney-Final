import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Inicializa treinos e planos alimentares padrão para o utilizador atual
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
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const userId = session.user.id

    // Garantir 3 treinos padrão
    const { data: existingWorkouts, error: workoutsError } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .limit(1)

    if (!workoutsError && (!existingWorkouts || existingWorkouts.length === 0)) {
      await supabase.from("workouts").insert([
        {
          user_id: userId,
          name: "Treino Força Total",
          description: "Treino completo de força (parte superior e inferior).",
          comment: "Ponto de partida – ajusta conforme fores evoluindo.",
          is_template: false,
          is_active: true,
        },
        {
          user_id: userId,
          name: "Treino Cardio HIIT",
          description: "Sessão de cardio de alta intensidade.",
          comment: "Mantém a intensidade mas respeita os teus limites.",
          is_template: false,
          is_active: true,
        },
        {
          user_id: userId,
          name: "Mobilidade & Core",
          description: "Foco em mobilidade, estabilidade e core.",
          comment: "Ideal para dias de recuperação ativa.",
          is_template: false,
          is_active: true,
        },
      ])
    }

    // Garantir 2 planos alimentares / refeições padrão
    const { data: existingMeals, error: mealsError } = await supabase
      .from("meals")
      .select("id")
      .eq("user_id", userId)
      .limit(1)

    if (!mealsError && (!existingMeals || existingMeals.length === 0)) {
      const today = new Date().toISOString().split("T")[0]
      await supabase.from("meals").insert([
        {
          user_id: userId,
          meal_type: "breakfast",
          meal_date: today,
          meal_time: "08:00",
          notes: "Pequeno-almoço equilibrado (proteína + hidratos complexos + fruta).",
        },
        {
          user_id: userId,
          meal_type: "dinner",
          meal_date: today,
          meal_time: "20:00",
          notes: "Jantar leve focado em proteína e vegetais.",
        },
      ])
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("❌ [FITNESS BOOTSTRAP] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno", message: error.message },
      { status: 500 }
    )
  }
}


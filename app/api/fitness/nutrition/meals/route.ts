import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar refeições do utilizador
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
    const date = searchParams.get('date')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('meals')
      .select(`
        *,
        meal_items (
          id,
          amount,
          unit,
          ingredient:ingredients (
            id,
            name,
            energy_kcal,
            protein,
            carbs,
            fat
          )
        )
      `)
      .eq('user_id', session.user.id)
      .order('meal_date', { ascending: false })
      .order('meal_time', { ascending: false })
      .limit(limit)

    if (date) {
      query = query.eq('meal_date', date)
    }

    const { data: meals, error } = await query

    if (error) {
      console.error('❌ [MEALS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar refeições' }, { status: 500 })
    }

    // Calcular totais nutricionais para cada refeição
    const mealsWithTotals = (meals || []).map((meal: any) => {
      let totalCalories = 0
      let totalProtein = 0
      let totalCarbs = 0
      let totalFat = 0

      if (meal.meal_items && Array.isArray(meal.meal_items)) {
        meal.meal_items.forEach((item: any) => {
          if (item.ingredient) {
            const amount = item.amount || 0
            const factor = amount / 100 // Converter para 100g
            totalCalories += (item.ingredient.energy_kcal || 0) * factor
            totalProtein += (item.ingredient.protein || 0) * factor
            totalCarbs += (item.ingredient.carbs || 0) * factor
            totalFat += (item.ingredient.fat || 0) * factor
          }
        })
      }

      return {
        ...meal,
        total_calories: Math.round(totalCalories),
        total_protein: Math.round(totalProtein * 10) / 10,
        total_carbs: Math.round(totalCarbs * 10) / 10,
        total_fat: Math.round(totalFat * 10) / 10
      }
    })

    return NextResponse.json({ meals: mealsWithTotals })
  } catch (error: any) {
    console.error('❌ [MEALS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar nova refeição
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
    const { meal_type, meal_date, meal_time, notes, items } = body

    if (!meal_type || !meal_date) {
      return NextResponse.json({ error: 'Tipo e data são obrigatórios' }, { status: 400 })
    }

    // Criar refeição
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .insert({
        user_id: session.user.id,
        meal_type,
        meal_date,
        meal_time,
        notes
      })
      .select()
      .single()

    if (mealError || !meal) {
      console.error('❌ [MEALS API] Erro ao criar refeição:', mealError)
      return NextResponse.json({ error: 'Erro ao criar refeição' }, { status: 500 })
    }

    // Adicionar itens se fornecidos
    if (items && Array.isArray(items) && items.length > 0) {
      const mealItems = items.map((item: any) => ({
        meal_id: meal.id,
        ingredient_id: item.ingredient_id,
        amount: item.amount || 0,
        unit: item.unit || 'g'
      }))

      const { error: itemsError } = await supabase
        .from('meal_items')
        .insert(mealItems)

      if (itemsError) {
        console.error('❌ [MEALS API] Erro ao adicionar itens:', itemsError)
        // Não falhar, apenas logar
      }
    }

    return NextResponse.json({ meal })
  } catch (error: any) {
    console.error('❌ [MEALS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}



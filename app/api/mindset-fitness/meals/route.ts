import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter refeições do user
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
    const date = searchParams.get('date')
    const mealType = searchParams.get('meal_type')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('meals')
      .select('*')
      .eq('user_id', session.user.id)
      .order('meal_date', { ascending: false })
      .order('meal_time', { ascending: false })
      .limit(limit)

    if (date) {
      query = query.eq('meal_date', date)
    }

    if (mealType) {
      query = query.eq('meal_type', mealType)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [MEALS API] Erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar refeições' }, { status: 500 })
    }

    return NextResponse.json({ meals: data || [] })
  } catch (error: any) {
    console.error('❌ [MEALS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar nova refeição com análise de IA
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
    const { meal_type, meal_date, meal_time, foods, notes } = body

    if (!meal_type || !meal_date || !foods || !Array.isArray(foods)) {
      return NextResponse.json(
        { error: 'Tipo, data e alimentos são obrigatórios' },
        { status: 400 }
      )
    }

    // Calcular macros básicos (pode ser melhorado com API de nutrição)
    let totalCalories = 0
    let totalProtein = 0
    let totalCarbs = 0
    let totalFats = 0

    foods.forEach((food: any) => {
      totalCalories += (food.calories || 0) * (food.quantity || 1)
      totalProtein += (food.protein || 0) * (food.quantity || 1)
      totalCarbs += (food.carbs || 0) * (food.quantity || 1)
      totalFats += (food.fats || 0) * (food.quantity || 1)
    })

    // Análise com IA
    let aiAnalysis = ''
    const openaiKey = process.env.OPENAI_API_KEY
    if (openaiKey) {
      try {
        const foodsDescription = foods.map((f: any) => 
          `${f.name} (${f.quantity || 1} ${f.unit || 'porção'})`
        ).join(', ')

        const prompt = `Analise esta refeição e forneça feedback nutricional breve e prático:

Refeição: ${meal_type}
Alimentos: ${foodsDescription}
Calorias: ${totalCalories.toFixed(0)} kcal
Proteína: ${totalProtein.toFixed(1)}g
Carboidratos: ${totalCarbs.toFixed(1)}g
Gorduras: ${totalFats.toFixed(1)}g

Forneça:
1. Avaliação geral (1-2 frases)
2. Pontos positivos
3. Sugestões de melhoria (se necessário)
4. Dica prática

Seja conciso e útil.`

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Você é um nutricionista experiente e prático, focado em ajudar pessoas a terem uma alimentação equilibrada.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 300
          })
        })

        if (response.ok) {
          const data = await response.json()
          aiAnalysis = data.choices[0]?.message?.content || ''
        }
      } catch (aiError) {
        console.warn('⚠️ [MEALS API] Erro na análise IA:', aiError)
      }
    }

    const { data: meal, error } = await supabase
      .from('meals')
      .insert({
        user_id: session.user.id,
        meal_type,
        meal_date,
        meal_time: meal_time || null,
        foods,
        total_calories: totalCalories,
        total_protein: totalProtein,
        total_carbs: totalCarbs,
        total_fats: totalFats,
        ai_analysis: aiAnalysis,
        notes
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [MEALS API] Erro ao criar refeição:', error)
      return NextResponse.json({ error: 'Erro ao criar refeição' }, { status: 500 })
    }

    return NextResponse.json({ success: true, meal })
  } catch (error: any) {
    console.error('❌ [MEALS API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}


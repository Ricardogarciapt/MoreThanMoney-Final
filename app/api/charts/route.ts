import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Listar charts do utilizador
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

    // Verificar autenticação - tentar getUser primeiro (mais robusto)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      // Fallback: tentar getSession
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.error('Erro de autenticação:', userError || sessionError)
        return NextResponse.json(
          { success: false, error: 'Não autenticado' },
          { status: 401 }
        )
      }
      
      // Usar user da sessão
      var userId = session.user.id
    } else {
      var userId = user.id
    }

    // Buscar charts do utilizador
    const { data: charts, error } = await supabase
      .from('user_charts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar charts:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      charts: charts || []
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Salvar novo chart
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

    // Verificar autenticação - tentar getUser primeiro (mais robusto)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      // Fallback: tentar getSession
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.error('Erro de autenticação:', userError || sessionError)
        return NextResponse.json(
          { success: false, error: 'Não autenticado' },
          { status: 401 }
        )
      }
      
      // Usar user da sessão
      var userId = session.user.id
    } else {
      var userId = user.id
    }

    const body = await request.json()
    const {
      chart_name,
      symbol,
      timeframe,
      theme,
      chart_state,
      drawings_data,
      selected_studies,
      is_favorite
    } = body

    // Validar campos obrigatórios
    if (!chart_name || !symbol || !timeframe || !theme) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: chart_name, symbol, timeframe, theme' },
        { status: 400 }
      )
    }

    // Verificar limite de charts (20 por utilizador)
    const { data: existingCharts, error: countError } = await supabase
      .from('user_charts')
      .select('id')
      .eq('user_id', userId)

    if (countError) {
      console.error('Erro ao contar charts:', countError)
    } else if (existingCharts && existingCharts.length >= 20) {
      return NextResponse.json(
        { success: false, error: 'Limite de 20 charts atingido. Delete um chart antigo para salvar um novo.' },
        { status: 400 }
      )
    }

    // Criar novo chart
    const { data: newChart, error } = await supabase
      .from('user_charts')
      .insert({
        user_id: userId,
        chart_name,
        symbol,
        timeframe,
        theme,
        chart_state: chart_state || {},
        drawings_data: drawings_data || [],
        selected_studies: selected_studies || [],
        is_favorite: is_favorite || false
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao criar chart:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      chart: newChart
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter trades do utilizador
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM
    const status = searchParams.get('status')

    let query = supabase
      .from('trading_plan_trades')
      .select('*')
      .eq('user_id', session.user.id)
      .order('opened_at', { ascending: false })

    if (month) {
      const [year, monthNum] = month.split('-')
      const startDate = `${year}-${monthNum}-01`
      const endDate = `${year}-${monthNum}-31`
      query = query.gte('opened_at', startDate).lte('opened_at', endDate)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: trades, error } = await query

    if (error) {
      console.error('Erro ao buscar trades:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      trades
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Criar novo trade
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    // Buscar plano ativo do utilizador
    const { data: plan } = await supabase
      .from('trading_plans')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single()

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Nenhum plano de trading ativo encontrado' },
        { status: 400 }
      )
    }

    const { data: trade, error } = await supabase
      .from('trading_plan_trades')
      .insert({
        plan_id: plan.id,
        user_id: session.user.id,
        ...body
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao criar trade:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      trade
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT: Atualizar trade
export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID do trade é obrigatório' },
        { status: 400 }
      )
    }

    const { data: trade, error } = await supabase
      .from('trading_plan_trades')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar trade:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      trade
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


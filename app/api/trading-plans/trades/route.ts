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
    const executionMode = searchParams.get('execution_mode')
    const tradeSource = searchParams.get('trade_source')

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

    if (executionMode === 'executed' || executionMode === 'analysis') {
      query = query.eq('execution_mode', executionMode)
    }

    if (tradeSource === 'manual' || tradeSource === 'copy' || tradeSource === 'audited') {
      query = query.eq('trade_source', tradeSource)
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

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { execution_mode, trade_source, mtmcopy_connection_id, ...tradeFields } = body

    let { data: plan } = await supabase
      .from('trading_plans')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!plan) {
      const { data: newPlan, error: planError } = await supabase
        .from('trading_plans')
        .insert({
          user_id: session.user.id,
          plan_name: 'Meu Plano de Trading',
          trading_style: 'swing',
          favorite_pairs: [],
          trading_sessions: {},
          max_risk_per_trade: 1,
          max_daily_loss: 500,
          max_concurrent_positions: 3,
          is_active: true,
        })
        .select('id')
        .single()

      if (planError || !newPlan) {
        return NextResponse.json(
          { success: false, error: planError?.message || 'Erro ao criar plano de trading' },
          { status: 500 },
        )
      }
      plan = newPlan
    }

    const resolvedExecutionMode =
      execution_mode === 'executed' || execution_mode === 'analysis'
        ? execution_mode
        : tradeFields.exit_price
          ? 'executed'
          : 'analysis'

    const resolvedTradeSource =
      trade_source === 'copy' || trade_source === 'audited' || trade_source === 'manual'
        ? trade_source
        : 'manual'

    const { data: trade, error } = await supabase
      .from('trading_plan_trades')
      .insert({
        plan_id: plan.id,
        user_id: session.user.id,
        ...tradeFields,
        execution_mode: resolvedExecutionMode,
        trade_source: resolvedTradeSource,
        mtmcopy_connection_id: mtmcopy_connection_id || null,
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


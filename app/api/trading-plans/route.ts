import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Obter plano de trading do utilizador
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

    // Buscar plano ativo do utilizador
    const { data: plan, error } = await supabase
      .from('trading_plans')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single()

    // Se não existe, retornar null (não é erro)
    if (error && error.code === 'PGRST116') {
      return NextResponse.json({
        success: true,
        plan: null
      })
    }

    if (error) {
      console.error('Erro ao buscar plano:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      plan
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Criar ou atualizar plano de trading
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
    const {
      plan_name,
      trader_name,
      trading_style,
      favorite_pairs,
      trading_sessions,
      max_risk_per_trade,
      max_daily_loss,
      max_concurrent_positions,
      daily_profit_target,
      weekly_profit_target,
      monthly_profit_target,
      min_risk_reward_ratio,
      max_risk_reward_ratio,
      entry_rules,
      exit_rules,
      stop_loss_rules,
      take_profit_rules,
      additional_rules
    } = body

    // Verificar se já existe plano ativo
    const { data: existing } = await supabase
      .from('trading_plans')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single()

    if (existing) {
      // Atualizar plano existente
      const { data: updated, error } = await supabase
        .from('trading_plans')
        .update({
          plan_name,
          trader_name,
          trading_style,
          favorite_pairs,
          trading_sessions,
          max_risk_per_trade,
          max_daily_loss,
          max_concurrent_positions,
          daily_profit_target,
          weekly_profit_target,
          monthly_profit_target,
          min_risk_reward_ratio,
          max_risk_reward_ratio,
          entry_rules,
          exit_rules,
          stop_loss_rules,
          take_profit_rules,
          additional_rules,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Erro ao atualizar plano:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        plan: updated
      })
    } else {
      // Criar novo plano
      const { data: newPlan, error } = await supabase
        .from('trading_plans')
        .insert({
          user_id: session.user.id,
          plan_name,
          trader_name,
          trading_style,
          favorite_pairs,
          trading_sessions,
          max_risk_per_trade,
          max_daily_loss,
          max_concurrent_positions,
          daily_profit_target,
          weekly_profit_target,
          monthly_profit_target,
          min_risk_reward_ratio,
          max_risk_reward_ratio,
          entry_rules,
          exit_rules,
          stop_loss_rules,
          take_profit_rules,
          additional_rules
        })
        .select()
        .single()

      if (error) {
        console.error('Erro ao criar plano:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        plan: newPlan
      })
    }
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


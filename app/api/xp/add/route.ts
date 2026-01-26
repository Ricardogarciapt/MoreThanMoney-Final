import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// POST: Adicionar XP ao utilizador
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action_type, action_description } = body

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

    // Validar action_type
    if (!action_type) {
      return NextResponse.json(
        { success: false, error: 'action_type é obrigatório' },
        { status: 400 }
      )
    }

    // Buscar configuração de XP para este tipo de ação
    const { data: xpConfig } = await supabase
      .from('xp_config')
      .select('xp_amount')
      .eq('action_type', action_type)
      .single()

    const xpAmount = xpConfig?.xp_amount || 10

    // Verificar se já existe registo de XP
    const { data: existingXP } = await supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    let newTotalXP = 0
    let newLevel = 1

    if (existingXP) {
      // Atualizar XP existente
      newTotalXP = existingXP.total_xp + xpAmount
      newLevel = Math.floor(newTotalXP / 1000) + 1

      await supabase
        .from('user_xp')
        .update({
          total_xp: newTotalXP,
          current_level: newLevel,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', session.user.id)
    } else {
      // Criar novo registo
      newTotalXP = xpAmount
      newLevel = 1

      await supabase
        .from('user_xp')
        .insert({
          user_id: session.user.id,
          total_xp: newTotalXP,
          current_level: newLevel
        })
    }

    // Adicionar log de XP
    await supabase
      .from('xp_log')
      .insert({
        user_id: session.user.id,
        xp_amount: xpAmount,
        action_type: action_type,
        action_description: action_description || null
      })

    return NextResponse.json({
      success: true,
      xp_gained: xpAmount,
      total_xp: newTotalXP,
      level: newLevel
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Calcular progresso
function calculateProgress(steps: any): number {
  let completed = 0
  if (steps.step_1_completed) completed++
  if (steps.step_2_completed) completed++
  if (steps.step_3_completed) completed++
  if (steps.step_4_completed) completed++
  if (steps.step_5_completed) completed++
  if (steps.step_6_completed) completed++
  return Math.round((completed * 100) / 6)
}

// Adicionar XP ao usuário
async function addXP(supabase: any, userId: string, stepNumber: number) {
  try {
    // Buscar configuração de XP para onboarding steps
    const { data: xpConfig } = await supabase
      .from('xp_config')
      .select('xp_amount')
      .eq('action_type', 'onboarding_step_completed')
      .single()

    const xpAmount = xpConfig?.xp_amount || 50 // Default 50 XP por passo

    // Verificar se já existe registo de XP
    const { data: existingXP } = await supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', userId)
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
        .eq('user_id', userId)
    } else {
      // Criar novo registo
      newTotalXP = xpAmount
      newLevel = 1

      await supabase
        .from('user_xp')
        .insert({
          user_id: userId,
          total_xp: newTotalXP,
          current_level: newLevel
        })
    }

    // Adicionar log de XP
    await supabase
      .from('xp_log')
      .insert({
        user_id: userId,
        xp_amount: xpAmount,
        action_type: 'onboarding_step_completed',
        action_description: `Passo ${stepNumber} do Fast Start concluído`
      })

    return { xp_gained: xpAmount, total_xp: newTotalXP, level: newLevel }
  } catch (error: any) {
    console.error('❌ [FAST_START] Erro ao adicionar XP:', error)
    return null
  }
}

// GET: Obter progresso do utilizador
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

    // Tentar getUser() primeiro (mais robusto que getSession)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('❌ [FAST_START_GET] Erro ao obter usuário:', userError?.message)
      
      // Fallback: tentar getSession()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.error('❌ [FAST_START_GET] Erro ao obter sessão:', sessionError?.message)
        return NextResponse.json(
          { success: false, error: 'Não autenticado' },
          { status: 401 }
        )
      }
      
      // Usar user da sessão
      const userId = session.user.id
      
      // Buscar progresso
      const { data: progress, error } = await supabase
        .from('fast_start_progress')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [FAST_START_GET] Erro ao buscar progresso:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      if (!progress) {
        return NextResponse.json({
          success: true,
          progress: {
            step_1_completed: false,
            step_2_completed: false,
            step_3_completed: false,
            step_4_completed: false,
            step_5_completed: false,
            step_6_completed: false,
            progress_percent: 0
          }
        })
      }

      const calculatedProgress = calculateProgress(progress)

      return NextResponse.json({
        success: true,
        progress: {
          step_1_completed: progress.step_1_completed || false,
          step_2_completed: progress.step_2_completed || false,
          step_3_completed: progress.step_3_completed || false,
          step_4_completed: progress.step_4_completed || false,
          step_5_completed: progress.step_5_completed || false,
          step_6_completed: progress.step_6_completed || false,
          progress_percent: progress.progress_percent || calculatedProgress
        }
      })
    }
    
    // getUser() funcionou, usar user.id
    const userId = user.id
    
    // Buscar progresso
    const { data: progress, error } = await supabase
      .from('fast_start_progress')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [FAST_START_GET] Erro ao buscar progresso:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!progress) {
      return NextResponse.json({
        success: true,
        progress: {
          step_1_completed: false,
          step_2_completed: false,
          step_3_completed: false,
          step_4_completed: false,
          step_5_completed: false,
          step_6_completed: false,
          progress_percent: 0
        }
      })
    }

    const calculatedProgress = calculateProgress(progress)

    return NextResponse.json({
      success: true,
      progress: {
        step_1_completed: progress.step_1_completed || false,
        step_2_completed: progress.step_2_completed || false,
        step_3_completed: progress.step_3_completed || false,
        step_4_completed: progress.step_4_completed || false,
        step_5_completed: progress.step_5_completed || false,
        step_6_completed: progress.step_6_completed || false,
        progress_percent: progress.progress_percent || calculatedProgress
      }
    })
  } catch (error: any) {
    console.error('❌ [FAST_START_GET] Erro geral:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// POST: Marcar passo como concluído
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { step_number } = body

    if (!step_number || step_number < 1 || step_number > 6) {
      return NextResponse.json(
        { success: false, error: 'Número de passo inválido (deve ser entre 1 e 6)' },
        { status: 400 }
      )
    }

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

    // Tentar getUser() primeiro (mais robusto)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    let userId: string | null = null
    
    if (userError || !user) {
      console.error('❌ [FAST_START_POST] Erro ao obter usuário:', userError?.message)
      
      // Fallback: tentar getSession()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.error('❌ [FAST_START_POST] Erro de autenticação:', sessionError?.message)
        return NextResponse.json(
          { success: false, error: 'Não autenticado' },
          { status: 401 }
        )
      }
      
      userId = session.user.id
    } else {
      userId = user.id
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'ID de usuário não encontrado' },
        { status: 401 }
      )
    }

    const updateField = `step_${step_number}_completed`

    // Verificar se registo existe
    const { data: existing, error: existingError } = await supabase
      .from('fast_start_progress')
      .select('*')
      .eq('user_id', userId)
      .single()

    let progress
    let wasAlreadyCompleted = false

    if (existing) {
      // Verificar se já estava concluído (para não dar XP duas vezes)
      wasAlreadyCompleted = existing[updateField] === true

      if (wasAlreadyCompleted) {
        // Já estava concluído, apenas recalcular e retornar
        const calculatedProgress = calculateProgress(existing)
        
        // Atualizar progress_percent se necessário
        if (existing.progress_percent !== calculatedProgress) {
          await supabase
            .from('fast_start_progress')
            .update({ progress_percent: calculatedProgress })
            .eq('user_id', userId)
        }

        return NextResponse.json({
          success: true,
          progress: {
            step_1_completed: existing.step_1_completed || false,
            step_2_completed: existing.step_2_completed || false,
            step_3_completed: existing.step_3_completed || false,
            step_4_completed: existing.step_4_completed || false,
            step_5_completed: existing.step_5_completed || false,
            step_6_completed: existing.step_6_completed || false,
            progress_percent: calculatedProgress
          },
          xp_gained: 0,
          message: 'Passo já estava concluído'
        })
      }

      // Atualizar registo existente
      const { data, error } = await supabase
        .from('fast_start_progress')
        .update({
          [updateField]: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single()

      if (error) {
        console.error('❌ [FAST_START_POST] Erro ao atualizar:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }
      progress = data
    } else {
      // Criar registo novo
      const { data, error } = await supabase
        .from('fast_start_progress')
        .insert({
          user_id: userId,
          [updateField]: true,
          progress_percent: 0 // Será calculado abaixo
        })
        .select()
        .single()

      if (error) {
        console.error('❌ [FAST_START_POST] Erro ao criar:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }
      progress = data
    }

    // Calcular progresso
    const progressPercent = calculateProgress(progress)

    // Atualizar progress_percent no banco
    await supabase
      .from('fast_start_progress')
      .update({ progress_percent: progressPercent })
      .eq('user_id', userId)

    // Adicionar XP apenas se não estava concluído antes
    let xpResult = null
    if (!wasAlreadyCompleted) {
      xpResult = await addXP(supabase, userId, step_number)
    }

    return NextResponse.json({
      success: true,
      progress: {
        step_1_completed: progress.step_1_completed || false,
        step_2_completed: progress.step_2_completed || false,
        step_3_completed: progress.step_3_completed || false,
        step_4_completed: progress.step_4_completed || false,
        step_5_completed: progress.step_5_completed || false,
        step_6_completed: progress.step_6_completed || false,
        progress_percent: progressPercent
      },
      xp_gained: xpResult?.xp_gained || 0,
      total_xp: xpResult?.total_xp || null,
      level: xpResult?.level || null
    })
  } catch (error: any) {
    console.error('❌ [FAST_START_POST] Erro geral:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}


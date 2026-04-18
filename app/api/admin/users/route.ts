import { NextRequest, NextResponse } from "next/server"
import type { UserManagement } from "@/lib/admin-types"
import { getSupabaseAdmin, requireAdmin, validateRequiredFields, isValidUUID } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()
const FORCED_MTM_AUTO_ADMINS = new Set(["morethanmoneypt@gmail.com"])

export async function GET(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  const startTime = Date.now()
  
  try {
    // Garante este admin com acesso MTM Auto em cada leitura da gestão de utilizadores.
    const forcedEmail = "morethanmoneypt@gmail.com"
    if (FORCED_MTM_AUTO_ADMINS.has(forcedEmail)) {
      const { data: forcedProfile } = await supabase
        .from("profiles")
        .select("id, mtm_auto_enabled, mtm_auto_admin, mtm_auto_requested")
        .eq("email", forcedEmail)
        .maybeSingle()

      if (forcedProfile) {
        const forcePatch: Record<string, unknown> = {}
        if (!forcedProfile.mtm_auto_enabled) {
          forcePatch.mtm_auto_enabled = true
          forcePatch.mtm_auto_enabled_at = new Date().toISOString()
        }
        if (!forcedProfile.mtm_auto_admin) {
          forcePatch.mtm_auto_admin = true
        }
        if (forcedProfile.mtm_auto_requested) {
          forcePatch.mtm_auto_requested = false
          forcePatch.mtm_auto_requested_at = null
        }

        if (Object.keys(forcePatch).length > 0) {
          forcePatch.updated_at = new Date().toISOString()
          await supabase.from("profiles").update(forcePatch).eq("id", forcedProfile.id)
        }
      }
    }

    const { searchParams } = new URL(request.url)
    const userType = searchParams.get('user_type')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')


    // Construir query base
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Aplicar filtros
    if (userType) {
      query = query.eq('user_type', userType)
    }
    if (status === 'pending') {
      query = query.eq('user_type', 'pending')
    } else if (status === 'active') {
      query = query.eq('is_active', true)
    } else if (status === 'inactive') {
      query = query.eq('is_active', false)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('❌ [ADMIN USERS] Erro na query:', error)
      return NextResponse.json({ 
        error: 'Erro ao buscar utilizadores',
        details: error.message 
      }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ 
        data: [],
        count: 0,
        limit,
        offset
      })
    }

    const userIds = data.map(u => u.id)

    // Buscar XP e Fast Start Progress em paralelo (tabelas opcionais - não falhar se não existirem)
    let xpMap = new Map<string, { total_xp: number; level: number }>()
    let fastStartMap = new Map<string, { progress_percent: number; steps_completed: number }>()

    try {
      const [xpResult, fastStartResult] = await Promise.all([
        supabase
          .from('user_xp')
          .select('user_id, total_xp, current_level')
          .in('user_id', userIds),
        supabase
          .from('fast_start_progress')
          .select('user_id, progress_percent, step_1_completed, step_2_completed, step_3_completed, step_4_completed, step_5_completed, step_6_completed')
          .in('user_id', userIds)
      ])

      xpMap = new Map(
        (xpResult.data || []).map((x: { user_id: string; total_xp?: number; current_level?: number }) => [
          x.user_id,
          { total_xp: x.total_xp || 0, level: x.current_level || 1 }
        ])
      )

      fastStartMap = new Map(
        (fastStartResult.data || []).map((f: {
          user_id: string
          progress_percent?: number
          step_1_completed?: boolean
          step_2_completed?: boolean
          step_3_completed?: boolean
          step_4_completed?: boolean
          step_5_completed?: boolean
          step_6_completed?: boolean
        }) => [
          f.user_id,
          {
            progress_percent: f.progress_percent || 0,
            steps_completed: [
              f.step_1_completed,
              f.step_2_completed,
              f.step_3_completed,
              f.step_4_completed,
              f.step_5_completed,
              f.step_6_completed
            ].filter(Boolean).length
          }
        ])
      )
    } catch (optionalError) {
      console.warn('⚠️ [ADMIN USERS] Tabelas user_xp ou fast_start_progress não disponíveis:', optionalError)
    }
    
    // Combinar dados
    const dataWithXPAndProgress = data.map(user => ({
      ...user,
      xp: xpMap.get(user.id) || { total_xp: 0, level: 1 },
      fast_start: fastStartMap.get(user.id) || { progress_percent: 0, steps_completed: 0 }
    }))

    const duration = Date.now() - startTime

    return NextResponse.json({ 
      data: dataWithXPAndProgress,
      count: count || data.length,
      limit,
      offset,
      hasMore: (count || data.length) > offset + limit
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`❌ [ADMIN USERS] Erro após ${duration}ms:`, error)
    
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { userId, updates } = body

    // Validação
    const validation = validateRequiredFields(body, ['userId', 'updates'])
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error,
        missing: validation.missing
      }, { status: 400 })
    }

    if (!isValidUUID(userId)) {
      return NextResponse.json({ 
        error: 'userId deve ser um UUID válido' 
      }, { status: 400 })
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ 
        error: 'updates deve ser um objeto' 
      }, { status: 400 })
    }

    // Campos permitidos para atualização
    const allowedFields = [
      'full_name', 'username', 'email', 'phone', 'whatsapp',
      'user_type', 'member_category', 'membership_level', 'onboarding_platform',
      'is_active', 'is_verified', 'profile_data', 'avatar_url',
      'mtm_auto_requested', 'mtm_auto_requested_at', 'mtm_auto_enabled', 'mtm_auto_enabled_at', 'mtm_auto_admin'
    ]

    // Filtrar apenas campos permitidos
    const filteredUpdates: any = {
      updated_at: new Date().toISOString()
    }

    for (const key of allowedFields) {
      if (key in updates) {
        filteredUpdates[key] = updates[key]
      }
    }


    const { data, error } = await supabase
      .from('profiles')
      .update(filteredUpdates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('❌ [ADMIN USERS PUT] Erro:', error)
      return NextResponse.json({ 
        error: 'Erro ao atualizar utilizador',
        details: error.message 
      }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ 
        error: 'Utilizador não encontrado' 
      }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('❌ [ADMIN USERS PUT] Erro:', error)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      message: error.message 
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const {
      userId,
      user_type,
      member_category,
      onboarding_platform,
      is_active,
      mtm_auto_enabled,
      mtm_auto_admin,
      mtm_auto_requested,
    } = body

    // Validação
    if (!userId) {
      return NextResponse.json({ 
        error: 'userId é obrigatório' 
      }, { status: 400 })
    }

    if (!isValidUUID(userId)) {
      return NextResponse.json({ 
        error: 'userId deve ser um UUID válido' 
      }, { status: 400 })
    }

    // Validar user_type se fornecido (inactive = conta bloqueada; affiliate legado)
    const allowedUserTypes = ['admin', 'member', 'vip', 'pending', 'guest', 'presentation', 'inactive', 'affiliate'] as const
    if (user_type && !allowedUserTypes.includes(user_type as (typeof allowedUserTypes)[number])) {
      return NextResponse.json({
        error: `user_type inválido: ${user_type}. Valores permitidos: ${allowedUserTypes.join(', ')}`,
      }, { status: 400 })
    }

    // Validar member_category se fornecido
    if (member_category !== undefined && !['iq', 'skool', 'vip', 'standard'].includes(member_category)) {
      return NextResponse.json({ 
        error: `member_category inválido: ${member_category}. Valores permitidos: iq, skool, vip, standard` 
      }, { status: 400 })
    }

    // Validar onboarding_platform se fornecido
    if (onboarding_platform !== undefined && onboarding_platform !== null && !['vxa', 'rfg'].includes(onboarding_platform)) {
      return NextResponse.json({ 
        error: `onboarding_platform inválido: ${onboarding_platform}. Valores permitidos: vxa, rfg, null` 
      }, { status: 400 })
    }


    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (user_type) {
      updates.user_type = user_type
      if (user_type === 'inactive') {
        updates.is_active = false
      } else if (user_type !== 'pending' && is_active === undefined) {
        updates.is_active = true
      }
    }

    if (member_category !== undefined) {
      updates.member_category = member_category
    }

    if (onboarding_platform !== undefined) {
      updates.onboarding_platform = onboarding_platform
    }

    if (mtm_auto_requested !== undefined) {
      updates.mtm_auto_requested = Boolean(mtm_auto_requested)
      updates.mtm_auto_requested_at = mtm_auto_requested ? new Date().toISOString() : null
    }

    if (mtm_auto_enabled !== undefined) {
      updates.mtm_auto_enabled = Boolean(mtm_auto_enabled)
      updates.mtm_auto_enabled_at = mtm_auto_enabled ? new Date().toISOString() : null
      if (mtm_auto_enabled) {
        updates.mtm_auto_requested = false
      }
      if (!mtm_auto_enabled) {
        updates.mtm_auto_admin = false
      }
    }

    if (mtm_auto_admin !== undefined) {
      updates.mtm_auto_admin = Boolean(mtm_auto_admin)
      if (mtm_auto_admin) {
        updates.mtm_auto_enabled = true
        updates.mtm_auto_enabled_at = new Date().toISOString()
        updates.mtm_auto_requested = false
      }
    }

    // is_active explícito, exceto quando fica inativo (sempre false)
    if (is_active !== undefined && user_type !== 'inactive') {
      updates.is_active = is_active
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('❌ [ADMIN USERS PATCH] Erro:', error)
      return NextResponse.json({ 
        error: 'Erro ao atualizar utilizador',
        details: error.message 
      }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ 
        error: 'Utilizador não encontrado' 
      }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('❌ [ADMIN USERS PATCH] Erro:', error)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

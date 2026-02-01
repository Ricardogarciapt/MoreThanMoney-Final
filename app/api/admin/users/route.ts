import { NextRequest, NextResponse } from "next/server"
import type { UserManagement } from "@/lib/admin-types"
import { getSupabaseAdmin, requireAdmin, validateRequiredFields, isValidUUID } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  const startTime = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const userType = searchParams.get('user_type')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    console.log('👥 [ADMIN USERS] Buscando utilizadores:', { userType, status, limit, offset })

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
      console.log('ℹ️ [ADMIN USERS] Nenhum utilizador encontrado')
      return NextResponse.json({ 
        data: [],
        count: 0,
        limit,
        offset
      })
    }

    const userIds = data.map(u => u.id)
    
    // Buscar XP e Fast Start Progress em paralelo
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

    // Criar maps para lookup rápido
    const xpMap = new Map(
      (xpResult.data || []).map(x => [
        x.user_id, 
        { total_xp: x.total_xp || 0, level: x.current_level || 1 }
      ])
    )
    
    const fastStartMap = new Map(
      (fastStartResult.data || []).map(f => [
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
    
    // Combinar dados
    const dataWithXPAndProgress = data.map(user => ({
      ...user,
      xp: xpMap.get(user.id) || { total_xp: 0, level: 1 },
      fast_start: fastStartMap.get(user.id) || { progress_percent: 0, steps_completed: 0 }
    }))

    const duration = Date.now() - startTime
    console.log(`✅ [ADMIN USERS] ${dataWithXPAndProgress.length} utilizadores carregados em ${duration}ms`)

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
      'is_active', 'is_verified', 'profile_data', 'avatar_url'
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

    console.log('🔄 [ADMIN USERS PUT] Atualizando utilizador:', { userId, fields: Object.keys(filteredUpdates) })

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

    console.log('✅ [ADMIN USERS PUT] Utilizador atualizado com sucesso')
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
    const { userId, user_type, member_category, onboarding_platform, is_active } = body

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

    // Validar user_type se fornecido
    if (user_type && !['admin', 'member', 'pending', 'guest', 'presentation'].includes(user_type)) {
      return NextResponse.json({ 
        error: `user_type inválido: ${user_type}. Valores permitidos: admin, member, pending, guest, presentation` 
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

    console.log('🔄 [ADMIN USERS PATCH] Atualizando:', { userId, user_type, member_category, onboarding_platform, is_active })

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (user_type) {
      updates.user_type = user_type
    }

    if (member_category !== undefined) {
      updates.member_category = member_category
    }

    if (onboarding_platform !== undefined) {
      updates.onboarding_platform = onboarding_platform
    }

    if (is_active !== undefined) {
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

    console.log('✅ [ADMIN USERS PATCH] Atualizado com sucesso')
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

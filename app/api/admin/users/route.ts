import { NextRequest, NextResponse } from "next/server"
import type { UserManagement } from "@/lib/admin-types"
import { getSupabaseAdmin, requireAdmin, validateRequiredFields, isValidUUID } from "@/lib/admin-api-helpers"
import {
  buildSubscriptionExpiry,
  isSubscriptionCategory,
  subscriptionDaysRemaining,
} from "@/lib/member-subscription"
import { clearSkoolAccessPending } from "@/lib/stripe-skool-admin"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  const startTime = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const userType = searchParams.get("user_type")
    const memberCategory = searchParams.get("member_category")
    const status = searchParams.get("status")
    const subscription = searchParams.get("subscription")
    const q = searchParams.get("q")?.trim().replace(/[%_]/g, "") || ""
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (userType) {
      query = query.eq("user_type", userType)
    }
    if (memberCategory) {
      query = query.eq("member_category", memberCategory)
    }
    if (status === "pending") {
      query = query.eq("user_type", "pending")
    } else if (status === "active") {
      query = query.eq("is_active", true)
    } else if (status === "inactive") {
      query = query.or("is_active.eq.false,user_type.eq.inactive")
    } else if (status === "subscription_iq_skool") {
      query = query.in("member_category", ["iq", "skool", "premium"])
    }

    if (subscription === "expiring_soon") {
      const in7 = new Date()
      in7.setDate(in7.getDate() + 7)
      query = query
        .in("member_category", ["iq", "skool", "premium"])
        .not("subscription_expires_at", "is", null)
        .lte("subscription_expires_at", in7.toISOString())
        .gte("subscription_expires_at", new Date().toISOString())
    } else if (subscription === "expired") {
      query = query
        .in("member_category", ["iq", "skool", "premium"])
        .not("subscription_expires_at", "is", null)
        .lt("subscription_expires_at", new Date().toISOString())
    }

    const subscriptionPlatform = searchParams.get("subscription_platform")
    if (subscriptionPlatform) {
      query = query.eq("subscription_platform", subscriptionPlatform)
    }

    const skoolPending = searchParams.get("skool_pending")
    if (skoolPending === "true") {
      query = query.eq("profile_data->>skool_access_pending", "true")
    }

    if (q.length >= 2) {
      const pattern = `%${q}%`
      query = query.or(
        `email.ilike.${pattern},username.ilike.${pattern},full_name.ilike.${pattern}`
      )
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
    const dataWithXPAndProgress = data.map((user) => {
      const profileData =
        user.profile_data && typeof user.profile_data === "object"
          ? (user.profile_data as Record<string, unknown>)
          : {}
      return {
        ...user,
        skool_access_pending: profileData.skool_access_pending === true,
        xp: xpMap.get(user.id) || { total_xp: 0, level: 1 },
        fast_start: fastStartMap.get(user.id) || { progress_percent: 0, steps_completed: 0 },
        subscription_days_remaining: isSubscriptionCategory(user.member_category)
          ? subscriptionDaysRemaining(user.subscription_expires_at)
          : null,
      }
    })

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
      'subscription_expires_at', 'subscription_auto_renew', 'trial_expires_at', 'trial_expired',
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
      subscription_auto_renew,
      renew_subscription,
      // Gestão avançada de subscrições
      subscription_plan,
      subscription_billing_cycle,
      subscription_expires_at_custom,
      add_days,
      cancel_subscription,
      mark_skool_granted,
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

    if (mark_skool_granted === true) {
      await clearSkoolAccessPending(supabase, userId)
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: "Utilizador não encontrado" }, { status: 404 })
      }

      return NextResponse.json({ success: true, data })
    }

    // Validar user_type se fornecido (inactive = conta bloqueada; affiliate legado)
    const allowedUserTypes = ['admin', 'member', 'vip', 'pending', 'guest', 'presentation', 'inactive', 'affiliate'] as const
    if (user_type && !allowedUserTypes.includes(user_type as (typeof allowedUserTypes)[number])) {
      return NextResponse.json({
        error: `user_type inválido: ${user_type}. Valores permitidos: ${allowedUserTypes.join(', ')}`,
      }, { status: 400 })
    }

    // Validar member_category se fornecido
    if (member_category !== undefined && !['iq', 'skool', 'vip', 'standard', 'premium'].includes(member_category)) {
      return NextResponse.json({
        error: `member_category inválido: ${member_category}. Valores permitidos: iq, skool, vip, standard, premium`
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
      if (isSubscriptionCategory(member_category)) {
        updates.subscription_expires_at = buildSubscriptionExpiry()
        updates.subscription_auto_renew =
          subscription_auto_renew !== undefined ? subscription_auto_renew : true
        if (!user_type || user_type === "inactive") {
          updates.user_type = "member"
        }
        updates.is_active = true
      }
    }

    if (onboarding_platform !== undefined) {
      updates.onboarding_platform = onboarding_platform
    }

    if (subscription_auto_renew !== undefined) {
      updates.subscription_auto_renew = Boolean(subscription_auto_renew)
    }

    if (renew_subscription === true) {
      const { data: current } = await supabase
        .from("profiles")
        .select("member_category, user_type")
        .eq("id", userId)
        .single()

      if (isSubscriptionCategory(current?.member_category)) {
        updates.subscription_expires_at = buildSubscriptionExpiry()
        updates.subscription_auto_renew = true
        updates.is_active = true
        if (current?.user_type === "inactive") {
          updates.user_type = "member"
        }
      }
    }

    if (is_active !== undefined && user_type !== "inactive") {
      updates.is_active = is_active
    }

    // Plano e ciclo de faturação (override manual)
    if (subscription_plan !== undefined && ['app_member', 'premium'].includes(subscription_plan)) {
      updates.subscription_plan = subscription_plan
    }
    if (subscription_billing_cycle !== undefined && ['monthly', 'annual'].includes(subscription_billing_cycle)) {
      updates.subscription_billing_cycle = subscription_billing_cycle
    }

    // Data de validade exacta (override admin)
    if (subscription_expires_at_custom) {
      const d = new Date(subscription_expires_at_custom)
      if (!isNaN(d.getTime())) {
        updates.subscription_expires_at = d.toISOString()
        updates.is_active = true
      }
    }

    // Adicionar N dias à validade actual
    if (add_days && typeof add_days === 'number' && add_days > 0 && add_days <= 3650) {
      const { data: cur } = await supabase
        .from("profiles")
        .select("subscription_expires_at")
        .eq("id", userId)
        .single()
      const base =
        cur?.subscription_expires_at && new Date(cur.subscription_expires_at) > new Date()
          ? new Date(cur.subscription_expires_at)
          : new Date()
      const newExpiry = new Date(base)
      newExpiry.setDate(newExpiry.getDate() + add_days)
      updates.subscription_expires_at = newExpiry.toISOString()
      updates.is_active = true
    }

    // Cancelar subscrição e desativar conta
    if (cancel_subscription === true) {
      updates.subscription_status = 'cancelled'
      updates.subscription_auto_renew = false
      updates.subscription_plan = null
      updates.is_active = false
      updates.user_type = 'inactive'
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

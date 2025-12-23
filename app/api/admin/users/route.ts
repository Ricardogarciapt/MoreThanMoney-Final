import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { UserManagement } from "@/lib/admin-types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userType = searchParams.get('user_type')
    const status = searchParams.get('status')

    let query = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (userType) {
      query = query.eq('user_type', userType)
    }
    if (status === 'pending') {
      query = query.eq('user_type', 'pending')
    } else if (status === 'active') {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Buscar XP e Fast Start Progress para todos os utilizadores
    if (data && data.length > 0) {
      const userIds = data.map(u => u.id)
      
      // Buscar XP
      const { data: xpData } = await supabase
        .from('user_xp')
        .select('user_id, total_xp, current_level')
        .in('user_id', userIds)

      // Buscar Fast Start Progress
      const { data: fastStartData } = await supabase
        .from('fast_start_progress')
        .select('user_id, progress_percent, step_1_completed, step_2_completed, step_3_completed, step_4_completed, step_5_completed, step_6_completed')
        .in('user_id', userIds)

      // Adicionar XP aos utilizadores
      const xpMap = new Map(xpData?.map(x => [x.user_id, { total_xp: x.total_xp || 0, level: x.current_level || 1 }]) || [])
      
      // Adicionar Fast Start Progress aos utilizadores
      const fastStartMap = new Map(fastStartData?.map(f => [f.user_id, {
        progress_percent: f.progress_percent || 0,
        steps_completed: [
          f.step_1_completed,
          f.step_2_completed,
          f.step_3_completed,
          f.step_4_completed,
          f.step_5_completed,
          f.step_6_completed
        ].filter(Boolean).length
      }]) || [])
      
      const dataWithXPAndProgress = data.map(user => ({
        ...user,
        xp: xpMap.get(user.id) || { total_xp: 0, level: 1 },
        fast_start: fastStartMap.get(user.id) || { progress_percent: 0, steps_completed: 0 }
      }))

      return NextResponse.json({ data: dataWithXPAndProgress })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, updates } = body

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, user_type, member_category, onboarding_platform } = body

    console.log('[ADMIN_USERS_PATCH] Atualizando:', { userId, user_type, member_category, onboarding_platform })

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

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('[ADMIN_USERS_PATCH] Erro:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[ADMIN_USERS_PATCH] ✅ Atualizado com sucesso')
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[ADMIN_USERS_PATCH] Erro:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

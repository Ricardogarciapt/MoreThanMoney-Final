import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = getSupabaseAdmin()

/**
 * POST /api/auth/create-profile
 *
 * Cria ou actualiza o perfil de um utilizador após registo.
 * Usa o service role (admin) para contornar RLS.
 * Segurança: verifica que o JWT pertence ao utilizador cujo perfil é criado.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token de autenticação em falta' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')

    // Verificar o token e obter o utilizador real
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      full_name,
      username,
      phone,
      whatsapp,
      subscription_plan,
      subscription_billing_cycle,
      member_category,
      auto_approve,
    } = body

    if (!full_name || !username) {
      return NextResponse.json({ error: 'full_name e username são obrigatórios' }, { status: 400 })
    }

    const isApproved = auto_approve !== false // por omissão aprova automaticamente
    const plan = subscription_plan || 'app_member'
    const cycle = subscription_billing_cycle || 'monthly'
    const category = member_category || (plan === 'premium' ? 'premium' : 'standard')

    const profileRow = {
      id: user.id,
      email: user.email,
      full_name,
      username,
      phone: phone || null,
      whatsapp: whatsapp || null,
      user_type: isApproved ? 'member' : 'pending',
      member_category: category,
      is_active: isApproved,
      subscription_plan: plan,
      subscription_billing_cycle: cycle,
      subscription_platform: 'manual',
      updated_at: new Date().toISOString(),
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' })

    if (profileError) {
      console.error('❌ [CREATE PROFILE] Erro ao criar perfil:', profileError)
      return NextResponse.json(
        { error: 'Erro ao criar perfil: ' + profileError.message },
        { status: 500 }
      )
    }

    console.log(`✅ [CREATE PROFILE] Perfil criado para ${user.email}`)
    return NextResponse.json({ success: true, userId: user.id })

  } catch (error: any) {
    console.error('❌ [CREATE PROFILE] Erro inesperado:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { awardXp } from '@/lib/xp-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action_type, action_description } = body

    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          },
        },
      },
    )

    const {
      data: { session },
    } = await supabaseAuth.auth.getSession()

    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    if (!action_type) {
      return NextResponse.json({ success: false, error: 'action_type é obrigatório' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const result = await awardXp(supabase, session.user.id, action_type, {
      actionDescription: action_description,
      oncePerDescription: action_type.startsWith('onboarding_'),
    })

    return NextResponse.json({
      success: true,
      awarded: result.awarded,
      xp_gained: result.xp_gained,
      total_xp: result.total_xp,
      level: result.level,
      reason: result.reason,
    })
  } catch (error: unknown) {
    console.error('[XP ADD]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro' },
      { status: 500 },
    )
  }
}

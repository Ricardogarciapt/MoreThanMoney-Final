import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  try {
    const supabase = getSupabaseAdmin()

    // Buscar estatísticas de trials
    // Schema: guest / presentation (trials); não existe user_type 'trial' no CHECK habitual
    const { data: trials, error } = await supabase
      .from("profiles")
      .select("*")
      .in("user_type", ["guest", "presentation"])

    if (error) {
      throw error
    }

    const now = new Date()
    
    const activeTrials = trials?.filter(t => {
      if (!t.trial_expires_at) return false
      return new Date(t.trial_expires_at) > now
    }).length || 0

    const expiredTrials = trials?.filter(t => {
      if (!t.trial_expires_at) return false
      return new Date(t.trial_expires_at) <= now
    }).length || 0

    const totalGuests = trials?.filter(t => t.user_type === 'guest').length || 0

    return NextResponse.json({
      success: true,
      data: {
        activeTrials,
        expiredTrials,
        totalGuests,
        totalTrials: trials?.length || 0
      }
    })
  } catch (error: any) {
    console.error('❌ [TRIAL STATS] Erro:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


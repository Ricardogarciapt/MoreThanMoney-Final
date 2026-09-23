import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    // Buscar todos os utilizadores trial
    const { data: trialUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .in('user_type', ['guest', 'presentation'])
      .eq('trial_expired', false)
      .not('trial_expires_at', 'is', null)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const now = new Date()
    const expiredUsers = []
    const activeUsers = []

    // Verificar cada utilizador
    for (const user of trialUsers || []) {
      const expiryDate = new Date(user.trial_expires_at)
      
      if (expiryDate < now) {
        // Trial expirado - desativar
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            is_active: false,
            trial_expired: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)

        if (!updateError) {
          expiredUsers.push({
            id: user.id,
            email: user.email,
            user_type: user.user_type,
            expired_at: expiryDate
          })
        }
      } else {
        // Trial ainda ativo
        const timeRemaining = expiryDate.getTime() - now.getTime()
        const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24))
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60))
        
        activeUsers.push({
          id: user.id,
          email: user.email,
          user_type: user.user_type,
          expires_at: expiryDate,
          days_remaining: daysRemaining,
          hours_remaining: hoursRemaining
        })
      }
    }

    return NextResponse.json({
      success: true,
      checked_at: now.toISOString(),
      total_checked: trialUsers?.length || 0,
      expired_count: expiredUsers.length,
      active_count: activeUsers.length,
      expired_users: expiredUsers,
      active_trials: activeUsers
    })

  } catch (error: any) {
    console.error('Erro ao verificar trials:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    // Apenas retornar informações dos trials ativos
    const { data: trialUsers, error } = await supabase
      .from('profiles')
      .select('id, email, username, full_name, user_type, trial_expires_at, trial_expired, is_active')
      .in('user_type', ['guest', 'presentation'])
      .order('trial_expires_at', { ascending: true })

    if (error) {
      console.warn('Error fetching trial users:', error.message)
      return NextResponse.json({ data: [] })
    }

    const now = new Date()
    const processedUsers = (trialUsers || []).map((user: any) => {
      const expiryDate = new Date(user.trial_expires_at || now)
      const timeRemaining = expiryDate.getTime() - now.getTime()
      
      return {
        ...user,
        days_remaining: Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60 * 24))),
        hours_remaining: Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60))),
        minutes_remaining: Math.max(0, Math.floor(timeRemaining / (1000 * 60))),
        is_expired: timeRemaining <= 0
      }
    })

    return NextResponse.json({ 
      data: processedUsers,
      total: processedUsers.length,
      active: processedUsers.filter((u: any) => !u.is_expired).length,
      expired: processedUsers.filter((u: any) => u.is_expired).length
    })

  } catch (error: any) {
    console.error('Erro ao buscar trials:', error)
    return NextResponse.json({ data: [] })
  }
}

import { NextRequest, NextResponse } from "next/server"
import type { AdminStats } from "@/lib/admin-types"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  const startTime = Date.now()
  
  try {

    // Executar queries em paralelo para melhor performance
    const [
      { count: totalUsers, error: totalUsersError },
      { count: activeUsers, error: activeUsersError },
      { count: pendingUsers, error: pendingUsersError },
      { count: totalMembers, error: totalMembersError },
      { data: content, error: contentError },
      { data: activity, error: activityError }
    ] = await Promise.all([
      // Total de utilizadores
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true }),
      
      // Utilizadores ativos
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      
      // Utilizadores pendentes
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_type', 'pending'),
      
      // Total de membros
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_type', 'member'),
      
      // Conteúdo (com fallback se tabela não existir)
      supabase
        .from('site_content')
        .select('id, is_active, created_at')
        .then(result => result)
        .catch(() => ({ data: null, error: { message: 'Table does not exist' } })),
      
      // Atividade recente (últimos 7 dias)
      (async () => {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        
        return supabase
          .from('activity_logs')
          .select('*')
          .gte('timestamp', sevenDaysAgo.toISOString())
          .order('timestamp', { ascending: false })
          .limit(50)
          .then(result => result)
          .catch(() => ({ data: null, error: { message: 'Table does not exist' } }))
      })()
    ])

    // Tratamento de erros
    if (totalUsersError) {
      console.error('❌ [ADMIN STATS] Erro ao buscar total de utilizadores:', totalUsersError)
      return NextResponse.json({ 
        error: 'Erro ao buscar estatísticas de utilizadores',
        details: totalUsersError.message 
      }, { status: 500 })
    }

    // Logs de aviso para tabelas opcionais
    if (contentError && contentError.message !== 'Table does not exist') {
      console.warn('⚠️ [ADMIN STATS] Aviso ao buscar conteúdo:', contentError.message)
    }

    if (activityError && activityError.message !== 'Table does not exist') {
      console.warn('⚠️ [ADMIN STATS] Aviso ao buscar atividade:', activityError.message)
    }

    const contentRows = Array.isArray(content) ? content : []
    const activityRows = Array.isArray(activity) ? activity : []

    const stats: AdminStats = {
      total_users: totalUsers || 0,
      active_users: activeUsers || 0,
      pending_users: pendingUsers || 0,
      total_members: totalMembers || 0,
      total_content: contentRows.length,
      active_content: contentRows.filter((c: { is_active?: boolean }) => c.is_active).length,
      recent_activity: activityRows,
    }

    const duration = Date.now() - startTime

    return NextResponse.json({ data: stats })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`❌ [ADMIN STATS] Erro após ${duration}ms:`, error)
    
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

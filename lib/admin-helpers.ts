/**
 * Helpers centralizados para operações admin
 * Garante consistência entre frontend e backend
 */

import { supabase } from "@/lib/supabase"

/**
 * Verifica se o utilizador atual é admin
 */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return false

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, is_active')
      .eq('id', session.user.id)
      .single()

    return profile?.user_type === 'admin' && profile?.is_active === true
  } catch (error) {
    console.error('❌ [ADMIN HELPERS] Erro ao verificar admin:', error)
    return false
  }
}

/**
 * Busca dados do utilizador atual
 */
export async function getCurrentUserProfile() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    return profile
  } catch (error) {
    console.error('❌ [ADMIN HELPERS] Erro ao buscar perfil:', error)
    return null
  }
}

/**
 * Wrapper para chamadas API admin com tratamento de erro consistente
 */
export async function adminApiCall<T>(
  endpoint: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(endpoint, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      data: data.data || data,
    }
  } catch (error: any) {
    console.error(`❌ [ADMIN API] Erro em ${endpoint}:`, error)
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    }
  }
}

/**
 * Real-time subscription helper para componentes admin
 */
export function createAdminSubscription(
  table: string,
  callback: (payload: any) => void,
  filter?: string
) {
  const channelName = `admin-${table}-${Date.now()}`
  
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter,
      },
      callback
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ [ADMIN] Subscription ativa: ${table}`)
      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`⚠️ [ADMIN] Erro na subscription: ${table}`)
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}


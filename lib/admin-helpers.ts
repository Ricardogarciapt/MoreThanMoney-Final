/**
 * Helpers centralizados para operações admin
 * Garante consistência entre frontend e backend
 * Versão melhorada com cache, retry logic e validação
 */

import { supabase } from "@/lib/supabase"

// Cache simples em memória (client-side apenas)
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

// Configurações
const CACHE_TTL = 30000 // 30 segundos
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 segundo

/**
 * Limpa cache expirado
 */
function cleanExpiredCache() {
  const now = Date.now()
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > value.ttl) {
      cache.delete(key)
    }
  }
}

/**
 * Verifica se o utilizador atual é admin (com cache)
 */
export async function checkIsAdmin(): Promise<boolean> {
  const cacheKey = 'admin_check'
  const cached = cache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      cache.set(cacheKey, { data: false, timestamp: Date.now(), ttl: 5000 })
      return false
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('user_type, is_active')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error) {
      console.error('❌ [ADMIN HELPERS] Erro ao verificar admin:', error)
      return false
    }

    const isAdmin = profile?.user_type === 'admin' && profile?.is_active === true
    cache.set(cacheKey, { data: isAdmin, timestamp: Date.now(), ttl: 10000 }) // Cache por 10s
    return isAdmin
  } catch (error) {
    console.error('❌ [ADMIN HELPERS] Erro ao verificar admin:', error)
    return false
  }
}

/**
 * Busca dados do utilizador atual (com cache)
 */
export async function getCurrentUserProfile() {
  const cacheKey = 'current_user_profile'
  const cached = cache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      return null
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error) {
      console.error('❌ [ADMIN HELPERS] Erro ao buscar perfil:', error)
      return null
    }

    if (profile) {
      cache.set(cacheKey, { data: profile, timestamp: Date.now(), ttl: 15000 }) // Cache por 15s
    }
    return profile
  } catch (error) {
    console.error('❌ [ADMIN HELPERS] Erro ao buscar perfil:', error)
    return null
  }
}

/**
 * Wrapper para chamadas API admin com retry logic, cache e tratamento de erro melhorado
 */
export async function adminApiCall<T>(
  endpoint: string,
  options?: RequestInit & { 
    useCache?: boolean
    cacheTTL?: number
    retries?: number
  }
): Promise<{ success: boolean; data?: T; error?: string; details?: any }> {
  const {
    useCache = false,
    cacheTTL = CACHE_TTL,
    retries = MAX_RETRIES,
    ...fetchOptions
  } = options || {}

  // Limpar cache expirado
  cleanExpiredCache()

  // Verificar cache se habilitado
  if (useCache && fetchOptions.method === 'GET') {
    const cached = cache.get(endpoint)
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return {
        success: true,
        data: cached.data,
      }
    }
  }

  let lastError: any = null

  // Retry logic
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders: Record<string, string> = {}
      if (session?.access_token) {
        authHeaders.Authorization = `Bearer ${session.access_token}`
      }

      const response = await fetch(endpoint, {
        ...fetchOptions,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...fetchOptions.headers,
        },
      })

      clearTimeout(timeoutId)

      const raw = await response.text()
      let data: any = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        data = { error: raw?.slice(0, 200) || `HTTP ${response.status}` }
      }

      if (response.ok && data && typeof data.success === "boolean" && data.success === false) {
        return {
          success: false,
          error: data.error || data.message || "Pedido falhou",
          details: data.details || data,
        }
      }

      if (!response.ok) {
        const errorMessage = data.error || data.message || `HTTP ${response.status}`
        
        // Se for erro 401/403, não tentar novamente
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: errorMessage,
            details: data.details || data,
          }
        }

        // Se for último attempt, retornar erro
        if (attempt === retries) {
          return {
            success: false,
            error: errorMessage,
            details: data.details || data,
          }
        }

        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)))
        continue
      }

      const payload =
        data && typeof data === "object" && "data" in data ? data.data : data

      const result = {
        success: true,
        data: payload !== undefined ? payload : data,
      }

      // Guardar em cache se habilitado
      if (useCache && fetchOptions.method === 'GET') {
        cache.set(endpoint, {
          data: result.data,
          timestamp: Date.now(),
          ttl: cacheTTL,
        })
      }

      return result
    } catch (error: any) {
      lastError = error

      // Se for abort (timeout), não tentar novamente
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Timeout: A requisição demorou muito para responder',
        }
      }

      // Se for último attempt, retornar erro
      if (attempt === retries) {
        console.error(`❌ [ADMIN API] Erro em ${endpoint} (tentativa ${attempt + 1}/${retries + 1}):`, error)
        return {
          success: false,
          error: error.message || 'Erro desconhecido',
          details: error,
        }
      }

      // Aguardar antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)))
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Erro desconhecido após múltiplas tentativas',
    details: lastError,
  }
}

/**
 * Limpa o cache
 */
export function clearAdminCache(key?: string) {
  if (key) {
    cache.delete(key)
  } else {
    cache.clear()
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


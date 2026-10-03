/**
 * Sistema de cache para autenticação
 * Reduz chamadas desnecessárias ao Supabase
 */

interface CachedSession {
  session: any
  timestamp: number
}

const CACHE_DURATION = 300000 // 5 minutos em ms (balance entre performance e precisão)
const CACHE_KEY = 'mtm_auth_session'

/**
 * Verifica se existe uma sessão em cache válida
 */
export function getCachedSession(): any | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const { session, timestamp }: CachedSession = JSON.parse(cached)
    const now = Date.now()

    // Verificar se o cache ainda é válido
    if (now - timestamp < CACHE_DURATION) {
      console.log('⚡ [AUTH CACHE] Usando sessão em cache')
      return session
    }

    // Cache expirado
    console.log('⏰ [AUTH CACHE] Cache expirado')
    localStorage.removeItem(CACHE_KEY)
    return null
  } catch (error) {
    console.error('❌ [AUTH CACHE] Erro ao ler cache:', error)
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

/**
 * Armazena a sessão no cache
 */
export function setCachedSession(session: any): void {
  if (typeof window === 'undefined') return

  try {
    const cached: CachedSession = {
      session,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    console.log('💾 [AUTH CACHE] Sessão armazenada em cache')
  } catch (error) {
    console.error('❌ [AUTH CACHE] Erro ao salvar cache:', error)
  }
}

/**
 * Remove a sessão do cache
 */
export function clearCachedSession(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(CACHE_KEY)
    console.log('🗑️ [AUTH CACHE] Cache limpo')
  } catch (error) {
    console.error('❌ [AUTH CACHE] Erro ao limpar cache:', error)
  }
}

/**
 * Valida se uma sessão ainda está ativa
 */
export function isSessionValid(session: any): boolean {
  if (!session || !session.user) {
    console.log('⚠️ [AUTH CACHE] Sessão inválida: sem user')
    return false
  }

  // Verificar se o token expirou (com margem de segurança de 5 minutos)
  if (session.expires_at) {
    const expiresAt = new Date(session.expires_at).getTime()
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    
    // Considerar expirado se faltar menos de 5 minutos
    if (now >= (expiresAt - fiveMinutes)) {
      console.log('⏰ [AUTH CACHE] Token expirando em breve, renovando...')
      return false
    }
  }

  return true
}


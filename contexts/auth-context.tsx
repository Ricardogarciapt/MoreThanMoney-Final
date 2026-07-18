"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { isRegisteredMember } from "@/lib/member-access"
import { loadMemberProfile } from "@/lib/member-profile"
import { REGISTER_NOT_FOUND_MESSAGE } from "@/lib/oauth-flow"

export interface User {
  id: string
  email: string
  full_name?: string
  username?: string
  avatar_url?: string
  user_type?: string
  /** iq | skool | vip | standard — rotas IQONIC usam member_category === 'iq' */
  member_category?: string
  /** app_member = Pack Membro ($35) | premium = Pack Premium ($65) */
  subscription_plan?: "app_member" | "premium" | null
  is_active?: boolean
  created_at?: string
  phone?: string
  whatsapp?: string
  subscription_expires_at?: string | null
}

function isTrialUser(profile: Record<string, unknown>): boolean {
  return profile.user_type === "guest" || profile.user_type === "presentation"
}

function isTrialExpired(profile: Record<string, unknown>): boolean {
  if (profile.trial_expired === true) return true
  const expiresAt = profile.trial_expires_at
  if (typeof expiresAt !== "string" || !expiresAt) return false
  const ts = new Date(expiresAt).getTime()
  if (!Number.isFinite(ts)) return false
  return ts <= Date.now()
}

function profileToUser(
  profile: unknown,
  sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
): { user: User } | null {
  if (!profile || typeof profile !== "object") return null
  const p = profile as Record<string, unknown>
  const member_category =
    typeof p.member_category === "string" ? p.member_category : undefined
  return {
    user: {
      id: (p.id as string) ?? sessionUser.id,
      email: (p.email as string) ?? sessionUser.email ?? "",
      full_name: p.full_name as string | undefined,
      username: p.username as string | undefined,
      avatar_url:
        (p.avatar_url as string) || (sessionUser.user_metadata?.avatar_url as string | undefined),
      user_type: p.user_type as string | undefined,
      member_category,
      subscription_plan: (p.subscription_plan as "app_member" | "premium" | null) ?? null,
      is_active: p.is_active as boolean | undefined,
      created_at: p.created_at as string | undefined,
      phone: p.phone as string | undefined,
      whatsapp: p.whatsapp as string | undefined,
      subscription_expires_at: (p.subscription_expires_at as string | null) ?? null,
    },
  }
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
  /** Membro €35 (member_category="standard") — acesso exclusivo à app mobile */
  isAppOnlyUser: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string, userData: any) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,
  isAppOnlyUser: false,
  signInWithEmail: async () => ({ success: false }),
  signUp: async () => ({ success: false }),
  logout: async () => {},
  refreshUser: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const enforceTrialExpiry = async (profile: unknown) => {
    if (!profile || typeof profile !== "object") return profile
    const p = profile as Record<string, unknown>
    if (!isTrialUser(p) || !isTrialExpired(p)) return profile

    const patch = {
      is_active: false,
      trial_expired: true,
      updated_at: new Date().toISOString(),
    }

    if (p.is_active === false && p.trial_expired === true) {
      return { ...p, ...patch }
    }

    try {
      const { error } = await supabase.from("profiles").update(patch).eq("id", String(p.id || ""))
      if (error) {
        console.warn("⚠️ [AUTH CONTEXT] Não foi possível inativar trial expirado:", error.message)
      }
    } catch (e) {
      console.warn("⚠️ [AUTH CONTEXT] Falha ao inativar trial expirado:", e)
    }

    return { ...p, ...patch }
  }

  useEffect(() => {
    console.log('🔍 [AUTH CONTEXT] Inicializando...')
    let mounted = true
    
    const loadUser = async () => {
      try {
        // 1. Verificar cache Supabase primeiro (instantâneo)
        const { getCachedSession, isSessionValid, setCachedSession } = await import('@/lib/auth-cache')
        const cachedSession = getCachedSession()
        
        if (cachedSession && isSessionValid(cachedSession)) {
          console.log('⚡ [AUTH CONTEXT] Usando sessão em cache')
          // IMPORTANTE: aguardar (await) o perfil ANTES de sair — se usarmos .then()
          // e depois `return`, o `finally` faz setIsLoading(false) de imediato,
          // enquanto `user` ainda é null. O ProtectedPage vê (isLoading=false,
          // user=null) e reenvia para o login → spinner infinito. Com timeout para
          // nunca ficar pendurado (sob latência alta o perfil pode demorar).
          try {
            const profileQuery = supabase
              .from("profiles")
              .select("*")
              .eq("id", cachedSession.user.id)
              .maybeSingle()
            const { data: profile }: { data: any } = await Promise.race([
              profileQuery,
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000)),
            ])
            if (!mounted) return
            const p = profile ?? (await loadMemberProfile(supabase, cachedSession.user.id))
            if (p && isRegisteredMember(p)) {
              const normalized = await enforceTrialExpiry(p)
              const mapped = profileToUser(normalized, cachedSession.user)
              if (mapped) {
                setUser(mapped.user)
              }
            }
          } catch {
            // Timeout/erro — segue sem user (mostra login) em vez de spinner eterno.
          }
          // `finally` (fim do try externo) faz setIsLoading(false) — agora só DEPOIS
          // de `user` estar resolvido.
          return
        }
        
        // 3. Verificar sessão Supabase (com timeout)
        const sessionPromise = Promise.race([
          supabase.auth.getSession(),
          new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000)
          )
        ])
        
        try {
          const { data: { session }, error } = await sessionPromise
          
          if (!mounted) return
          
          if (error || !session?.user) {
            console.log('ℹ️ [AUTH CONTEXT] Nenhuma sessão ativa')
            setUser(null)
            setIsLoading(false)
            return
          }
          
          console.log('✅ [AUTH CONTEXT] Sessão Supabase encontrada:', session.user.email)
          
          // Sincronizar cache imediatamente
          setCachedSession(session)
          
          // Buscar perfil
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()
          
          if (!mounted) return
          
          if (profile && isRegisteredMember(profile)) {
            console.log('✅ [AUTH CONTEXT] Perfil carregado:', profile.email)
            const normalized = await enforceTrialExpiry(profile)
            const mapped = profileToUser(normalized, session.user)
            if (mapped) {
              setUser(mapped.user)
            }
          } else {
            console.log('ℹ️ [AUTH CONTEXT] Sessão sem perfil — aguarda registo/pagamento')
            setUser(null)
          }
        } catch (timeoutError) {
          if (!mounted) return
          console.warn('⚠️ [AUTH CONTEXT] Timeout ao buscar sessão, usando cache se disponível')
          // Tentar cache novamente
          const cachedSession = getCachedSession()
          if (cachedSession && isSessionValid(cachedSession)) {
            setIsLoading(false)
            // Perfil será carregado em background
          } else {
            setUser(null)
          }
        }
      } catch (error) {
        console.error('❌ [AUTH CONTEXT] Erro:', error)
        if (mounted) {
          setUser(null)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadUser()
    
    // Escutar mudanças de autenticação para sincronizar automaticamente
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      if (!mounted) return
      
      console.log('🔔 [AUTH CONTEXT] Auth evento:', event)
      
      if (event === 'SIGNED_IN' && session) {
        const { setCachedSession } = await import('@/lib/auth-cache')
        setCachedSession(session)
        
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle()
          .then(async ({ data: profile }: { data: any }) => {
            const p = profile ?? (await loadMemberProfile(supabase, session.user.id))
            if (p && isRegisteredMember(p) && mounted) {
              const normalized = await enforceTrialExpiry(p)
              const mapped = profileToUser(normalized, session.user)
              if (mapped) {
                setUser(mapped.user)
              }
            }
          })
          .catch(() => {})
      } else if (event === 'SIGNED_OUT') {
        const { clearCachedSession } = await import('@/lib/auth-cache')
        clearCachedSession()
        setUser(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Login com Email/Password
  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log('🔐 Tentando login com email:', email)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      console.log('🔍 Resposta do Supabase:', { data: !!data, error: !!error })

      if (error) {
        console.error('❌ Erro no login Supabase Auth:', error)
        console.error('❌ Mensagem de erro:', error.message)
        console.error('❌ Status:', error.status)
        
        // Mensagens mais amigáveis
        if (error.message.includes('Invalid login credentials')) {
          return { success: false, error: 'Email ou senha incorretos. Verifique seus dados e tente novamente.' }
        }
        if (error.message.includes('Email not confirmed')) {
          return { success: false, error: 'Email não confirmado. Verifique sua caixa de entrada.' }
        }
        
        return { success: false, error: error.message }
      }

      if (data.session && data.user) {
        const profile = await loadMemberProfile(supabase, data.user.id)

        if (!isRegisteredMember(profile)) {
          await supabase.auth.signOut()
          setUser(null)
          return { success: false, error: REGISTER_NOT_FOUND_MESSAGE }
        }

        const normalized = await enforceTrialExpiry(profile)
        const normalizedObj =
          normalized && typeof normalized === "object"
            ? (normalized as Record<string, unknown>)
            : null

        if (normalizedObj && isTrialUser(normalizedObj) && isTrialExpired(normalizedObj)) {
          await supabase.auth.signOut()
          setUser(null)
          return { success: false, error: 'O teu Free Trial expirou ao fim de 7 dias.' }
        }

        const mapped = profileToUser(normalized, data.user)
        if (mapped) {
          setUser(mapped.user)
        }

        return { success: true }
      }

      return { success: false, error: 'Erro ao processar login' }
    } catch (error: any) {
      console.error('❌ Exceção no login:', error)
      return { success: false, error: error.message || 'Erro inesperado ao fazer login' }
    }
  }

  // Registro
  const signUp = async (email: string, password: string, userData: any) => {
    try {
      console.log('📝 Iniciando registro:', email)
      console.log('📝 Dados do usuário:', userData)
      
      // Criar usuário no auth (com confirmação automática de email se configurado)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: userData.fullName,
            username: userData.username,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        console.error('❌ Erro no registro Supabase Auth:', error)
        console.error('❌ Mensagem:', error.message)
        
        // Mensagens mais amigáveis
        if (error.message.includes('already registered')) {
          return { success: false, error: 'Este email já está registrado. Tente fazer login.' }
        }
        if (error.message.includes('Password should be')) {
          return { success: false, error: 'A senha deve ter pelo menos 6 caracteres.' }
        }
        
        return { success: false, error: error.message }
      }

      if (data.user) {
        console.log('✅ Usuário criado no auth:', data.user.id)
        console.log('✅ Email:', data.user.email)
        console.log('✅ Confirmação necessária:', !data.user.confirmed_at)
        
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: data.user.id,
              email,
              full_name: userData.fullName,
              username: userData.username,
              phone: userData.phone || null,
              whatsapp: userData.whatsapp || null,
              user_type: 'member',
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )
          .select()
          .single()

        if (profileError) {
          console.error('❌ Erro ao guardar perfil:', profileError)
          return { success: false, error: profileError.message }
        }

        console.log('✅ Perfil sincronizado:', profile)
        
        // Verificar se precisa confirmar email
        if (data.session) {
          console.log('✅ Sessão criada automaticamente (email confirmado)')
          return { success: true, autoLogin: true }
        } else {
          console.log('⚠️ Confirmação de email necessária')
          return { success: true, autoLogin: false, message: 'Conta criada! Verifique seu email para confirmar.' }
        }
      }

      return { success: false, error: 'Erro ao criar usuário' }
    } catch (error: any) {
      console.error('❌ Exceção no registro:', error)
      return { success: false, error: error.message || 'Erro inesperado ao criar conta' }
    }
  }

  // Login com IQONIC

  // Logout
  const logout = async () => {
    try {
      console.log('🚪 Fazendo logout...')
      
      
      // Limpar sessão Supabase
      await supabase.auth.signOut()
      setUser(null)
      
      console.log('✅ Logout concluído')
    } catch (error) {
      console.error('❌ Erro ao fazer logout:', error)
    }
  }

  // Refresh user
  const refreshUser = async () => {
    try {
      console.log('🔄 RefreshUser chamado')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        console.log('✅ Sessão encontrada, buscando perfil...')
        let { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle()

        if (!profile) {
          profile = await loadMemberProfile(supabase, session.user.id)
        }

        if (profile) {
          console.log("✅ Perfil carregado:", profile.email)
          const normalized = await enforceTrialExpiry(profile)
          const mapped = profileToUser(normalized, session.user)
          if (mapped) {
            setUser(mapped.user)
          }
        }
      } else {
        console.log('❌ Nenhuma sessão encontrada')
        setUser(null)
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar usuário:', error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.user_type === "admin" && user?.is_active === true,
        isLoading,
        isAppOnlyUser:
          user?.member_category === "standard" && user?.user_type !== "admin",
        signInWithEmail,
        signUp,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


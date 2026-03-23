"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"

export interface User {
  id: string
  email: string
  full_name?: string
  username?: string
  avatar_url?: string
  user_type?: string
  is_active?: boolean
  created_at?: string
  phone?: string
  whatsapp?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
  isIqonicUser: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signInWithIqonic: (email: string, password: string, isEducator?: boolean) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string, userData: any) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,
  isIqonicUser: false,
  signInWithEmail: async () => ({ success: false }),
  signInWithIqonic: async () => ({ success: false }),
  signUp: async () => ({ success: false }),
  logout: async () => {},
  refreshUser: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isIqonicUser, setIsIqonicUser] = useState(false)

  // Criar perfil quando não existe
  const createProfile = async (authUser: any) => {
    try {
      const username = authUser.user_metadata?.name?.replace(/\s+/g, '').toLowerCase() 
        || authUser.email?.split('@')[0] 
        || `user${Date.now()}`

      const profileData = {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || 'Utilizador',
        username: username,
        avatar_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture,
        user_type: 'member',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert([profileData])
        .select()
        .single()

      if (error) {
        console.error('❌ Erro ao criar perfil:', error)
        return null
      }

      console.log('✅ Perfil criado:', data.email)
      return data
    } catch (error) {
      console.error('❌ Exceção ao criar perfil:', error)
      return null
    }
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
          setIsIqonicUser(false)
          // Buscar perfil em paralelo (não bloqueia)
          supabase
            .from('profiles')
            .select('*')
            .eq('id', cachedSession.user.id)
            .single()
            .then(({ data: profile }: { data: any }) => {
              if (!mounted) return
              if (profile) {
                setUser({
                  id: profile.id,
                  email: profile.email,
                  full_name: profile.full_name,
                  username: profile.username,
                  avatar_url: profile.avatar_url || cachedSession.user.user_metadata?.avatar_url,
                  user_type: profile.user_type,
                  is_active: profile.is_active,
                  created_at: profile.created_at,
                  phone: profile.phone,
                  whatsapp: profile.whatsapp
                })
              }
              setIsLoading(false)
            })
            .catch(() => {
              if (mounted) setIsLoading(false)
            })
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
            setIsIqonicUser(false)
            setIsLoading(false)
            return
          }
          
          console.log('✅ [AUTH CONTEXT] Sessão Supabase encontrada:', session.user.email)
          setIsIqonicUser(false)
          
          // Sincronizar cache imediatamente
          setCachedSession(session)
          
          // Buscar perfil
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          
          if (!mounted) return
          
          if (profile) {
            console.log('✅ [AUTH CONTEXT] Perfil carregado:', profile.email)
            setUser({
              id: profile.id,
              email: profile.email,
              full_name: profile.full_name,
              username: profile.username,
              avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url,
              user_type: profile.user_type,
              is_active: profile.is_active,
              created_at: profile.created_at,
              phone: profile.phone,
              whatsapp: profile.whatsapp
            })
          } else {
            console.log('📝 [AUTH CONTEXT] Criando perfil...')
            const newProfile = await createProfile(session.user)
            if (newProfile && mounted) {
              setUser({
                id: newProfile.id,
                email: newProfile.email,
                full_name: newProfile.full_name,
                username: newProfile.username,
                avatar_url: newProfile.avatar_url || session.user.user_metadata?.avatar_url,
                user_type: newProfile.user_type,
                is_active: newProfile.is_active,
                created_at: newProfile.created_at,
                phone: newProfile.phone,
                whatsapp: newProfile.whatsapp
              })
            }
          }
        } catch (timeoutError) {
          if (!mounted) return
          console.warn('⚠️ [AUTH CONTEXT] Timeout ao buscar sessão, usando cache se disponível')
          // Tentar cache novamente
          const cachedSession = getCachedSession()
          if (cachedSession && isSessionValid(cachedSession)) {
            setIsIqonicUser(false)
            setIsLoading(false)
            // Perfil será carregado em background
          } else {
            setUser(null)
            setIsIqonicUser(false)
          }
        }
      } catch (error) {
        console.error('❌ [AUTH CONTEXT] Erro:', error)
        if (mounted) {
          setUser(null)
          setIsIqonicUser(false)
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
        setIsIqonicUser(false)
        
        // Recarregar perfil em background (não bloqueia)
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile }: { data: any }) => {
            if (profile && mounted) {
              setUser({
                id: profile.id,
                email: profile.email,
                full_name: profile.full_name,
                username: profile.username,
                avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url,
                user_type: profile.user_type,
                is_active: profile.is_active,
                created_at: profile.created_at,
                phone: profile.phone,
                whatsapp: profile.whatsapp
              })
            }
          })
          .catch(() => {
            // Erro silencioso - não bloqueia o fluxo
          })
      } else if (event === 'SIGNED_OUT') {
        const { clearCachedSession } = await import('@/lib/auth-cache')
        clearCachedSession()
        setUser(null)
        setIsIqonicUser(false)
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
        console.log('✅ Sessão criada com sucesso!')
        console.log('✅ Usuário:', data.user.email)
        console.log('✅ ID:', data.user.id)
        
        // Buscar perfil
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (profileError) {
          console.error('❌ Erro ao buscar perfil:', profileError)
          
          // Se perfil não existe, criar automaticamente
          if (profileError.code === 'PGRST116') {
            console.log('📝 Perfil não encontrado, criando...')
            
            const username = data.user.user_metadata?.name?.replace(/\s+/g, '').toLowerCase() 
              || data.user.email?.split('@')[0] 
              || `user${Date.now()}`

            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert([{
                id: data.user.id,
                email: data.user.email,
                full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || 'Utilizador',
                username: username,
                avatar_url: data.user.user_metadata?.avatar_url,
                user_type: 'member',
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select()
              .single()

            if (createError) {
              console.error('❌ Erro ao criar perfil:', createError)
              return { success: false, error: 'Erro ao criar perfil. Contacte o suporte.' }
            }

            if (newProfile) {
              setUser({
                id: newProfile.id,
                email: newProfile.email,
                full_name: newProfile.full_name,
                username: newProfile.username,
                avatar_url: newProfile.avatar_url,
                user_type: newProfile.user_type,
                is_active: newProfile.is_active,
                created_at: newProfile.created_at,
                phone: newProfile.phone,
                whatsapp: newProfile.whatsapp
              })

              console.log('✅ Perfil criado e usuário definido')
              return { success: true }
            }
          }
          
          return { success: false, error: 'Perfil não encontrado' }
        }

        if (profile) {
          console.log('✅ Perfil carregado:', profile.email)
          
          setUser({
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            username: profile.username,
            avatar_url: profile.avatar_url,
            user_type: profile.user_type,
            is_active: profile.is_active,
            created_at: profile.created_at,
            phone: profile.phone,
            whatsapp: profile.whatsapp
          })

          return { success: true }
        }
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
        
        // Criar perfil
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .insert([{
            id: data.user.id,
            email: email,
            full_name: userData.fullName,
            username: userData.username,
            phone: userData.phone || null,
            whatsapp: userData.whatsapp || null,
            user_type: 'member',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single()

        if (profileError) {
          console.error('❌ Erro ao criar perfil:', profileError)
          console.error('❌ Código:', profileError.code)
          console.error('❌ Detalhes:', profileError.details)
          
          // Se for erro de duplicação, pode ser que já exista
          if (profileError.code === '23505') {
            return { success: false, error: 'Perfil já existe para este email ou username.' }
          }
          
          return { success: false, error: profileError.message }
        }

        console.log('✅ Perfil criado com sucesso:', profile)
        
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
  const signInWithIqonic = async (email: string, password: string, isEducator: boolean = false) => {
    console.warn("⚠️ [AUTH CONTEXT] Login IQONIC desativado")
    return { success: false, error: "Login IQONIC desativado." }
  }

  // Logout
  const logout = async () => {
    try {
      console.log('🚪 Fazendo logout...')
      
      setIsIqonicUser(false)
      
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        
        if (profile) {
          console.log('✅ Perfil carregado:', profile.email)
          setUser({
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            username: profile.username,
            avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url,
            user_type: profile.user_type,
            is_active: profile.is_active,
            created_at: profile.created_at,
            phone: profile.phone,
            whatsapp: profile.whatsapp
          })
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
        isAdmin: user?.user_type === "admin",
        isLoading,
        isIqonicUser,
        signInWithEmail,
        signInWithIqonic,
        signUp,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


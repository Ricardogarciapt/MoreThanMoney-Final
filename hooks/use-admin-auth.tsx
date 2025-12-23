"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const useAdminAuth = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('🔍 Verificando autenticação admin...')
        
        // Verificar sessão atual
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('❌ Erro ao verificar sessão:', sessionError)
          router.push("/admin-login")
          return
        }

        if (!session?.user) {
          console.log('❌ Nenhuma sessão encontrada')
          router.push("/admin-login")
          return
        }

        console.log('✅ Sessão encontrada, verificando permissões...')
        setIsAuthenticated(true)

        // Buscar dados do usuário na tabela users
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (userError) {
          console.error('❌ Erro ao buscar dados do usuário:', userError)
          router.push("/admin-login")
          return
        }

        console.log('📋 Dados do usuário:', userData)

        // Verificar se é admin
        const adminCheck = userData?.role === 'admin' || userData?.user_type === 'admin'
        const isActive = userData?.is_active === true

        console.log('🔑 Verificações admin:', { adminCheck, isActive, role: userData?.role, user_type: userData?.user_type })

        if (!adminCheck || !isActive) {
          console.log('❌ Usuário não é admin ou não está ativo')
          router.push("/")
          return
        }

        console.log('✅ Usuário é admin, permitindo acesso')
        setUser(userData)
        setIsAdmin(true)
        setIsChecking(false)
        
      } catch (error) {
        console.error('❌ Erro na verificação de autenticação:', error)
        router.push("/admin-login")
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Mudança de estado de autenticação:', event)
      
      if (event === 'SIGNED_OUT') {
        console.log('🚪 Usuário deslogado')
        setUser(null)
        setIsAuthenticated(false)
        setIsAdmin(false)
        router.push("/admin-login")
      } else if (event === 'SIGNED_IN' && session?.user) {
        console.log('✅ Usuário logado, verificando permissões...')
        // Recarregar verificação
        checkAuth()
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return {
    user,
    isAuthenticated,
    isAdmin,
    isLoading: isLoading || isChecking,
  }
} 
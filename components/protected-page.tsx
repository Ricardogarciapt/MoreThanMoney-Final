"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { getCachedSession, setCachedSession, isSessionValid, clearCachedSession } from "@/lib/auth-cache"
import { Loader2 } from "lucide-react"

interface ProtectedPageProps {
  children: React.ReactNode
  redirectPath?: string
  loadingMessage?: string
  requireAdmin?: boolean
  allowInactive?: boolean // Se TRUE, permite usuários inativos acessarem
}

export default function ProtectedPage({ 
  children, 
  redirectPath = "/login",
  loadingMessage = "A verificar acesso...",
  requireAdmin = false,
  allowInactive = false
}: ProtectedPageProps) {
  const router = useRouter()
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')

  useEffect(() => {
    let mounted = true
    let isChecking = false

    const checkAuth = async () => {
      if (isChecking) {
        console.log('⚠️ [PROTECTED PAGE] Verificação já em andamento, ignorando...')
        return
      }

      isChecking = true

      try {
        const startTime = performance.now()
        
        // 1. Tentar usar cache primeiro (verificação instantânea)
        const cachedSession = getCachedSession()
        if (cachedSession && isSessionValid(cachedSession)) {
          const endTime = performance.now()
          console.log(`⚡ [PROTECTED PAGE] Cache hit: ${Math.round(endTime - startTime)}ms`)
          
          if (mounted) {
            setAuthState('authenticated')
          }
          isChecking = false
          return
        }
        
        console.log('🔍 [PROTECTED PAGE] Verificando sessão no Supabase...')
        
        // 2. Verificar sessão diretamente (sem delays desnecessários)
        // Criar Promise com timeout para getSession
        const getSessionWithTimeout = async (timeoutMs: number) => {
          return Promise.race([
            supabase.auth.getSession(),
            new Promise<any>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), timeoutMs)
            )
          ])
        }
        
        // Tentar buscar sessão com timeout de 3 segundos (reduzido para resposta mais rápida)
        let sessionResult
        try {
          sessionResult = await getSessionWithTimeout(3000)
        } catch (timeoutError) {
          console.error('❌ [PROTECTED PAGE] Timeout ao buscar sessão (3s)')
          
          // Se há cache válido, usar mesmo com timeout
          const cachedSession = getCachedSession()
          if (cachedSession && isSessionValid(cachedSession)) {
            console.log('⚡ [PROTECTED PAGE] Usando cache após timeout')
            if (mounted) {
              setAuthState('authenticated')
            }
            isChecking = false
            return
          }
          
          // Redirecionar ao login se timeout e sem cache
          if (mounted) {
            setAuthState('unauthenticated')
            router.push(redirectPath)
          }
          isChecking = false
          return
        }
        
        const { data: { session }, error } = sessionResult
        
        const endTime = performance.now()
        const loadTime = Math.round(endTime - startTime)
        
        console.log(`⏱️ [PROTECTED PAGE] Tempo de verificação: ${loadTime}ms`)
        
        if (loadTime > 1000) {
          console.warn(`⚠️ [PROTECTED PAGE] Verificação muito lenta: ${loadTime}ms`)
          console.warn('⚠️ Verifique configuração do Supabase e variáveis de ambiente')
        }

        if (!mounted) {
          isChecking = false
          return
        }

        if (error) {
          console.error('❌ [PROTECTED PAGE] Erro do Supabase:', error)
          clearCachedSession()
          setAuthState('unauthenticated')
          router.push(redirectPath)
          isChecking = false
          return
        }

        if (!session) {
          console.log('❌ [PROTECTED PAGE] Sem sessão válida')
          clearCachedSession()
          setAuthState('unauthenticated')
          router.push(redirectPath)
          isChecking = false
          return
        }

        // 3. Verificar user_type se necessário (apenas admin)
        if (requireAdmin) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_type, is_active')
            .eq('id', session.user.id)
            .single()

          if (profile) {
            console.log(`👤 [PROTECTED PAGE] User type: ${profile.user_type}`)

            // Bloquear se requer admin e não é admin
            if (requireAdmin && profile.user_type !== 'admin') {
              console.warn('⚠️ [PROTECTED PAGE] Acesso negado - não é admin')
              if (mounted) {
                setAuthState('unauthenticated')
                router.push('/member-area')
              }
              isChecking = false
              return
            }
          }
        }

        // 3. Armazenar sessão válida em cache imediatamente
        setCachedSession(session)
        console.log('✅ [PROTECTED PAGE] Autenticado:', session.user.email)
        if (mounted) {
          setAuthState('authenticated')
        }
        isChecking = false
      } catch (error) {
        console.error('❌ [PROTECTED PAGE] Exceção:', error)
        if (mounted) {
          clearCachedSession()
          setAuthState('unauthenticated')
          router.push(redirectPath)
        }
        isChecking = false
      }
    }

    checkAuth()

    return () => {
      mounted = false
      isChecking = false
    }
  }, [redirectPath, router]) // Removido authState das dependências para evitar loop

  // Mostrar loading apenas se estiver verificando
  if (authState === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-300">{loadingMessage}</p>
        </div>
      </div>
    )
  }

  // Se não autenticado, não mostra nada (já redirecionou)
  if (authState === 'unauthenticated') {
    return null
  }

  // Se autenticado, mostra o conteúdo imediatamente
  return <>{children}</>
}

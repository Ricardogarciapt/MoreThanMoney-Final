"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { loadIqonicSession } from "@/lib/iqonic-auth"
import { Loader2 } from "lucide-react"

interface IqonicProtectedPageProps {
  children: React.ReactNode
  redirectPath?: string
  loadingMessage?: string
  allowedRoutes?: string[]
}

/**
 * Componente de proteção de rotas para utilizadores IQONIC
 * Permite acesso apenas a rotas específicas: app-mobile, scanner-access, portfolios
 */
export default function IqonicProtectedPage({
  children,
  redirectPath = "/login",
  loadingMessage = "A verificar acesso IQONIC...",
  allowedRoutes = ["/app-mobile", "/scanner-access", "/portfolios"],
}: IqonicProtectedPageProps) {
  const router = useRouter()
  const { user, isIqonicUser, isLoading } = useAuth()
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')

  useEffect(() => {
    let mounted = true

    const checkIqonicAuth = async () => {
      try {
        // Verificar sessão IQONIC
        const iqonicSession = loadIqonicSession()
        
        if (!iqonicSession || !iqonicSession.user) {
          console.log('❌ [IQONIC PROTECTED] Sem sessão IQONIC')
          if (mounted) {
            setAuthState('unauthenticated')
            router.push(redirectPath)
          }
          return
        }

        // Verificar se o utilizador está autenticado no contexto
        if (!user || !isIqonicUser) {
          console.log('⚠️ [IQONIC PROTECTED] Aguardando carregamento do utilizador...')
          // Aguardar um pouco para o contexto carregar
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          if (!user || !isIqonicUser) {
            console.log('❌ [IQONIC PROTECTED] Utilizador não autenticado como IQONIC')
            if (mounted) {
              setAuthState('unauthenticated')
              router.push(redirectPath)
            }
            return
          }
        }

        // Verificar se a rota atual está permitida
        const currentPath = window.location.pathname
        const isRouteAllowed = allowedRoutes.some(route => currentPath.startsWith(route))
        
        if (!isRouteAllowed) {
          console.log(`⚠️ [IQONIC PROTECTED] Rota ${currentPath} não permitida para utilizadores IQONIC`)
          // Redirecionar para a primeira rota permitida
          router.push(allowedRoutes[0])
          return
        }

        console.log('✅ [IQONIC PROTECTED] Acesso autorizado:', currentPath)
        if (mounted) {
          setAuthState('authenticated')
        }
      } catch (error) {
        console.error('❌ [IQONIC PROTECTED] Erro:', error)
        if (mounted) {
          setAuthState('unauthenticated')
          router.push(redirectPath)
        }
      }
    }

    if (!isLoading) {
      checkIqonicAuth()
    }
  }, [user, isIqonicUser, isLoading, router, redirectPath, allowedRoutes])

  // Mostrar loading enquanto verifica
  if (authState === 'checking' || isLoading) {
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

  // Se autenticado, mostra o conteúdo
  return <>{children}</>
}


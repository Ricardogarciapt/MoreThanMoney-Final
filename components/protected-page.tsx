"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
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
  const { user, isIqonicUser, isLoading } = useAuth()
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')
  
  // Rotas permitidas para utilizadores IQONIC
  const iqonicAllowedRoutes = ['/app-mobile', '/scanner-access', '/portfolios']

  useEffect(() => {
    // Verificação imediata: se já temos user válido, autorizar instantaneamente
    if (user && !isLoading) {
      const currentPath = window.location.pathname
      
      // Verificar se é utilizador IQONIC e se a rota está permitida
      if (isIqonicUser) {
        const isRouteAllowed = iqonicAllowedRoutes.some(route => currentPath.startsWith(route))
        
        if (!isRouteAllowed) {
          console.log(`⚠️ [PROTECTED PAGE] Rota ${currentPath} não permitida para utilizadores IQONIC`)
          router.push(iqonicAllowedRoutes[0])
          setAuthState('unauthenticated')
          return
        }
      }

      // Verificar se requer admin
      if (requireAdmin && user.user_type !== 'admin') {
        console.warn('⚠️ [PROTECTED PAGE] Acesso negado - não é admin')
        router.push('/member-area')
        setAuthState('unauthenticated')
        return
      }

      // Verificar se utilizador está ativo (se não permitir inativos)
      if (!allowInactive && !user.is_active) {
        console.warn('⚠️ [PROTECTED PAGE] Utilizador inativo')
        router.push(redirectPath)
        setAuthState('unauthenticated')
        return
      }

      // Tudo OK - autorizar imediatamente
      console.log('✅ [PROTECTED PAGE] Acesso autorizado imediatamente:', user.email)
      setAuthState('authenticated')
      return
    }

    // Se ainda está carregando, aguardar
    if (isLoading) {
      return
    }

    // Se não há user e não está carregando, não autenticado
    if (!user) {
      console.log('❌ [PROTECTED PAGE] Utilizador não autenticado')
      setAuthState('unauthenticated')
      router.push(redirectPath)
      return
    }
  }, [user, isIqonicUser, isLoading, requireAdmin, allowInactive, redirectPath, router])

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

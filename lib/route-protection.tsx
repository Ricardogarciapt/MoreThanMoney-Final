"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { canAccessRoute, getAccessDeniedMessage, UserProfile } from "@/lib/role-redirect"
import { ensureMemberProfile } from "@/lib/member-profile"

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: string
  allowedRoles?: string[]
}

export function ProtectedRoute({ 
  children, 
  requiredRole, 
  allowedRoles 
}: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        setIsLoading(true)

        // Verificar sessão
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          console.log('❌ [ROUTE PROTECTION] Sem sessão')
          router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
          return
        }

        let { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (profileError && profileError.code !== 'PGRST116') {
          console.warn('⚠️ [ROUTE PROTECTION] Perfil:', profileError.message)
        }

        if (!profileData) {
          profileData = await ensureMemberProfile(supabase, session)
        }

        if (!profileData) {
          console.error('❌ [ROUTE PROTECTION] Sem perfil após sincronizar')
          router.push('/member-area')
          return
        }

        setProfile(profileData)

        // Verificar acesso usando canAccessRoute
        const canAccess = canAccessRoute(profileData, pathname)
        setHasAccess(canAccess)

        if (!canAccess) {
          const message = getAccessDeniedMessage(profileData, pathname)
          console.log('❌ [ROUTE PROTECTION] Acesso negado:', message)
          
          // Redirecionar baseado no tipo de utilizador
          if (profileData.user_type === 'skool' || 
              (profileData.user_type === 'guest' && !profileData.trial_expired)) {
            router.push('/app-mobile?message=' + encodeURIComponent(message))
          } else if (profileData.user_type === 'presentation') {
            router.push('/new-landing?message=' + encodeURIComponent(message))
          } else {
            router.push('/app-mobile?message=' + encodeURIComponent(message))
          }
          return
        }

        console.log('✅ [ROUTE PROTECTION] Acesso permitido')
      } catch (error) {
        console.error('❌ [ROUTE PROTECTION] Erro:', error)
        router.push('/login')
      } finally {
        setIsLoading(false)
      }
    }

    checkAccess()
  }, [pathname, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#D2A63C] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">A verificar permissões...</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return null // Redirecionamento já foi feito
  }

  return <>{children}</>
}


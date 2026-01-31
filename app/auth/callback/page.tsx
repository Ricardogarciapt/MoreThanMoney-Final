"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { determinePostLoginRedirect } from "@/lib/role-redirect"
import { Loader2, CheckCircle, XCircle } from "lucide-react"

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("A processar autenticação...")

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus("loading")
        setMessage("A processar autenticação...")

        console.log('🔍 [CALLBACK] Iniciado')
        console.log('🔍 [CALLBACK] URL completa:', window.location.href)
        console.log('🔍 [CALLBACK] Hash:', window.location.hash)
        console.log('🔍 [CALLBACK] Search:', window.location.search)

        const redirectParam = searchParams.get('redirect')
        
        // Função para garantir perfil
        const ensureProfile = async (session: any) => {
          try {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()

            if (profileError && profileError.code !== 'PGRST116') {
              console.error('❌ [CALLBACK] Erro ao buscar perfil:', profileError)
            }

            if (!profile) {
              console.log('📝 [CALLBACK] Criando perfil...')
              
              let autoApprove = true // Default
              try {
                const settingsResponse = await fetch('/api/admin/settings')
                if (settingsResponse.ok) {
                  const settingsData = await settingsResponse.json()
                  autoApprove = settingsData?.data?.auto_approve_users ?? true
                }
              } catch (settingsError) {
                console.warn('⚠️ [CALLBACK] Erro ao buscar settings, usando padrão:', settingsError)
                // autoApprove já é true por padrão
              }
              const username = session.user.user_metadata?.name?.replace(/\s+/g, '').toLowerCase() 
                || session.user.email?.split('@')[0] 
                || `user${Date.now()}`

              const { error: insertError } = await supabase.from('profiles').insert([{
                id: session.user.id,
                email: session.user.email,
                full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Utilizador',
                username: username,
                avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
                user_type: autoApprove ? 'member' : 'pending',
                member_category: 'standard',
                is_active: autoApprove,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              
              if (insertError) {
                console.error('❌ [CALLBACK] Erro ao criar perfil:', insertError)
              } else {
                console.log('✅ [CALLBACK] Perfil criado')
              }
            } else {
              console.log('✅ [CALLBACK] Perfil já existe')
            }
          } catch (profileError) {
            console.error('❌ [CALLBACK] Erro crítico ao garantir perfil:', profileError)
            // Não bloquear o fluxo se criar perfil falhar
          }
        }

        // Verificar código OAuth primeiro (PKCE Flow - padrão do Supabase)
        const code = searchParams.get('code')
        const errorParam = searchParams.get('error')
        const errorDescription = searchParams.get('error_description')

        // Se há erro na URL, mostrar mensagem
        if (errorParam) {
          console.error('❌ [CALLBACK] Erro OAuth:', errorParam, errorDescription)
          throw new Error(errorDescription || errorParam || 'Erro na autenticação OAuth')
        }

        if (code) {
          console.log('✅ [CALLBACK] Código OAuth encontrado')
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          
          if (error) {
            console.error('❌ [CALLBACK] Erro ao trocar código:', error)
            throw new Error(error.message || 'Erro ao processar código de autenticação')
          }

          if (data?.session) {
            console.log('✅ [CALLBACK] Sessão criada:', data.session.user.email)
            
            // Sincronizar cache imediatamente
            const { setCachedSession } = await import('@/lib/auth-cache')
            setCachedSession(data.session)
            
            // Garantir perfil em background (não bloqueia)
            ensureProfile(data.session).catch(() => {})
            
            // Buscar perfil com timeout muito curto (500ms)
            const profilePromise = supabase
              .from('profiles')
              .select('*')
              .eq('id', data.session.user.id)
              .single()
            
            const profileResult = await Promise.race([
              profilePromise,
              new Promise<any>((resolve) => setTimeout(() => resolve({ data: null }), 500))
            ])
            
            const profile = profileResult.data || null
            
            // Redirecionar imediatamente - não esperar por status
            const redirectTo = determinePostLoginRedirect(profile, redirectParam)
            const fullRedirectUrl = redirectTo.startsWith('http') ? redirectTo : `${window.location.origin}${redirectTo}`
            
            console.log('🔄 [CALLBACK] Redirecionando para:', fullRedirectUrl)
            window.location.replace(fullRedirectUrl)
            return
          } else {
            throw new Error("Sessão não foi criada após trocar código")
          }
        }

        // Verificar hash (Implicit Flow - menos comum)
        const hash = window.location.hash
        if (hash && hash.includes('access_token')) {
          console.log('✅ [CALLBACK] Implicit Flow detectado')
          
          // Delay mínimo
          await new Promise(resolve => setTimeout(resolve, 50))
          
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError) {
            throw sessionError
          }
          
          if (session) {
            console.log('✅ [CALLBACK] Sessão do hash:', session.user.email)
            
            // Sincronizar cache
            const { setCachedSession } = await import('@/lib/auth-cache')
            setCachedSession(session)
            
            // Garantir perfil em background
            ensureProfile(session).catch(() => {})
            
            // Buscar perfil com timeout curto
            const profilePromise = supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            
            const profileResult = await Promise.race([
              profilePromise,
              new Promise<any>((resolve) => setTimeout(() => resolve({ data: null }), 500))
            ])
            
            const profile = profileResult.data || null
            
            const redirectTo = determinePostLoginRedirect(profile, redirectParam)
            const fullRedirectUrl = redirectTo.startsWith('http') ? redirectTo : `${window.location.origin}${redirectTo}`
            
            window.location.replace(fullRedirectUrl)
            return
          }
        }

        // Se não tem código nem hash, verificar sessão existente
        console.log('🔄 [CALLBACK] Verificando sessão existente...')
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('❌ [CALLBACK] Erro ao verificar sessão:', sessionError)
        }
        
        if (session) {
          console.log('✅ [CALLBACK] Sessão encontrada:', session.user.email)
          
          // Sincronizar cache
          const { setCachedSession } = await import('@/lib/auth-cache')
          setCachedSession(session)
          
          // Garantir perfil em background
          ensureProfile(session).catch(() => {})
          
          // Buscar perfil com timeout curto
          const profilePromise = supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          
          const profileResult = await Promise.race([
            profilePromise,
            new Promise<any>((resolve) => setTimeout(() => resolve({ data: null }), 500))
          ])
          
          const profile = profileResult.data || null
          
          const redirectTo = determinePostLoginRedirect(profile, redirectParam)
          const fullRedirectUrl = redirectTo.startsWith('http') ? redirectTo : `${window.location.origin}${redirectTo}`
          
          window.location.replace(fullRedirectUrl)
          return
        }

        // Se chegou aqui, não há sessão nem código
        console.error('❌ [CALLBACK] Nenhuma sessão encontrada após processar')
        console.error('❌ [CALLBACK] Estado da URL:', {
          hash: window.location.hash,
          search: window.location.search,
          pathname: window.location.pathname
        })
        
        throw new Error("Nenhuma sessão encontrada. Verifique se o login foi bem-sucedido.")

      } catch (error: any) {
        console.error('❌ [CALLBACK] Erro:', error)
        setStatus("error")
        setMessage(error.message || "Erro ao processar autenticação")
        
        // Redirecionar mais rápido em caso de erro
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      }
    }

    handleCallback()
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center max-w-md mx-auto p-8">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-[#D2A63C] animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">A processar...</h2>
            <p className="text-gray-400">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Sucesso!</h2>
            <p className="text-gray-400">{message}</p>
            <p className="text-sm text-gray-500 mt-4">A redirecionar...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Erro</h2>
            <p className="text-gray-400 mb-4">{message}</p>
            <p className="text-sm text-gray-500">A redirecionar para login...</p>
          </>
        )}
      </div>
    </div>
  )
}

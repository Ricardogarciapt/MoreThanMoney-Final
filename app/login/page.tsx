'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Loader2, AlertCircle, Eye, EyeOff, Mail, Lock } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const isAdminLogin = searchParams.get('admin') === 'true'
  const redirectTo = searchParams.get('redirect') || '/new-landing'

  // Verificar se já está logado
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        console.log('✅ Já está logado, aguardando sincronização de cookies...')
        
        // Aguardar um pouco para garantir que cookies foram sincronizados
        // Especialmente importante para páginas protegidas como /fast-start
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Não redirecionar para a própria página de login (evitar loop)
        if (redirectTo !== '/login') {
          console.log(`🔄 Redirecionando para: ${redirectTo}`)
          window.location.href = redirectTo
        } else {
          window.location.href = '/new-landing'
        }
      }
    }
    checkSession()
  }, [redirectTo])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      console.log('🔐 [EMAIL LOGIN] Iniciando...')
      console.log('📧 Email:', email)
      
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) {
        console.error('❌ Erro no login:', loginError)
        
        if (loginError.message.includes('Invalid login credentials')) {
          setError('Email ou senha incorretos')
        } else if (loginError.message.includes('Email not confirmed')) {
          setError('Email não confirmado. Verifique sua caixa de entrada.')
        } else {
          setError(loginError.message)
        }
        setIsLoading(false)
        return
      }

      if (data.session) {
        console.log('✅ Login bem-sucedido:', data.user.email)
        console.log('🔄 Redirecionando para:', redirectTo)
        
        // Redirecionar com reload completo para garantir AuthContext atualização
        window.location.href = redirectTo
      }
    } catch (error: any) {
      console.error('❌ Exceção no login:', error)
      setError('Erro ao fazer login. Tente novamente.')
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError('')

    try {
      console.log('🔍 [GOOGLE LOGIN] Iniciando OAuth...')
      console.log('🌐 [GOOGLE LOGIN] Origin:', window.location.origin)
      console.log('🌐 [GOOGLE LOGIN] Hostname:', window.location.hostname)
      
      // Determinar o redirect correto baseado no ambiente
      // IMPORTANTE: O redirectTo é para onde o Supabase nos envia APÓS processar o OAuth
      // O Supabase sempre redireciona para: https://www.morethanmoney.pt/auth/callback
      const isProduction = window.location.hostname.includes('morethanmoney.pt') || 
                           window.location.hostname.includes('vercel.app')
      
      // Em produção, sempre usar www.morethanmoney.pt
      // O Supabase precisa redirecionar para um domínio autorizado
      const baseUrl = isProduction 
        ? `https://www.morethanmoney.pt`
        : 'http://localhost:3000'
      
      const callbackUrl = `${baseUrl}/auth/callback`
      const fullRedirectUrl = redirectTo ? `${callbackUrl}?redirect=${encodeURIComponent(redirectTo)}` : callbackUrl
      
      console.log('📍 [GOOGLE LOGIN] Ambiente:', isProduction ? 'PRODUÇÃO' : 'LOCAL')
      console.log('📍 [GOOGLE LOGIN] Base URL:', baseUrl)
      console.log('📍 [GOOGLE LOGIN] Callback URL:', fullRedirectUrl)
      console.log('📍 [GOOGLE LOGIN] Redirect destino:', redirectTo)
      console.log('📍 [GOOGLE LOGIN] Supabase processará via:', 'https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback')
      
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: fullRedirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
          skipBrowserRedirect: false,
        },
      })

      if (oauthError) {
        console.error('❌ [GOOGLE LOGIN] Erro OAuth:', oauthError)
        setError(`Erro ao iniciar Google Login: ${oauthError.message}`)
        setIsLoading(false)
        return
      }

      if (data?.url) {
        console.log('✅ [GOOGLE LOGIN] URL gerada com sucesso')
        console.log('🔄 [GOOGLE LOGIN] Redirecionando para autenticação Google...')
        
        // Redirecionar para Google
        window.location.href = data.url
      } else {
        console.error('❌ [GOOGLE LOGIN] Nenhuma URL OAuth retornada')
        console.error('📊 [GOOGLE LOGIN] Data recebida:', data)
        setError('Erro ao gerar URL do Google. Verifique a configuração no Supabase.')
        setIsLoading(false)
      }
    } catch (error: any) {
      console.error('❌ [GOOGLE LOGIN] Exceção crítica:', error)
      console.error('📊 [GOOGLE LOGIN] Stack:', error.stack)
      setError('Erro ao iniciar login com Google. Tente novamente.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${
            isAdminLogin 
              ? 'bg-gradient-to-r from-red-500 to-red-700' 
              : 'bg-gradient-to-r from-[#D2A63C] to-[#BB8525]'
          }`}>
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            {isAdminLogin ? 'Acesso Administrador' : 'Bem-vindo de Volta'}
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {isAdminLogin 
              ? 'Apenas administradores autorizados podem aceder'
              : 'Entre com sua conta para aceder'
            }
          </p>
          {isAdminLogin && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm font-medium">
                🔒 Área Restrita - Requer Autorização
              </p>
            </div>
          )}
        </div>

        {/* Card de Login */}
        <Card className="bg-gray-900/50 border-[#D2A63C]/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[#D2A63C]">Entrar na Conta</CardTitle>
            <CardDescription className="text-gray-400">
              Aceda à sua conta MoreThanMoney
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4 bg-red-500/20 border-red-500/50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}

            {/* Email/Password Login */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-gray-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-300">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 pr-10 bg-gray-800 border-gray-700 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-semibold"
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    A processar...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-400">Ou continuar com</span>
              </div>
            </div>

            {/* Google Login */}
            <Button
              type="button"
              className="w-full bg-white hover:bg-gray-100 text-gray-900"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  A processar...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </>
              )}
            </Button>

            {/* Registro Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-400">
                Não tens uma conta?{' '}
                <Link href="/register" className="text-[#D2A63C] hover:underline font-semibold">
                  Regista-te aqui
                </Link>
              </p>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                Ao iniciar sessão, aceitas os nossos{' '}
                <Link href="/terms" className="text-[#D2A63C] hover:underline">
                  Termos de Serviço
                </Link>
                {' '}e{' '}
                <Link href="/privacy-policy" className="text-[#D2A63C] hover:underline">
                  Política de Privacidade
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Voltar */}
        <div className="text-center">
          <Link href="/new-landing" className="text-sm text-gray-400 hover:text-[#D2A63C]">
            ← Voltar à página inicial
          </Link>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { determinePostLoginRedirect } from '@/lib/role-redirect'
import { ensureMemberProfile } from '@/lib/member-profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Loader2, AlertCircle, Eye, EyeOff, Mail, Lock, Tag } from 'lucide-react'
import Link from 'next/link'

export default function AppMobileLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [showCoupon, setShowCoupon] = useState(false)
  const [iqonicEmail, setIqonicEmail] = useState('')
  const [iqonicPassword, setIqonicPassword] = useState('')
  const [iqonicLoading, setIqonicLoading] = useState(false)
  const [iqonicError, setIqonicError] = useState('')

  // Native app always redirects to /app-mobile after login
  const redirectParam = '/app-mobile'

  // Verificar se já está logado
  useEffect(() => {
    const checkSession = async () => {
      const { getCachedSession, isSessionValid } = await import('@/lib/auth-cache')
      const cachedSession = getCachedSession()

      if (cachedSession && isSessionValid(cachedSession)) {
        window.location.replace(`${window.location.origin}/app-mobile`)
        return
      }

      try {
        const sessionPromise = Promise.race([
          supabase.auth.getSession(),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500))
        ])
        const { data: { session } } = await sessionPromise
        if (session) {
          const { setCachedSession } = await import('@/lib/auth-cache')
          setCachedSession(session)
          window.location.replace(`${window.location.origin}/app-mobile`)
        }
      } catch {
        // Sem sessão — mostrar login
      }
    }
    checkSession()
  }, [])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    if (couponCode.trim()) {
      const code = couponCode.trim().toUpperCase()
      sessionStorage.setItem('mtm_coupon', code)
      if (typeof window !== 'undefined' && (window as any).MTMNative?.postMessage) {
        ;(window as any).MTMNative.postMessage({ action: 'setCoupon', code })
      }
    }

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })

      if (loginError) {
        if (loginError.message.includes('Invalid login credentials')) {
          setError('Email ou palavra-passe incorretos')
        } else if (loginError.message.includes('Email not confirmed')) {
          setError('Email não confirmado. Verifica a tua caixa de entrada.')
        } else {
          setError(loginError.message)
        }
        setIsLoading(false)
        return
      }

      if (data.session) {
        const { setCachedSession } = await import('@/lib/auth-cache')
        setCachedSession(data.session)
        await ensureMemberProfile(supabase, data.session)
        window.location.replace(`${window.location.origin}/app-mobile`)
      }
    } catch {
      setError('Erro ao fazer login. Tenta novamente.')
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    if (couponCode.trim()) {
      const code = couponCode.trim().toUpperCase()
      sessionStorage.setItem('mtm_coupon', code)
      if (typeof window !== 'undefined' && (window as any).MTMNative?.postMessage) {
        ;(window as any).MTMNative.postMessage({ action: 'setCoupon', code })
      }
    }
    try {
      const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/app-mobile')}`
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
          skipBrowserRedirect: false,
        },
      })
      if (oauthError) { setError(`Erro ao iniciar Google Login: ${oauthError.message}`); return }
      if (data?.url) window.location.href = data.url
      else setError('Erro ao gerar URL do Google. Verifica a configuração no Supabase.')
    } catch {
      setError('Erro ao iniciar login com Google. Tenta novamente.')
    }
  }

  const handleIqonicLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIqonicLoading(true)
    setIqonicError('')
    try {
      const res = await fetch('/api/auth/iqonic-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: iqonicEmail, password: iqonicPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao autenticar com IQONIC')
      if (!data.session?.access_token) throw new Error('Sessão inválida. Tenta novamente.')

      const { data: authData, error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (setErr) throw new Error(setErr.message)

      const { setCachedSession } = await import('@/lib/auth-cache')
      if (authData.session) setCachedSession(authData.session)

      await ensureMemberProfile(supabase, authData.session)
      window.location.replace(`${window.location.origin}/app-mobile`)
    } catch (err: unknown) {
      setIqonicError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIqonicLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center bg-gradient-to-r from-[#D2A63C] to-[#BB8525]">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-white">Bem-vindo de Volta</h2>
          <p className="mt-2 text-sm text-gray-400">Entra na tua conta para aceder à app</p>
        </div>

        {/* Card de Login */}
        <Card className="bg-gray-900/50 border-[#D2A63C]/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[#D2A63C]">Entrar na Conta</CardTitle>
            <CardDescription className="text-gray-400">
              Acede à tua conta MoreThanMoney
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
                <label htmlFor="email" className="text-sm font-medium text-gray-300">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="teu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-300">Palavra-passe</label>
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
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
                ) : 'Entrar'}
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
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
              ) : (
                <>
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </>
              )}
            </Button>

            {/* IQONIC Login */}
            <div className="mt-3">
              <div className="relative flex justify-center text-sm">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <span className="px-2 bg-gray-900 text-gray-400">Ou entrar com IQONIC</span>
              </div>
              <form onSubmit={handleIqonicLogin} className="space-y-2 mt-3">
                {iqonicError && (
                  <Alert variant="destructive" className="mb-2 bg-red-500/20 border-red-500/50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-red-200">{iqonicError}</AlertDescription>
                  </Alert>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input id="iqonic-email" type="email" placeholder="Email IQONIC"
                    value={iqonicEmail} onChange={(e) => setIqonicEmail(e.target.value)}
                    className="pl-10 bg-gray-800/50 border-gray-600 text-white placeholder:text-gray-500" required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input id="iqonic-password" type="password" placeholder="Password IQONIC"
                    value={iqonicPassword} onChange={(e) => setIqonicPassword(e.target.value)}
                    className="pl-10 bg-gray-800/50 border-gray-600 text-white placeholder:text-gray-500" required />
                </div>
                <Button type="submit" className="w-full bg-[#D2A63C] hover:bg-[#B8922F] text-black font-semibold"
                  disabled={iqonicLoading} size="lg">
                  {iqonicLoading ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A autenticar...</>
                  ) : (
                    <><Shield className="mr-2 h-5 w-5" />Login com IQONIC</>
                  )}
                </Button>
              </form>
            </div>

            {/* Registro Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-400">
                Não tens uma conta?{' '}
                <Link href="/app-mobile/register" className="text-[#D2A63C] hover:underline font-semibold">
                  Regista-te aqui
                </Link>
              </p>
            </div>

            {/* Coupon Section */}
            <div className="mt-3 text-center">
              {!showCoupon ? (
                <button
                  type="button"
                  onClick={() => setShowCoupon(true)}
                  className="text-xs text-gray-500 hover:text-[#D2A63C] transition-colors"
                >
                  Tens um cupão de desconto?
                </button>
              ) : (
                <div className="mt-2">
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#D2A63C]" />
                    <Input
                      type="text"
                      placeholder="Código de cupão"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="pl-9 bg-gray-800 border-gray-700 text-white text-sm uppercase tracking-wider"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">O desconto será aplicado no registo</p>
                </div>
              )}
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                Ao iniciar sessão, aceitas os nossos{' '}
                <Link href="/terms" className="text-[#D2A63C] hover:underline">Termos de Serviço</Link>
                {' '}e{' '}
                <Link href="/privacy-policy" className="text-[#D2A63C] hover:underline">Política de Privacidade</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

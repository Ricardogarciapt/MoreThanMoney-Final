'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock, Loader2, AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const recovered = searchParams.get('recovered') === '1'
      if (recovered) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!cancelled) {
          if (session) {
            setReady(true)
          } else {
            setError('Sessão de recuperação inválida. Pede um novo link em /forgot-password.')
          }
          setChecking(false)
        }
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          if (!cancelled) {
            setError('Link inválido ou expirado. Pede um novo em /forgot-password.')
            setChecking(false)
          }
          return
        }
      }

      const hash = window.location.hash
      if (hash?.includes('access_token')) {
        await new Promise((r) => setTimeout(r, 150))
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (!cancelled) {
        if (session) {
          setReady(true)
        } else {
          setError('Sessão de recuperação inválida. Pede um novo link em /forgot-password.')
        }
        setChecking(false)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
        setChecking(false)
        setError('')
      }
    })

    init()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A password deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As passwords não coincidem.')
      return
    }

    setIsLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setSuccess(true)
      setTimeout(() => {
        window.location.replace('/login')
      }, 2500)
    } catch {
      setError('Erro ao actualizar password. Tenta novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-10 w-10 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4">
      <div className="max-w-md w-full">
        <Card className="bg-gray-900/50 border-[#D2A63C]/30">
          <CardHeader>
            <CardTitle className="text-[#D2A63C]">Nova password</CardTitle>
            <CardDescription className="text-gray-400">
              Define a tua nova password e confirma-a abaixo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <Alert className="bg-green-500/10 border-green-500/40">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  Password actualizada com sucesso. A redirecionar para o login...
                </AlertDescription>
              </Alert>
            ) : !ready ? (
              <div className="space-y-4">
                <Alert variant="destructive" className="bg-red-500/20 border-red-500/50">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-red-200">{error}</AlertDescription>
                </Alert>
                <Link href="/forgot-password" className="text-sm text-[#D2A63C] hover:underline">
                  Pedir novo link de recuperação
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="bg-red-500/20 border-red-500/50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-red-200">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm text-gray-300">
                    Nova password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={isLoading}
                      className="pl-10 pr-10 bg-gray-800 border-gray-700 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm" className="text-sm text-gray-300">
                    Confirmar nova password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={isLoading}
                      className="pl-10 bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      A guardar...
                    </>
                  ) : (
                    'Guardar nova password'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

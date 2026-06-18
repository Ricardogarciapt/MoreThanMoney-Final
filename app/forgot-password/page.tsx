'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, Loader2, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const siteBase = (
        process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') ||
        window.location.origin
      )
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${siteBase}/auth/reset-callback`,
      })

      if (resetError) {
        setError(resetError.message)
        return
      }

      setSent(true)
    } catch {
      setError('Erro ao enviar email. Tenta novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Recuperar password</h1>
          <p className="mt-2 text-sm text-gray-400">
            Enviaremos um link para o teu email com instruções para definir uma nova password.
          </p>
        </div>

        <Card className="bg-gray-900/50 border-[#D2A63C]/30">
          <CardHeader>
            <CardTitle className="text-[#D2A63C]">Esqueci-me da password</CardTitle>
            <CardDescription className="text-gray-400">
              Introduz o email associado à tua conta MTM
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <Alert className="bg-green-500/10 border-green-500/40">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  Se existir uma conta com <strong>{email}</strong>, receberás um email com o link de
                  recuperação em breve. Verifica também a pasta de spam.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="bg-red-500/20 border-red-500/50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-red-200">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm text-gray-300">
                    Email
                  </label>
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

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      A enviar...
                    </>
                  ) : (
                    'Enviar link de recuperação'
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-sm text-[#D2A63C] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

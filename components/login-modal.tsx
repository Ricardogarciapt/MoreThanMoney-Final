"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { Loader2, GraduationCap, ChevronRight } from "lucide-react"

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [isIqonicLogin, setIsIqonicLogin] = useState(false)
  const [isEducator, setIsEducator] = useState(false)
  const router = useRouter()
  const { signInWithIqonic } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // Se for login IQONIC
      if (isIqonicLogin) {
        // Mostrar feedback imediato
        const result = await signInWithIqonic(email, password, isEducator)
        
        if (!result.success) {
          setError(result.error || "Erro ao fazer login IQONIC")
          setIsLoading(false)
          return
        }
        
        // Redirecionar imediatamente (sem delay)
        const allowedRoutes = ['/app-mobile', '/scanner-access', '/portfolios']
        onClose()
        // Usar replace para evitar histórico desnecessário
        window.location.replace(allowedRoutes[0])
        return
      }

      // Login normal Supabase
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) {
        setError(loginError.message || "Email ou senha inválidos.")
        setIsLoading(false)
        return
      }

      if (data.session) {
        // Sincronizar cache imediatamente
        const { setCachedSession } = await import('@/lib/auth-cache')
        setCachedSession(data.session)
        
        onClose()
        // Usar replace para ser mais rápido
        window.location.replace("/member-area")
      }
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao fazer login. Tente novamente.")
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError("")
    // Não definir isLoading - vamos redirecionar imediatamente

    try {
      const isProduction = window.location.hostname.includes('morethanmoney.pt') || 
                           window.location.hostname.includes('vercel.app')
      const baseUrl = isProduction 
        ? `https://www.morethanmoney.pt`
        : 'http://localhost:3000'
      const callbackUrl = `${baseUrl}/auth/callback`

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      })

      if (oauthError) {
        setError(`Erro ao iniciar Google Login: ${oauthError.message}`)
        return
      }

      if (data?.url) {
        window.location.href = data.url
      } else {
        setError('Erro ao gerar URL do Google.')
      }
    } catch (error: any) {
      setError('Erro ao iniciar login com Google.')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>Acesse sua conta para continuar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="text-sm text-right">
              <Link href="/register" className="text-gold-400 hover:text-gold-500">
                Esqueceu a senha?
              </Link>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A processar...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </DialogFooter>
        </form>
        
        {/* Toggle IQONIC Login */}
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant={!isIqonicLogin ? "default" : "outline"}
            className={`flex-1 ${!isIqonicLogin ? 'bg-[#D2A63C] text-black' : 'border-gray-700 text-gray-300'}`}
            onClick={() => {
              setIsIqonicLogin(false)
              setError('')
            }}
            disabled={isLoading}
            size="sm"
          >
            Login Normal
          </Button>
          <Button
            type="button"
            variant={isIqonicLogin ? "default" : "outline"}
            className={`flex-1 ${isIqonicLogin ? 'bg-[#D2A63C] text-black' : 'border-gray-700 text-gray-300'}`}
            onClick={() => {
              setIsIqonicLogin(true)
              setError('')
            }}
            disabled={isLoading}
            size="sm"
          >
            <GraduationCap className="w-4 h-4 mr-1" />
            IQONIC.VIP
          </Button>
        </div>

        {/* IQONIC User Type Toggle */}
        {isIqonicLogin && (
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant={!isEducator ? "default" : "outline"}
              className={`flex-1 ${!isEducator ? 'bg-[#D2A63C] text-black' : 'border-gray-700 text-gray-300'}`}
              onClick={() => setIsEducator(false)}
              disabled={isLoading}
              size="sm"
            >
              Estudante
            </Button>
            <Button
              type="button"
              variant={isEducator ? "default" : "outline"}
              className={`flex-1 ${isEducator ? 'bg-[#D2A63C] text-black' : 'border-gray-700 text-gray-300'}`}
              onClick={() => setIsEducator(true)}
              disabled={isLoading}
              size="sm"
            >
              Educador
            </Button>
          </div>
        )}

        {/* Google Login */}
        {!isIqonicLogin && (
          <div className="mt-4">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-400">Ou</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full bg-white hover:bg-gray-100 text-gray-900"
              onClick={handleGoogleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A processar...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </>
              )}
            </Button>
          </div>
        )}
        
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">Não tem uma conta?</span>{" "}
          <Link href="/register" className="text-[#D2A63C] hover:text-[#BB8525]" onClick={onClose}>
            Registre-se
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}

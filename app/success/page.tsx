"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, ArrowRight, Home, Loader2, AlertCircle, Lock, Mail } from "lucide-react"

// ─── Estado possível da criação de conta pós-pagamento ────────────────────────
type RegState = 'idle' | 'creating' | 'done' | 'already_exists' | 'error' | 'missing_data'

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const message    = searchParams.get('message')
  const sessionId  = searchParams.get('session_id')
  const plan       = searchParams.get('plan')
  const regToken   = searchParams.get('reg_token')
  const isNewUser  = searchParams.get('new_user') === '1'
  const isOAuthReg = searchParams.get('oauth') === '1'

  const [regState, setRegState] = useState<RegState>('idle')
  const [regEmail, setRegEmail] = useState<string>('')
  const [regError, setRegError] = useState<string>('')

  // ── Criar conta após pagamento (fluxo register → Stripe → /success) ────────
  useEffect(() => {
    if (!isNewUser || !sessionId) return

    const run = async () => {
      setRegState('creating')

      try {
        if (isOAuthReg) {
          const res = await fetch('/api/auth/complete-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, oauth: true, plan: plan || 'app_member' }),
          })
          const result = await res.json()

          if (!res.ok) {
            setRegError(result.error || 'Erro ao criar conta')
            setRegState('error')
            return
          }

          setRegState(result.alreadyExists ? 'already_exists' : 'done')
          return
        }

        if (!regToken) {
          setRegState('missing_data')
          return
        }

        const raw = localStorage.getItem(`mtm_pending_reg_${regToken}`)
        if (!raw) {
          setRegState('missing_data')
          return
        }

        const regData = JSON.parse(raw)
        setRegEmail(regData.email || '')

        const res = await fetch('/api/auth/complete-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            email:     regData.email,
            password:  regData.password,
            full_name: regData.full_name,
            username:  regData.username,
            phone:     regData.phone || '',
            whatsapp:  regData.whatsapp || '',
            plan:      regData.plan || plan || 'app_member',
            billing:   regData.billing || 'monthly',
            sponsor_username: regData.sponsor_username || '',
          }),
        })

        const result = await res.json()

        if (!res.ok) {
          setRegError(result.error || 'Erro ao criar conta')
          setRegState('error')
          return
        }

        localStorage.removeItem(`mtm_pending_reg_${regToken}`)
        setRegState(result.alreadyExists ? 'already_exists' : 'done')
      } catch (err: any) {
        setRegError(err.message || 'Erro inesperado')
        setRegState('error')
      }
    }

    run()
  }, [isNewUser, sessionId, regToken, plan, isOAuthReg])

  // ─── Fluxo: registo novo ──────────────────────────────────────────────────
  if (isNewUser) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-4">

          {/* A criar conta... */}
          {regState === 'creating' && (
            <Card className="border border-amber-500/30 bg-gray-900/50">
              <CardContent className="pt-8 pb-8 text-center space-y-4">
                <Loader2 className="w-16 h-16 text-amber-400 animate-spin mx-auto" />
                <h2 className="text-2xl font-bold text-white">A criar a tua conta…</h2>
                <p className="text-gray-400">Pagamento confirmado! Estamos a configurar o teu acesso.</p>
              </CardContent>
            </Card>
          )}

          {/* Conta criada com sucesso */}
          {(regState === 'done' || regState === 'already_exists') && (
            <Card className="border-2 border-green-500/40 bg-gray-900/60">
              <CardHeader className="text-center pb-2">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-3" />
                <CardTitle className="text-3xl text-green-400">
                  {regState === 'already_exists' ? 'Bem-vindo de volta!' : '🎉 Bem-vindo à MTM!'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 space-y-3">
                  <p className="text-green-300 font-semibold text-center">
                    {regState === 'done'
                      ? '✅ Conta criada e ativada com sucesso!'
                      : '✅ Pagamento confirmado!'}
                  </p>

                  {regEmail && (
                    <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg p-3">
                      <Mail className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Email de acesso</p>
                        <p className="text-white font-mono font-semibold">{regEmail}</p>
                      </div>
                    </div>
                  )}

                  {!isOAuthReg && (
                    <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg p-3">
                      <Lock className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Palavra-passe</p>
                        <p className="text-white text-sm">A palavra-passe que escolheste no registo</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center pt-1">
                    📧 Vais receber um email de confirmação em breve.
                  </p>
                </div>

                <Button
                  onClick={() => router.push(isOAuthReg ? '/app-mobile' : '/login')}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-lg py-6"
                >
                  <ArrowRight className="w-5 h-5 mr-2" />
                  {isOAuthReg ? 'Entrar na App MTM' : 'Fazer Login Agora'}
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => router.push('/new-landing')}
                  className="w-full text-gray-400 hover:text-white"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Ir para a Página Inicial
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Dados não encontrados (browser diferente) */}
          {regState === 'missing_data' && (
            <Card className="border border-amber-500/40 bg-gray-900/60">
              <CardHeader className="text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <CardTitle className="text-2xl text-white">Pagamento confirmado! ✅</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
                  <p className="text-amber-300 font-semibold mb-2">⚠️ Ação necessária</p>
                  <p className="text-gray-300 text-sm">
                    O teu pagamento foi processado com sucesso, mas não encontrámos os dados do registo
                    (possivelmente abriste este link num browser diferente).
                  </p>
                  <p className="text-gray-300 text-sm mt-3">
                    Por favor envia o código abaixo para <strong className="text-amber-400">suporte@morethanmoney.pt</strong>
                    {' '}e criamos a tua conta manualmente:
                  </p>
                  <div className="mt-3 bg-gray-800 rounded-lg p-3 font-mono text-xs text-amber-400 break-all">
                    {sessionId}
                  </div>
                </div>

                <Button
                  onClick={() => router.push('/new-landing')}
                  className="w-full"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Ir para a Página Inicial
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Erro ao criar conta */}
          {regState === 'error' && (
            <Card className="border border-red-500/40 bg-gray-900/60">
              <CardHeader className="text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <CardTitle className="text-2xl text-red-400">Erro ao criar conta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <p className="text-red-300 text-sm">{regError}</p>
                  <p className="text-gray-400 text-xs mt-2">
                    O teu pagamento foi processado. Guarda o ID da sessão e contacta-nos:
                  </p>
                  <div className="mt-2 bg-gray-800 rounded p-2 font-mono text-xs text-amber-400 break-all">
                    {sessionId}
                  </div>
                </div>
                <Button variant="outline" onClick={() => router.push('/new-landing')} className="w-full">
                  <Home className="w-4 h-4 mr-2" />
                  Ir para a Página Inicial
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    )
  }

  // ─── Fluxo genérico (compras de scanner, etc.) ────────────────────────────
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card className="card-clean border-2 border-green-500/30">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-20 h-20 text-green-500" />
            </div>
            <CardTitle className="text-4xl text-green-400">
              ✅ Sucesso!
            </CardTitle>
            <p className="text-gray-300 mt-4 text-lg">
              {message || "Operação realizada com sucesso!"}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-green-400 mb-2">
                🎉 Operação Concluída!
              </h3>
              <p className="text-gray-300">
                A tua ação foi processada com sucesso. Podes continuar a usar a plataforma normalmente.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => window.location.href = '/new-landing'}
                className="btn-primary flex-1"
              >
                <Home className="w-4 h-4 mr-2" />
                Ir para Início
              </Button>

              <Button
                onClick={() => window.location.href = '/login'}
                variant="outline"
                className="flex-1"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Fazer Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

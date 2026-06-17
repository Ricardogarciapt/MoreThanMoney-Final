'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CreditCard, GraduationCap, Building2, Upload, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

type Channel = 'stripe' | 'skool' | 'iqonic' | null
type Step = 'intro' | 'channel' | 'stripe' | 'skool' | 'iqonic' | 'done' | 'iqonic_sent'

interface StatusResponse {
  required: boolean
  iqonic_pending: boolean
  migration: {
    app_activation_coupon_code?: string | null
    access_migration_completed_at?: string | null
  }
  copy: {
    title: string
    intro: string
    annualNote: string
    couponNote: string
    iqonicProof: string
    iqonicPending: string
  }
}

export default function AccessMigrationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const success = searchParams.get('success') === '1'
  const successPlan = searchParams.get('plan')

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [step, setStep] = useState<Step>('intro')
  const [channel, setChannel] = useState<Channel>(null)
  const [error, setError] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [iqonicId, setIqonicId] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    const token = await getToken()
    if (!token) {
      router.replace('/login?redirect=/access-migration')
      return
    }

    const res = await fetch('/api/access-migration/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Erro ao carregar estado')
      setLoading(false)
      return
    }
    setStatus(data)

    if (success || data.migration?.access_migration_completed_at) {
      setStep('done')
    } else if (data.iqonic_pending) {
      setStep('iqonic_sent')
    } else if (!data.required) {
      router.replace('/app-mobile')
      return
    }
    setLoading(false)
  }, [getToken, router, success])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const selectChannel = async (ch: Channel) => {
    if (!ch) return
    setChannel(ch)
    setError('')
    const token = await getToken()
    if (!token) return

    const res = await fetch('/api/access-migration/channel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: ch }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Erro')
      return
    }
    if (ch === 'stripe') setStep('stripe')
    else if (ch === 'skool') setStep('skool')
    else setStep('iqonic')
  }

  const startCheckout = async (planId: string) => {
    setCheckoutLoading(planId)
    setError('')
    const token = await getToken()
    if (!token) return

    const res = await fetch('/api/access-migration/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planId }),
    })
    const data = await res.json()
    setCheckoutLoading(null)
    if (!res.ok || !data.url) {
      setError(data.error || 'Erro ao iniciar pagamento')
      return
    }
    window.location.href = data.url
  }

  const submitIqonic = async () => {
    if (!iqonicId.trim() || !proofFile) {
      setError('Preenche o ID IQONIC e carrega o print da subscrição activa.')
      return
    }
    setSubmitting(true)
    setError('')
    const token = await getToken()
    if (!token) return

    const form = new FormData()
    form.append('iqonic_member_id', iqonicId.trim())
    form.append('proof', proofFile)

    const res = await fetch('/api/access-migration/iqonic', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error || 'Erro ao enviar')
      return
    }

    await supabase.auth.signOut()
    setStep('iqonic_sent')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  const copy = status?.copy

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <p className="text-[#D2A63C] text-sm font-medium tracking-wide">MoreThanMoney</p>
          <h1 className="text-2xl font-bold">{copy?.title ?? 'Actualização de acesso'}</h1>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'intro' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardDescription className="text-zinc-300 text-base leading-relaxed">
                {copy?.intro}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full bg-[#D2A63C] hover:bg-[#c49530] text-black font-semibold"
                onClick={() => setStep('channel')}
              >
                Continuar — escolher forma de pagamento
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'channel' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Como fazes a tua subscrição?</CardTitle>
              <CardDescription>Escolhe o meio que usas para aceder à MoreThanMoney</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4 border-zinc-700"
                onClick={() => void selectChannel('stripe')}
              >
                <CreditCard className="w-5 h-5 text-[#D2A63C]" />
                <div className="text-left">
                  <div className="font-medium">Stripe — cartão / web</div>
                  <div className="text-xs text-zinc-400">Pack Membro ou Premium</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4 border-zinc-700"
                onClick={() => void selectChannel('skool')}
              >
                <GraduationCap className="w-5 h-5 text-purple-400" />
                <div className="text-left">
                  <div className="font-medium">Skool — comunidade</div>
                  <div className="text-xs text-zinc-400">Sincronização com a tua conta Skool</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4 border-zinc-700"
                onClick={() => void selectChannel('iqonic')}
              >
                <Building2 className="w-5 h-5 text-blue-400" />
                <div className="text-left">
                  <div className="font-medium">IQONIC</div>
                  <div className="text-xs text-zinc-400">Validação manual com print</div>
                </div>
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'stripe' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardTitle>Escolhe o teu pack</CardTitle>
              <CardDescription className="text-zinc-300">{copy?.annualNote}</CardDescription>
              <p className="text-sm text-emerald-400/90 pt-2">{copy?.couponNote}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { id: 'app_member_monthly', label: 'Pack Membro — Mensal', price: '€35/mês' },
                { id: 'app_member_annual', label: 'Pack Membro — Anual (-20%)', price: '€336/ano' },
                { id: 'premium_monthly', label: 'Pack Premium — Mensal', price: '€65/mês' },
                { id: 'premium_annual', label: 'Pack Premium — Anual (-20%)', price: '€624/ano' },
              ].map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  className="w-full justify-between border-zinc-700"
                  disabled={checkoutLoading !== null}
                  onClick={() => void startCheckout(p.id)}
                >
                  <span>{p.label}</span>
                  <span className="text-[#D2A63C]">{checkoutLoading === p.id ? '...' : p.price}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {step === 'skool' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardTitle>Membro Skool</CardTitle>
              <CardDescription className="text-zinc-300 leading-relaxed">
                A tua subscrição será sincronizada com a comunidade Skool MoreThanMoney. Garante que
                usas o mesmo email na Skool. O acesso activa-se automaticamente quando a tua
                subscrição Skool estiver activa — ou um administrador confirma manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-400">
                Se já és membro activo na Skool, o acesso será restaurado em breve. Caso contrário,
                junta-te em{' '}
                <a
                  href="https://skool.com/morethanmoney-1132"
                  className="text-[#D2A63C] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  skool.com/morethanmoney
                </a>
              </p>
              <Button asChild className="w-full bg-[#D2A63C] text-black">
                <Link href="https://skool.com/morethanmoney-1132" target="_blank">
                  Ir para a Skool
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'iqonic' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardTitle>Validação IQONIC</CardTitle>
              <CardDescription className="text-zinc-300 leading-relaxed">
                {copy?.iqonicProof}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="iqonic-id">ID IQONIC</Label>
                <Input
                  id="iqonic-id"
                  value={iqonicId}
                  onChange={(e) => setIqonicId(e.target.value)}
                  placeholder="O teu identificador IQONIC"
                  className="bg-zinc-950 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Print subscrição activa</Label>
                <label className="flex flex-col items-center justify-center border border-dashed border-zinc-600 rounded-lg p-6 cursor-pointer hover:border-[#D2A63C] transition-colors">
                  <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                  <span className="text-sm text-zinc-400">
                    {proofFile ? proofFile.name : 'Carregar imagem (JPG, PNG)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <Button
                className="w-full bg-[#D2A63C] text-black font-semibold"
                disabled={submitting}
                onClick={() => void submitIqonic()}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar para validação'}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'iqonic_sent' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardContent className="pt-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-amber-400 mx-auto" />
              <p className="text-zinc-200">{copy?.iqonicPending}</p>
              <Button variant="outline" asChild>
                <Link href="/login">Voltar ao login</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'done' && (
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardContent className="pt-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-lg font-medium">Subscrição activa!</p>
              {status?.migration?.app_activation_coupon_code && (
                <div className="bg-zinc-950 border border-[#D2A63C]/40 rounded-lg p-4">
                  <p className="text-sm text-zinc-400 mb-1">Código activação app (sem segunda cobrança)</p>
                  <p className="text-xl font-mono text-[#D2A63C]">
                    {status.migration.app_activation_coupon_code}
                  </p>
                </div>
              )}
              {successPlan && (
                <p className="text-sm text-zinc-400">Plano: {successPlan.replace(/_/g, ' ')}</p>
              )}
              <Button
                className="w-full bg-[#D2A63C] text-black"
                onClick={() => router.push('/app-mobile')}
              >
                Entrar na app
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

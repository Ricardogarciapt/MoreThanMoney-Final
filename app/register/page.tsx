'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Eye, EyeOff, Smartphone, Globe, Check, Loader2, CheckCircle2, XCircle, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { buildOAuthCallbackUrl, OAUTH_PENDING_REG_KEY } from '@/lib/oauth-flow'

type PlanId = 'app_member_monthly' | 'app_member_annual' | 'premium_monthly' | 'premium_annual'
type BillingCycle = 'monthly' | 'annual'

const PLANS = {
  app_member: {
    name: 'Pack Membro',
    description: 'App mobile · Ferramentas de Trading · Live Sessions',
    features: ['App MTM System (iOS/Android)', 'Ferramentas de trading exclusivas', 'Live Sessions MTM', 'Suporte por email'],
    color: '#D2A63C',
    monthly: { price: 35, label: '35€/mês', id: 'app_member_monthly' as PlanId },
    annual:  { price: 28, label: '28€/mês · 336€/ano', id: 'app_member_annual' as PlanId },
  },
  premium: {
    name: 'Pack Premium',
    description: 'App + Site MTM · Skool · Ferramentas avançadas · Live Premium · Cursos',
    features: ['Tudo do Pack Membro', 'Acesso completo ao site MTM', 'Comunidade Skool MTM', 'Ferramentas avançadas', 'Live Sessions Premium', 'Cursos de Forex, Criptomoedas, Marketing Digital e AI', 'Suporte prioritário'],
    color: '#7C3AED',
    monthly: { price: 65, label: '65€/mês', id: 'premium_monthly' as PlanId },
    annual:  { price: 52, label: '52€/mês · 624€/ano', id: 'premium_annual' as PlanId },
  },
}

export default function RegisterPage() {
  const [mode, setMode] = useState<'trial' | 'paid'>('trial')
  const [selectedPlan, setSelectedPlan] = useState<'app_member' | 'premium'>('app_member')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    whatsapp: '',
    sponsorUsername: '',
    couponCode: '',
  })
  const [sponsorStatus, setSponsorStatus] = useState<{ valid: boolean; name?: string } | null>(null)
  const [validatingSponsor, setValidatingSponsor] = useState(false)
  const [couponStatus, setCouponStatus] = useState<{ valid: boolean; message: string; type?: string; discount_pct?: number; free_months?: number } | null>(null)
  const [validatingCoupon, setValidatingCoupon] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const infoMessage = searchParams.get('message')

  const activePlan = PLANS[selectedPlan]
  const activePricing = billingCycle === 'annual' ? activePlan.annual : activePlan.monthly

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const validateSponsor = async (username: string) => {
    if (!username.trim()) { setSponsorStatus(null); return }
    setValidatingSponsor(true)
    try {
      const res = await fetch(`/api/mlm/validate-sponsor?username=${encodeURIComponent(username.trim())}`)
      const data = await res.json()
      setSponsorStatus(data)
    } catch {
      setSponsorStatus({ valid: false })
    } finally {
      setValidatingSponsor(false)
    }
  }

  const validateCoupon = async (code: string) => {
    if (!code.trim()) { setCouponStatus(null); return }
    setValidatingCoupon(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      setCouponStatus(data)
    } catch {
      setCouponStatus({ valid: false, message: 'Erro ao validar cupão' })
    } finally {
      setValidatingCoupon(false)
    }
  }

  // ── Registo com FREE TRIAL de 3 dias (sem cartão) ──────────────────────────
  const handleTrialSubmit = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/register-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          username: formData.username,
          phone: formData.phone || '',
          whatsapp: formData.whatsapp || '',
          sponsorUsername: formData.sponsorUsername || '',
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data?.code === 'ACCOUNT_EXISTS') {
          setError('Já tens conta com este email. Inicia sessão para continuares.')
        } else {
          setError(data?.error || 'Não foi possível iniciar o teu trial. Tenta novamente.')
        }
        setIsLoading(false)
        return
      }

      // Login imediato (a conta já existe e está confirmada)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })
      if (signInError) {
        // Conta criada, mas login falhou → mandar para o login
        router.push('/app-mobile/login?message=' + encodeURIComponent('Conta criada! Inicia sessão para começares o teu trial.'))
        return
      }

      // Trial ativo → entrar na app
      window.location.href = '/app-mobile'
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado. Tenta novamente.')
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.full_name.trim()) { setError('Nome completo é obrigatório'); return }
    if (!formData.email.trim()) { setError('Email é obrigatório'); return }
    if (!formData.username.trim()) { setError('Nome de utilizador é obrigatório'); return }
    if (formData.password.length < 6) { setError('A palavra-passe deve ter pelo menos 6 carateres'); return }
    if (formData.password !== formData.confirmPassword) { setError('As palavras-passe não coincidem'); return }

    // FREE TRIAL 3 dias (sem cartão) — cria conta e entra logo na app.
    if (mode === 'trial') {
      await handleTrialSubmit()
      return
    }

    setIsLoading(true)

    try {
      // ── FLUXO: Pagamento Stripe PRIMEIRO, conta criada DEPOIS ──────────────
      // 1. Gerar token único para esta sessão de registo
      const regToken = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

      // 2. Guardar dados do formulário no localStorage (mesmo browser)
      //    A página /success irá recuperar estes dados para criar a conta.
      localStorage.setItem(`mtm_pending_reg_${regToken}`, JSON.stringify({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        username: formData.username,
        phone: formData.phone || '',
        whatsapp: formData.whatsapp || '',
        sponsor_username: formData.sponsorUsername || '',
        coupon_code: formData.couponCode || '',
        plan: selectedPlan,
        billing: billingCycle,
        created_at: Date.now(),
      }))

      // 3. Criar sessão Stripe (não requer conta Supabase)
      const planId = `${selectedPlan}_${billingCycle}` // ex: app_member_monthly
      const checkoutRes = await fetch('/api/stripe/register-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          email: formData.email,
          fullName: formData.full_name,
          username: formData.username,
          phone: formData.phone || '',
          regToken,
          sponsorUsername: formData.sponsorUsername || '',
          couponCode: formData.couponCode || '',
        }),
      })

      if (!checkoutRes.ok) {
        const err = await checkoutRes.json().catch(() => ({}))
        // Plano ainda não configurado no Stripe — informar utilizador
        if (err.error?.includes('não encontrado') || err.error?.includes('não configurado')) {
          setError('Este plano ainda não está disponível para pagamento online. Por favor contacta-nos em suporte@morethanmoney.pt')
        } else {
          setError(err.error || 'Erro ao iniciar checkout. Tenta novamente.')
        }
        localStorage.removeItem(`mtm_pending_reg_${regToken}`)
        setIsLoading(false)
        return
      }

      const { url } = await checkoutRes.json()
      if (!url) {
        setError('Não foi possível redirecionar para pagamento. Tenta novamente.')
        localStorage.removeItem(`mtm_pending_reg_${regToken}`)
        setIsLoading(false)
        return
      }

      // 4. Redirecionar para Stripe → após pagamento o cliente é enviado para /success
      window.location.href = url

    } catch (err: any) {
      setError(err.message || 'Erro inesperado. Tenta novamente.')
      setIsLoading(false)
    }
  }

  const handleGoogleRegister = async () => {
    setIsLoading(true)
    setError('')
    try {
      sessionStorage.setItem(
        OAUTH_PENDING_REG_KEY,
        JSON.stringify({
          plan: selectedPlan,
          billing: billingCycle,
          sponsor_username: formData.sponsorUsername || '',
          created_at: Date.now(),
        })
      )

      const redirectTo = buildOAuthCallbackUrl(window.location.origin, {
        flow: 'register',
        redirect: '/app-mobile',
      })

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      })
      if (oauthError) { setError(oauthError.message); setIsLoading(false); return }
      if (data?.url) window.location.href = data.url
      else { setError('Erro ao gerar URL do Google'); setIsLoading(false) }
    } catch (error: any) {
      setError('Erro ao iniciar registo com Google')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-6">

        {/* Back button */}
        <div className="flex items-center">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-[#D2A63C] text-sm font-medium active:opacity-60 transition-opacity"
          >
            <ChevronLeft className="w-5 h-5" />
            Voltar
          </button>
        </div>

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#D2A63C] mb-4">
            <span className="text-black font-black text-2xl">M</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Criar Conta MTM</h1>
          <p className="text-gray-400 mt-2">
            {mode === 'trial' ? 'Experimenta o Premium 3 dias grátis — sem cartão' : 'Escolhe o teu plano e começa hoje'}
          </p>
        </div>

        {/* Modo: Free Trial vs Subscrever já */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl bg-gray-900 p-1 border border-gray-800">
            <button
              type="button"
              onClick={() => setMode('trial')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'trial' ? 'bg-[#D2A63C] text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              🎁 Grátis 3 dias
            </button>
            <button
              type="button"
              onClick={() => setMode('paid')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'paid' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Subscrever já
            </button>
          </div>
        </div>

        {/* Cartão de benefícios do trial */}
        {mode === 'trial' && (
          <div className="rounded-2xl border-2 border-[#D2A63C]/50 bg-[#D2A63C]/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-[#D2A63C]" />
              <span className="font-bold text-white">3 dias de Premium — grátis, sem cartão</span>
            </div>
            <ul className="space-y-1.5">
              {['Acesso completo à app MTM System', 'Ferramentas de trading + Scanner', 'Live Sessions e comunidade', 'Alertas e sinais em tempo real', 'Sem cartão · cancela quando quiseres'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-gray-200">
                  <Check className="w-3.5 h-3.5 shrink-0 text-[#D2A63C]" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400 mt-3">Ao fim dos 3 dias, continuas Premium por apenas 34,99€ no 1º mês. Sem compromisso.</p>
          </div>
        )}

        {/* Billing Toggle */}
        {mode === 'paid' && (<>
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl bg-gray-900 p-1 border border-gray-800">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billingCycle === 'monthly' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billingCycle === 'annual' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Anual
              <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">-20%</span>
            </button>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          {(['app_member', 'premium'] as const).map((planKey) => {
            const plan = PLANS[planKey]
            const pricing = billingCycle === 'annual' ? plan.annual : plan.monthly
            const isSelected = selectedPlan === planKey
            return (
              <button
                key={planKey}
                onClick={() => setSelectedPlan(planKey)}
                className={`text-left p-5 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? `border-[${plan.color}] bg-[${plan.color}]/10`
                    : 'border-gray-800 bg-gray-900/40 hover:border-gray-600'
                }`}
                style={isSelected ? { borderColor: plan.color, backgroundColor: `${plan.color}18` } : {}}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {planKey === 'app_member' ? (
                        <Smartphone className="w-4 h-4" style={{ color: plan.color }} />
                      ) : (
                        <Globe className="w-4 h-4" style={{ color: plan.color }} />
                      )}
                      <span className="font-bold text-white">{plan.name}</span>
                    </div>
                    <div className="text-2xl font-black mt-1" style={{ color: plan.color }}>
                      {pricing.label}
                    </div>
                  </div>
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1"
                    style={{ borderColor: isSelected ? plan.color : '#4B5563' }}
                  >
                    {isSelected && (
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: plan.color }} />
                    )}
                  </div>
                </div>
                <p className="text-gray-400 text-xs mb-3">{plan.description}</p>
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                      <Check className="w-3.5 h-3.5 shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {planKey === 'premium' && (
                  <div className="mt-3 text-xs px-2 py-1 rounded-full text-center font-semibold" style={{ backgroundColor: `${plan.color}25`, color: plan.color }}>
                    Mais popular
                  </div>
                )}
              </button>
            )
          })}
        </div>
        </>)}

        {/* Registration Form */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">
              {mode === 'trial' ? (
                <>Criar conta — <span style={{ color: '#D2A63C' }}>Trial Premium 3 dias</span>
                  <span className="text-gray-400 font-normal text-sm ml-2">(grátis, sem cartão)</span></>
              ) : (
                <>Criar conta — <span style={{ color: activePlan.color }}>{activePlan.name}</span>
                  <span className="text-gray-400 font-normal text-sm ml-2">({activePricing.label})</span></>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {infoMessage && (
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-amber-200 text-sm">{infoMessage}</span>
                </div>
              )}
              {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-red-500 text-sm">{error}</span>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name" className="text-gray-300">Nome Completo *</Label>
                  <Input id="full_name" name="full_name" type="text" value={formData.full_name}
                    onChange={handleInputChange} className="bg-gray-800 border-gray-700 text-white"
                    placeholder="O teu nome completo" required disabled={isLoading} />
                </div>
                <div>
                  <Label htmlFor="username" className="text-gray-300">Nome de Utilizador *</Label>
                  <Input id="username" name="username" type="text" value={formData.username}
                    onChange={handleInputChange} className="bg-gray-800 border-gray-700 text-white"
                    placeholder="nome_utilizador" required disabled={isLoading} />
                </div>
              </div>

              <div>
                <Label htmlFor="email" className="text-gray-300">Email *</Label>
                <Input id="email" name="email" type="email" value={formData.email}
                  onChange={handleInputChange} className="bg-gray-800 border-gray-700 text-white"
                  placeholder="email@exemplo.com" required disabled={isLoading} />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone" className="text-gray-300">Telefone</Label>
                  <Input id="phone" name="phone" type="tel" value={formData.phone}
                    onChange={handleInputChange} className="bg-gray-800 border-gray-700 text-white"
                    placeholder="+351 912 345 678" disabled={isLoading} />
                </div>
                <div>
                  <Label htmlFor="whatsapp" className="text-gray-300">WhatsApp</Label>
                  <Input id="whatsapp" name="whatsapp" type="tel" value={formData.whatsapp}
                    onChange={handleInputChange} className="bg-gray-800 border-gray-700 text-white"
                    placeholder="+351 912 345 678" disabled={isLoading} />
                </div>
              </div>

              <div>
                <Label htmlFor="sponsorUsername" className="text-gray-300">
                  Código do patrocinador <span className="text-gray-500 font-normal">(opcional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="sponsorUsername"
                    name="sponsorUsername"
                    type="text"
                    value={formData.sponsorUsername}
                    onChange={handleInputChange}
                    onBlur={() => validateSponsor(formData.sponsorUsername)}
                    className="bg-gray-800 border-gray-700 text-white pr-8"
                    placeholder="Username de quem te convidou"
                    disabled={isLoading}
                  />
                  {validatingSponsor && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                  )}
                </div>
                {sponsorStatus !== null && !validatingSponsor && (
                  <div className={`flex items-center gap-1.5 mt-1 text-xs ${sponsorStatus.valid ? 'text-green-400' : 'text-red-400'}`}>
                    {sponsorStatus.valid ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Patrocinador: {sponsorStatus.name}</>
                    ) : (
                      <><XCircle className="w-3.5 h-3.5" /> Utilizador não encontrado</>
                    )}
                  </div>
                )}
              </div>

              {mode === 'paid' && (
              <div>
                <Label htmlFor="couponCode" className="text-gray-300">
                  Cupão de oferta <span className="text-gray-500 font-normal">(opcional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="couponCode"
                    name="couponCode"
                    type="text"
                    value={formData.couponCode}
                    onChange={handleInputChange}
                    onBlur={() => validateCoupon(formData.couponCode)}
                    className="bg-gray-800 border-gray-700 text-white pr-8 uppercase placeholder:normal-case"
                    placeholder="Código de cupão (ex: MTM2024)"
                    disabled={isLoading}
                    style={{ textTransform: formData.couponCode ? 'uppercase' : 'none' }}
                  />
                  {validatingCoupon && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                  )}
                </div>
                {couponStatus !== null && !validatingCoupon && (
                  <div className={`flex items-center gap-1.5 mt-1 text-xs ${couponStatus.valid ? 'text-green-400' : 'text-red-400'}`}>
                    {couponStatus.valid ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> {couponStatus.message}</>
                    ) : (
                      <><XCircle className="w-3.5 h-3.5" /> {couponStatus.message}</>
                    )}
                  </div>
                )}
              </div>
              )}

              <div>
                <Label htmlFor="password" className="text-gray-300">Palavra-passe *</Label>
                <div className="relative">
                  <Input id="password" name="password" type={showPassword ? "text" : "password"}
                    value={formData.password} onChange={handleInputChange}
                    className="bg-gray-800 border-gray-700 text-white pr-10"
                    placeholder="Mínimo 6 carateres" required disabled={isLoading} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-gray-300">Confirmar Palavra-passe *</Label>
                <div className="relative">
                  <Input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword} onChange={handleInputChange}
                    className="bg-gray-800 border-gray-700 text-white pr-10"
                    placeholder="Confirma a tua palavra-passe" required disabled={isLoading} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300" tabIndex={-1}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={isLoading} size="lg"
                className="w-full font-semibold text-black"
                style={{ background: mode === 'trial'
                  ? 'linear-gradient(135deg, #D2A63C, #BB8525)'
                  : `linear-gradient(135deg, ${activePlan.color}, ${selectedPlan === 'premium' ? '#5B21B6' : '#BB8525'})` }}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A preparar acesso...</>
                ) : mode === 'trial' ? (
                  <>🎁 Começar grátis — 3 dias de Premium</>
                ) : couponStatus?.valid && (couponStatus.type === 'free_subscription' || couponStatus.type === 'free_months') ? (
                  <>🎁 Activar acesso gratuito — {activePlan.name}</>
                ) : (
                  <>💳 Pagar e criar conta — {activePlan.name}</>
                )}
              </Button>

              <p className="text-xs text-center text-gray-500 -mt-1">
                {mode === 'trial'
                  ? '🎁 Sem cartão. Entras já na app com Premium por 3 dias. Depois continuas por 34,99€/mês (1º mês) — cancela quando quiseres.'
                  : couponStatus?.valid && (couponStatus.type === 'free_subscription' || couponStatus.type === 'free_months')
                  ? '🎁 O teu primeiro mês é gratuito. Após o período experimental, a subscrição renova automaticamente.'
                  : '🔒 Serás redirecionado para o Stripe para pagamento seguro. Após confirmação, a tua conta é criada automaticamente.'
                }
              </p>

              {mode === 'paid' && (<>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-900 text-gray-400">Ou regista-te com</span>
                </div>
              </div>

              <Button type="button" onClick={handleGoogleRegister} disabled={isLoading}
                className="w-full bg-white hover:bg-gray-100 text-gray-900" size="lg">
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
              </>)}
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-gray-400 text-sm">
                Já tens uma conta?{' '}
                <Link href="/login" className="text-[#D2A63C] hover:underline font-medium">Iniciar Sessão</Link>
              </p>
              <p className="text-gray-600 text-xs">
                Subscrição auto-renovável. Cancela a qualquer momento.{' '}
                <br />
                Ao criar conta aceitas os nossos{" "}
                <Link href="/terms" className="text-[#D2A63C] hover:underline">
                  Termos de Serviço
                </Link>{" "}
                e{" "}
                <Link href="/privacidade" className="text-[#D2A63C] hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Eye, EyeOff, Smartphone, Globe, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'

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
  const [selectedPlan, setSelectedPlan] = useState<'app_member' | 'premium'>('app_member')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    whatsapp: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()

  const activePlan = PLANS[selectedPlan]
  const activePricing = billingCycle === 'annual' ? activePlan.annual : activePlan.monthly

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.full_name.trim()) { setError('Nome completo é obrigatório'); return }
    if (!formData.email.trim()) { setError('Email é obrigatório'); return }
    if (!formData.username.trim()) { setError('Nome de utilizador é obrigatório'); return }
    if (formData.password.length < 6) { setError('A palavra-passe deve ter pelo menos 6 carateres'); return }
    if (formData.password !== formData.confirmPassword) { setError('As palavras-passe não coincidem'); return }

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
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=/new-landing`,
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

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#D2A63C] mb-4">
            <span className="text-black font-black text-2xl">M</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Criar Conta MTM</h1>
          <p className="text-gray-400 mt-2">Escolhe o teu plano e começa hoje</p>
        </div>

        {/* Billing Toggle */}
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

        {/* Registration Form */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">
              Criar conta — <span style={{ color: activePlan.color }}>{activePlan.name}</span>
              <span className="text-gray-400 font-normal text-sm ml-2">({activePricing.label})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                style={{ background: `linear-gradient(135deg, ${activePlan.color}, ${selectedPlan === 'premium' ? '#5B21B6' : '#BB8525'})` }}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A preparar pagamento...</>
                ) : (
                  <>💳 Pagar e criar conta — {activePlan.name}</>
                )}
              </Button>

              <p className="text-xs text-center text-gray-500 -mt-1">
                🔒 Serás redirecionado para o Stripe para pagamento seguro. Após confirmação, a tua conta é criada automaticamente.
              </p>

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
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-gray-400 text-sm">
                Já tens uma conta?{' '}
                <Link href="/login" className="text-[#D2A63C] hover:underline font-medium">Iniciar Sessão</Link>
              </p>
              <p className="text-gray-600 text-xs">
                Subscrição auto-renovável. Cancela a qualquer momento.{' '}
                <br />Ao criar conta aceitas os nossos Termos de Serviço e Política de Privacidade.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

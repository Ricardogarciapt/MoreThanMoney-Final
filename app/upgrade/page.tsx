'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Check, ArrowRight, Zap, Globe, Smartphone, Star,
  BookOpen, Video, BarChart3, Bot, Shield, Loader2,
  CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Planos ────────────────────────────────────────────────────────────────────
const PLANS = {
  app_member: {
    id: 'app_member',
    name: 'Pack Membro',
    icon: Smartphone,
    color: '#D2A63C',
    colorBg: 'rgba(210,166,60,0.08)',
    colorBorder: 'rgba(210,166,60,0.3)',
    monthly: { price: 35, label: '35€/mês', planId: 'app_member_monthly' },
    annual:  { price: 28, label: '28€/mês', total: '336€/ano', planId: 'app_member_annual' },
    features: [
      'App MTM System (iOS e Android)',
      'Feed Social e Chat de Comunidade',
      'Live Sessions MTM (assistir)',
      'Onboarding e tutorial guiado',
      'Suporte por email',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Pack Premium',
    icon: Globe,
    color: '#7C3AED',
    colorBg: 'rgba(124,58,237,0.08)',
    colorBorder: 'rgba(124,58,237,0.35)',
    monthly: { price: 65, label: '65€/mês', planId: 'premium_monthly' },
    annual:  { price: 52, label: '52€/mês', total: '624€/ano', planId: 'premium_annual' },
    features: [
      'Tudo do Pack Membro',
      'Acesso completo ao site morethanmoney.pt',
      'Scanners AI exclusivos (GoldKiller + MTM)',
      'Portfólio MTM com análises DCA',
      'Live Sessions Premium + gravações',
      'Comunidade Skool MTM',
      'Cursos: Forex, Cripto, Marketing Digital, IA',
      'Ferramentas avançadas de trading',
      'Suporte prioritário',
    ],
    highlight: true,
  },
} as const

type PlanKey = keyof typeof PLANS

// ─── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ = [
  {
    q: 'Posso fazer downgrade se mudar de ideias?',
    a: 'Sim. Podes mudar de plano a qualquer momento. O ajuste é feito pro-rata — pagas apenas pelo que usas.',
  },
  {
    q: 'O que acontece ao meu acesso ao mudar de plano?',
    a: 'O upgrade é imediato após confirmação do pagamento. O downgrade é aplicado no próximo ciclo de faturação.',
  },
  {
    q: 'O pagamento anual tem benefício?',
    a: 'Sim — ao pagar anualmente poupas 20% relativamente ao plano mensal (equivalente a 2 meses grátis).',
  },
  {
    q: 'Como cancelo a subscrição?',
    a: 'Podes cancelar a qualquer momento no portal do Stripe (link enviado por email) ou contactando o suporte.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left text-white hover:bg-gray-900/50 transition-colors"
      >
        <span className="font-medium text-sm">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-3" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-3" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-gray-400 leading-relaxed border-t border-gray-800 pt-3">
          {a}
        </div>
      )}
    </div>
  )
}

// ─── Página ────────────────────────────────────────────────────────────────────
export default function UpgradePage() {
  const { user } = useAuth()
  const router = useRouter()

  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const currentPlan = user?.subscription_plan ?? 'app_member'
  const isPremium   = currentPlan === 'premium'

  const handleCheckout = async (planKey: PlanKey) => {
    setError('')
    if (!user) { router.push('/login?redirect=/upgrade'); return }

    const plan    = PLANS[planKey]
    const pricing = billing === 'annual' ? plan.annual : plan.monthly

    setLoading(pricing.planId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { router.push('/login?redirect=/upgrade'); return }

      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ planId: pricing.planId, email: user.email }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Não foi possível iniciar o pagamento. Tenta novamente.')
        setLoading(null)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Erro de rede. Tenta novamente.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-5xl">
          <Link href="/new-landing" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            ← Voltar
          </Link>
          <span className="font-bold text-[#D2A63C]">MoreThanMoney</span>
          {user ? (
            <span className="text-xs text-gray-400">{user.email}</span>
          ) : (
            <Link href="/login?redirect=/upgrade" className="text-sm text-[#D2A63C] hover:underline">Login</Link>
          )}
        </div>
      </div>

      <main className="container mx-auto px-4 py-12 max-w-5xl">

        {/* Hero */}
        <div className="text-center mb-10">
          <Badge className="mb-4 bg-[#D2A63C]/15 text-[#D2A63C] border-[#D2A63C]/30">
            ⚡ Upgrade de Plano
          </Badge>
          <h1 className="text-3xl md:text-5xl font-black mb-4">
            Escolhe o teu plano MTM
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Começa com o Pack Membro e evolui quando quiseres — sem complicações, sem contratos, cancela a qualquer momento.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center mt-7 rounded-xl bg-gray-900 p-1 border border-gray-800 gap-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${billing === 'annual' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Anual
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">−20%</span>
            </button>
          </div>
        </div>

        {/* Cards de plano */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {(Object.values(PLANS) as typeof PLANS[PlanKey][]).map((plan) => {
            const pricing  = billing === 'annual' ? plan.annual : plan.monthly
            const Icon     = plan.icon
            const isActive = currentPlan === plan.id
            const isPremiumCard = plan.id === 'premium'

            return (
              <div
                key={plan.id}
                className="rounded-2xl border-2 flex flex-col overflow-hidden relative"
                style={{
                  borderColor: isPremiumCard ? plan.color : (isActive ? plan.color : '#374151'),
                  background:  isPremiumCard ? plan.colorBg : '#111827',
                }}
              >
                {isPremiumCard && (
                  <div className="absolute top-0 left-0 right-0 text-center py-1.5 text-xs font-bold text-black"
                    style={{ background: plan.color }}>
                    ⭐ MAIS POPULAR
                  </div>
                )}

                <div className={`p-6 flex-1 ${isPremiumCard ? 'pt-9' : ''}`}>
                  {/* Header do card */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${plan.color}20` }}>
                        <Icon className="w-5 h-5" style={{ color: plan.color }} />
                      </div>
                      <div>
                        <h2 className="font-bold text-white text-lg">{plan.name}</h2>
                        {isActive && (
                          <span className="text-xs text-green-400 font-medium">● Plano atual</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">{pricing.price}€</span>
                      <span className="text-gray-400 text-sm">/mês</span>
                      {billing === 'annual' && (
                        <p className="text-xs text-gray-400 mt-0.5">{pricing.total}</p>
                      )}
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: plan.color }} />
                        <span className={isPremiumCard ? 'text-gray-200' : 'text-gray-300'}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {isActive ? (
                    <div className="w-full py-3 rounded-xl border text-center text-sm font-semibold text-gray-400"
                      style={{ borderColor: plan.color + '60' }}>
                      ✓ Plano ativo
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleCheckout(plan.id as PlanKey)}
                      disabled={!!loading}
                      className="w-full font-bold py-5"
                      style={{
                        background: isPremiumCard ? `linear-gradient(135deg, ${plan.color}, #5B21B6)` : `linear-gradient(135deg, ${plan.color}, #BB8525)`,
                        color: isPremiumCard ? '#fff' : '#000',
                      }}
                    >
                      {loading === pricing.planId ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A processar...</>
                      ) : isPremium ? (
                        'Mudar de plano'
                      ) : plan.id === 'premium' ? (
                        <>Fazer upgrade <ArrowRight className="ml-2 h-4 w-4" /></>
                      ) : (
                        <>Ativar este plano <ArrowRight className="ml-2 h-4 w-4" /></>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            {error}
          </div>
        )}

        {/* Não tem conta */}
        {!user && (
          <div className="mb-8 text-center text-sm text-gray-400">
            Já tens conta?{' '}
            <Link href="/login?redirect=/upgrade" className="text-[#D2A63C] hover:underline">
              Faz login para gerir a tua subscrição
            </Link>
          </div>
        )}

        {/* Garantias */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: Shield,   title: 'Pagamento Seguro',      text: 'Processado pelo Stripe — os teus dados nunca passam pelos nossos servidores' },
            { icon: Zap,      title: 'Ativação Imediata',     text: 'Acesso disponível logo após confirmação do pagamento' },
            { icon: CreditCard, title: 'Cancela Quando Quiseres', text: 'Sem compromisos — cancela a qualquer momento, sem multas' },
            { icon: Star,     title: 'Suporte Dedicado',      text: 'Equipa MTM disponível para te ajudar a tirar o máximo proveito' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="text-center rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <Icon className="w-6 h-6 text-[#D2A63C] mx-auto mb-2" />
              <p className="text-xs font-bold text-white mb-1">{title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Comparação de funcionalidades */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-6">Comparação de funcionalidades</h2>
          <div className="rounded-2xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-900 border-b border-gray-800">
              <div className="p-4 text-sm font-semibold text-gray-400">Funcionalidade</div>
              <div className="p-4 text-center text-sm font-bold text-[#D2A63C]">Membro</div>
              <div className="p-4 text-center text-sm font-bold text-purple-400">Premium</div>
            </div>
            {[
              ['App Mobile MTM (iOS/Android)', true, true],
              ['Feed Social e Chat', true, true],
              ['Live Sessions MTM', true, true],
              ['Scanners AI (GoldKiller + MTM)', false, true],
              ['Acesso ao site morethanmoney.pt', false, true],
              ['Portfólio MTM + análises DCA', false, true],
              ['Live Sessions Premium + gravações', false, true],
              ['Comunidade Skool MTM', false, true],
              ['Cursos completos (Forex, Cripto, IA)', false, true],
              ['Ferramentas avançadas de trading', false, true],
              ['Suporte prioritário', false, true],
            ].map(([feature, membro, premium]) => (
              <div key={String(feature)} className="grid grid-cols-3 border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                <div className="p-4 text-sm text-gray-300">{String(feature)}</div>
                <div className="p-4 flex justify-center items-center">
                  {membro
                    ? <Check className="w-5 h-5 text-[#D2A63C]" />
                    : <span className="text-gray-700 text-lg">—</span>
                  }
                </div>
                <div className="p-4 flex justify-center items-center">
                  {premium
                    ? <Check className="w-5 h-5 text-purple-400" />
                    : <span className="text-gray-700 text-lg">—</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-12 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-6">Perguntas Frequentes</h2>
          <div className="space-y-3">
            {FAQ.map(({ q, a }) => <FAQItem key={q} q={q} a={a} />)}
          </div>
        </div>

        {/* CTA final */}
        <div className="text-center py-8 border-t border-gray-800">
          <p className="text-gray-400 mb-6 text-sm">
            Ainda tens dúvidas? Fala connosco →{' '}
            <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
              suporte@morethanmoney.pt
            </a>
          </p>
          {!isPremium && (
            <Button
              onClick={() => handleCheckout('premium')}
              disabled={!!loading}
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold px-10"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
              ) : (
                <>Fazer upgrade para Premium <Zap className="ml-2 h-5 w-5" /></>
              )}
            </Button>
          )}
        </div>

      </main>
    </div>
  )
}

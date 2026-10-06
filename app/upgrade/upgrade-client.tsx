'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { useT } from '@/components/i18n-provider'
import LanguagePicker from '@/components/language-picker'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Check, ArrowRight, Zap, Globe, Smartphone, Star, Crown,
  BookOpen, Video, BarChart3, Bot, Shield, Loader2,
  CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CaixaConsentimentoEmail } from '@/components/consentimento-email-caixa'
import { CAIXA_PRE_MARCADA } from '@/lib/captacao-consentimento'

/**
 * A oferta do degrau de cima (Elite), vinda do servidor.
 *
 * Chega por prop e não por import porque `lib/escada-precos` puxa o gate da corretora, que puxa
 * o Supabase de service role: importá-lo aqui metia a chave de admin no bundle do browser. O
 * servidor lê a escada, confirma que o preço Stripe resolve, e manda só o que o cliente pode ver.
 *
 * `null` = não há nada para vender (ver `app/upgrade/page.tsx`): a coluna não é renderizada.
 */
export type OfertaTopo = {
  /** O nome do pacote como o cliente o lê — 'Elite'. Nunca 'Fundador' (reservado aos cupões). */
  nome: string
  /** 597 — o número, para o preço grande do card. */
  precoAno: number
  /** '597€/ano' já formatado à portuguesa pela escada. */
  precoLabel: string
  /** 'elite_annual' — a chave que o /api/stripe/create-checkout-session resolve em price_id. */
  planId: string
}

// ─── Planos ────────────────────────────────────────────────────────────────────
/**
 * Um preço de um card.
 *
 * `unidade` existe por causa do Elite: é anual, e a grelha assumia que TODOS os packs se
 * anunciam por mês. Em f36aeeb8 o Elite estava resolvido com `price: 50` (um número que ninguém
 * cobrava) e um `597€` escrito à mão no JSX, ligados por quatro `isEliteCard ? ... : ...` no
 * meio do render — e foi por aí que o card divergiu do que a Stripe cobrava (2855bdfc). Agora a
 * cadência é DADO: quem se anuncia ao ano põe `unidade: '/ano'` e o render não sabe de packs.
 */
type Preco = {
  price: number
  label: string
  total?: string
  /** Sufixo do preço grande. Omitido = por mês (o `upgrade.perMonth` do dicionário). */
  unidade?: string
  /** Linha pequena por baixo do preço (ex.: o equivalente mensal do anual). */
  nota?: string
  planId: string
}

type Plano = {
  id: string
  name: string
  icon: LucideIcon
  color: string
  colorBg: string
  colorBorder: string
  monthly: Preco
  annual: Preco
  features: readonly string[]
  highlight?: boolean
  /** Fita dourada no topo do card, com o texto já pronto. */
  fita?: string
}

const PLANS: Record<'app_member' | 'premium', Plano> = {
  app_member: {
    id: 'app_member',
    name: 'upgrade.planMemberName',
    icon: Smartphone,
    color: '#D2A63C',
    colorBg: 'rgba(210,166,60,0.08)',
    colorBorder: 'rgba(210,166,60,0.3)',
    monthly: { price: 35, label: '35€/mês', planId: 'app_member_monthly' },
    annual:  { price: 28, label: '28€/mês', total: '336€/ano', planId: 'app_member_annual' },
    features: [
      'upgrade.memberFeat1',
      'upgrade.memberFeat2',
      'upgrade.memberFeat3',
      'upgrade.memberFeat4',
      'upgrade.memberFeat5',
    ],
  },
  premium: {
    id: 'premium',
    name: 'upgrade.planPremiumName',
    icon: Globe,
    color: '#7C3AED',
    colorBg: 'rgba(124,58,237,0.08)',
    colorBorder: 'rgba(124,58,237,0.35)',
    monthly: { price: 65, label: '65€/mês', planId: 'premium_monthly' },
    annual:  { price: 52, label: '52€/mês', total: '624€/ano', planId: 'premium_annual' },
    features: [
      'upgrade.premiumFeat1',
      'upgrade.premiumFeat2',
      'upgrade.premiumFeat3',
      'upgrade.premiumFeat4',
      'upgrade.premiumFeat5',
      'upgrade.premiumFeat6',
      'upgrade.premiumFeat7',
      'upgrade.premiumFeat8',
      'upgrade.premiumFeat9',
    ],
    highlight: true,
  },
}

/**
 * O card do degrau de cima, construído a partir do que o servidor leu da escada.
 *
 * Nenhum número está escrito aqui: o 597 vive em `lib/escada-precos.ts` e chega em `topo`. É a
 * mesma regra que fez nascer essa fonte única — um preço anunciado num sítio e cobrado noutro
 * não dá erro, dá um lead que se sente enganado no momento do pagamento.
 *
 * Mensal e anual são o MESMO preço de propósito: o Elite só existe ao ano, por isso o botão de
 * faturação em cima não o muda (em vez de o esconder ou de mostrar um mensal que não se cobra).
 */
function cardTopo(topo: OfertaTopo): Plano {
  const preco: Preco = {
    price: topo.precoAno,
    label: topo.precoLabel,
    unidade: '/ano',
    nota: `≈${Math.round(topo.precoAno / 12)}€/mês · pago 1× · só anual`,
    planId: topo.planId,
  }
  return {
    id: 'elite',
    name: topo.nome,
    icon: Crown,
    color: '#E0B44A',
    colorBg: 'rgba(224,180,74,0.10)',
    colorBorder: 'rgba(224,180,74,0.45)',
    monthly: preco,
    annual: preco,
    features: [
      'Tudo do Premium — 1 ano completo',
      'Estatuto Fundador vitalício (preço travado)',
      'Scanners lifetime (GoldKiller)',
      'Acesso a produtos PAMM',
      'Isenção de fees (promoções exclusivas)',
      'Bónus PU Prime de 100% sobre o depósito',
      'Formação: criar negócios digitais',
      'Acompanhamento direto',
      'Comunidade VIP fechada',
    ],
    highlight: true,
    fita: `👑 ${topo.nome}`,
  }
}

// ─── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ = [
  { q: 'upgrade.faq1q', a: 'upgrade.faq1a' },
  { q: 'upgrade.faq2q', a: 'upgrade.faq2a' },
  { q: 'upgrade.faq3q', a: 'upgrade.faq3a' },
  { q: 'upgrade.faq4q', a: 'upgrade.faq4a' },
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
export default function UpgradeClient({ topo }: { topo: OfertaTopo | null }) {
  const { user, isPrimeverse, isLoading } = useAuth()
  const router = useRouter()
  const t = useT()

  // PrimeVerse: Member sem upsell — não tem acesso à página de upgrade.
  useEffect(() => {
    if (!isLoading && isPrimeverse) router.replace('/member-area')
  }, [isLoading, isPrimeverse, router])

  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [consentimentoEmail, setConsentimentoEmail] = useState(CAIXA_PRE_MARCADA)
  const [error, setError] = useState('')
  // Chegada pela campanha de ativação (email ou redirect do middleware): a conta existe,
  // falta escolher pack. Lê-se do location para não obrigar a Suspense de useSearchParams.
  const [ativacao, setAtivacao] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('from') === 'ativacao') setAtivacao(true)
    if ((q.get('plan') || '').endsWith('_annual')) setBilling('annual')
  }, [])

  const currentPlan = user?.subscription_plan ?? 'app_member'
  const isPremium   = currentPlan === 'premium'
  // Os packs traduzidos usam chaves `upgrade.*` do dicionário; os perks do Elite são literais
  // (ainda não estão nas 21 línguas), e passam por aqui intactos.
  const label = (s: string) => (s.startsWith('upgrade.') ? t(s) : s)

  // A grelha mostra o Elite só quando ele é comprável — ver `app/upgrade/page.tsx`.
  const planos: Plano[] = [...Object.values(PLANS), ...(topo ? [cardTopo(topo)] : [])]

  /**
   * Abre o checkout Stripe do plano pedido.
   *
   * Recebe o `planId` já resolvido (e não a chave do pack) para não haver uma segunda leitura
   * do `billing` aqui dentro: o card mostra um preço e manda exactamente o plano desse preço.
   * É o MESMO caminho para os três packs — sem rota nem URL próprios para o Elite.
   */
  const handleCheckout = async (planId: string) => {
    setError('')
    if (!user) { router.push('/login?redirect=/upgrade'); return }

    setLoading(planId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { router.push('/login?redirect=/upgrade'); return }

      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ planId, email: user.email, consentimentoEmail }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || t('upgrade.errCheckout'))
        setLoading(null)
        return
      }
      window.location.href = data.url
    } catch {
      setError(t('upgrade.errNetwork'))
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-5xl">
          <Link href="/new-landing" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            ← {t('upgrade.back')}
          </Link>
          <span className="font-bold text-[#D2A63C]">MoreThanMoney</span>
          {user ? (
            <span className="text-xs text-gray-400">{user.email}</span>
          ) : (
            <Link href="/login?redirect=/upgrade" className="text-sm text-[#D2A63C] hover:underline">{t('upgrade.login')}</Link>
          )}
        </div>
      </div>

      {ativacao && (
        <div className="border-b border-[#D2A63C]/30 bg-[#D2A63C]/10">
          <div className="container mx-auto max-w-5xl px-4 py-4">
            <p className="text-sm font-semibold text-[#D2A63C]">A tua conta está à espera de ativação</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-300">
              O histórico e o login ficam como estão. Escolhe o pack abaixo e o acesso ao site e às apps
              reabre assim que o pagamento é confirmado.
            </p>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-12 max-w-5xl">

        {/* Idioma. A página de packs não tem navbar: quem chega por email ou por link directo
            não tinha como a ler na sua língua, e é aqui que se decide a compra. */}
        <div className="flex justify-end mb-4">
          <LanguagePicker />
        </div>

        {/* Hero */}
        <div className="text-center mb-10">
          <Badge className="mb-4 bg-[#D2A63C]/15 text-[#D2A63C] border-[#D2A63C]/30">
            ⚡ {t('upgrade.badge')}
          </Badge>
          <h1 className="text-3xl md:text-5xl font-black mb-4">
            {t('upgrade.title')}
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            {t('upgrade.subtitle')}
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center mt-7 rounded-xl bg-gray-900 p-1 border border-gray-800 gap-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              {t('upgrade.billingMonthly')}
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${billing === 'annual' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              {t('upgrade.billingAnnual')}
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">−20%</span>
            </button>
          </div>
        </div>

        {/* Cards de plano */}
        {/* A caixa de email (opcional, desmarcada — 06/10 F4). Antes dos packs: vale para o que se escolher. */}
        <CaixaConsentimentoEmail marcada={consentimentoEmail} onMudar={setConsentimentoEmail} className="mx-auto mb-6 max-w-xl" />

        <div className={`grid gap-5 mb-10 mx-auto ${planos.length > 2 ? 'md:grid-cols-3 max-w-5xl' : 'md:grid-cols-2 max-w-3xl'}`}>
          {planos.map((plan) => {
            const pricing  = billing === 'annual' ? plan.annual : plan.monthly
            const Icon     = plan.icon
            const isEliteCard = plan.id === 'elite'
            // Quem já é VIP tem os direitos do Elite (é isso que `memberCategoryForPlan` grava,
            // e é também o que uma oferta manual concede). Mostrar-lhe o botão era cobrar-lhe
            // outra vez o que já tem.
            const isActive = currentPlan === plan.id || (isEliteCard && user?.member_category === 'vip')
            const isPremiumCard = plan.id === 'premium'
            const featured = !!plan.highlight

            return (
              <div
                key={plan.id}
                className="rounded-2xl border-2 flex flex-col overflow-hidden relative"
                style={{
                  borderColor: featured ? plan.color : (isActive ? plan.color : '#374151'),
                  background:  featured ? plan.colorBg : '#111827',
                }}
              >
                {featured && (
                  <div className="absolute top-0 left-0 right-0 text-center py-1.5 text-xs font-bold text-black"
                    style={{ background: plan.color }}>
                    {plan.fita ?? `⭐ ${t('upgrade.mostPopular')}`}
                  </div>
                )}

                <div className={`p-6 flex-1 ${featured ? 'pt-9' : ''}`}>
                  {/* Header do card */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${plan.color}20` }}>
                        <Icon className="w-5 h-5" style={{ color: plan.color }} />
                      </div>
                      <div>
                        <h2 className="font-bold text-white text-lg">{label(plan.name)}</h2>
                        {isActive && (
                          <span className="text-xs text-green-400 font-medium">● {t('upgrade.currentPlan')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">{pricing.price}€</span>
                      <span className="text-gray-400 text-sm">{pricing.unidade ?? t('upgrade.perMonth')}</span>
                      {pricing.nota && <p className="text-xs text-gray-400 mt-0.5">{pricing.nota}</p>}
                      {billing === 'annual' && pricing.total && (
                        <p className="text-xs text-gray-400 mt-0.5">{pricing.total}</p>
                      )}
                      {isPremiumCard && billing === 'monthly' && (
                        <p className="mt-1 inline-block rounded-full bg-[#D2A63C]/15 px-2 py-0.5 text-[11px] font-bold text-[#D2A63C]">
                          {t('upgrade.firstMonthPromo')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: plan.color }} />
                        <span className={featured ? 'text-gray-200' : 'text-gray-300'}>{label(f)}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {isActive ? (
                    <div className="w-full py-3 rounded-xl border text-center text-sm font-semibold text-gray-400"
                      style={{ borderColor: plan.color + '60' }}>
                      ✓ {t('upgrade.planActive')}
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleCheckout(pricing.planId)}
                      disabled={!!loading}
                      className="w-full font-bold py-5"
                      style={{
                        background: isPremiumCard ? `linear-gradient(135deg, ${plan.color}, #5B21B6)` : `linear-gradient(135deg, ${plan.color}, #BB8525)`,
                        color: isPremiumCard ? '#fff' : '#000',
                      }}
                    >
                      {loading === pricing.planId ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('upgrade.processing')}</>
                      ) : isEliteCard ? (
                        <>Quero ser {plan.name} <ArrowRight className="ml-2 h-4 w-4" /></>
                      ) : isPremium ? (
                        t('upgrade.changePlan')
                      ) : plan.id === 'premium' ? (
                        <>{t('upgrade.doUpgrade')} <ArrowRight className="ml-2 h-4 w-4" /></>
                      ) : (
                        <>{t('upgrade.activatePlan')} <ArrowRight className="ml-2 h-4 w-4" /></>
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
            {t('upgrade.haveAccount')}{' '}
            <Link href="/login?redirect=/upgrade" className="text-[#D2A63C] hover:underline">
              {t('upgrade.loginToManage')}
            </Link>
          </div>
        )}

        {/* Garantias */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: Shield,     title: 'upgrade.guaranteeSecureTitle',  text: 'upgrade.guaranteeSecureText' },
            { icon: Zap,        title: 'upgrade.guaranteeInstantTitle', text: 'upgrade.guaranteeInstantText' },
            { icon: CreditCard, title: 'upgrade.guaranteeCancelTitle',  text: 'upgrade.guaranteeCancelText' },
            { icon: Star,       title: 'upgrade.guaranteeSupportTitle', text: 'upgrade.guaranteeSupportText' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="text-center rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <Icon className="w-6 h-6 text-[#D2A63C] mx-auto mb-2" />
              <p className="text-xs font-bold text-white mb-1">{t(title)}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{t(text)}</p>
            </div>
          ))}
        </div>

        {/* Comparação de funcionalidades */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-6">{t('upgrade.comparisonTitle')}</h2>
          <div className="rounded-2xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-900 border-b border-gray-800">
              <div className="p-4 text-sm font-semibold text-gray-400">{t('upgrade.colFeature')}</div>
              <div className="p-4 text-center text-sm font-bold text-[#D2A63C]">{t('upgrade.colMember')}</div>
              <div className="p-4 text-center text-sm font-bold text-purple-400">Premium</div>
            </div>
            {[
              ['upgrade.cmp1', true, true],
              ['upgrade.cmp2', true, true],
              ['upgrade.cmp3', true, true],
              ['upgrade.cmp4', false, true],
              ['upgrade.cmp5', false, true],
              ['upgrade.cmp6', false, true],
              ['upgrade.cmp7', false, true],
              ['upgrade.cmp8', false, true],
              ['upgrade.cmp9', false, true],
              ['upgrade.cmp10', false, true],
              ['upgrade.cmp11', false, true],
            ].map(([feature, membro, premium]) => (
              <div key={String(feature)} className="grid grid-cols-3 border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                <div className="p-4 text-sm text-gray-300">{t(String(feature))}</div>
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
          <h2 className="text-2xl font-bold text-center mb-6">{t('upgrade.faqTitle')}</h2>
          <div className="space-y-3">
            {FAQ.map(({ q, a }) => <FAQItem key={q} q={t(q)} a={t(a)} />)}
          </div>
        </div>

        {/* CTA final */}
        <div className="text-center py-8 border-t border-gray-800">
          <p className="text-gray-400 mb-6 text-sm">
            {t('upgrade.stillQuestions')} →{' '}
            <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
              suporte@morethanmoney.pt
            </a>
          </p>
          {!isPremium && (
            <Button
              onClick={() => handleCheckout(billing === 'annual' ? PLANS.premium.annual.planId : PLANS.premium.monthly.planId)}
              disabled={!!loading}
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold px-10"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('upgrade.processing')}</>
              ) : (
                <>{t('upgrade.upgradeToPremium')} <Zap className="ml-2 h-5 w-5" /></>
              )}
            </Button>
          )}
        </div>

      </main>
    </div>
  )
}

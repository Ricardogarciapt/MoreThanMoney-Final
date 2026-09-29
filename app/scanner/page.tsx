"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Breadcrumbs from "@/components/breadcrumbs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, ArrowRight, BarChart3, Shield, Check, Zap, Star, Loader2, X } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import { supabase } from "@/lib/supabase"

// ---------------------------------------------------------------------------
// Scanner products
// ---------------------------------------------------------------------------

interface ScannerProduct {
  id: string
  label: string
  price: string
  priceNote?: string
  planId: string   // matches PRICE_IDS key in /api/stripe/create-checkout-session
  highlight?: boolean
}

interface ScannerData {
  key: string
  name: string
  subtitle: string
  image: string
  description: string
  features: string[]
  techSpecs: string[]
  products: ScannerProduct[]
  badge?: string
}

const SCANNERS: ScannerData[] = [
  {
    key: "goldkiller",
    name: "MTM Gold Killer V2.1",
    subtitle: "Análise Técnica Avançada",
    image: "https://s3.tradingview.com/snapshots/x/X7SREOsm.png",
    badge: "Best Seller",
    description:
      "Um indicador avançado que combina técnicas estatísticas robustas, filtros de suavização personalizados e lógica de tendência baseada em SuperTrend para mapear oportunidades de trade com níveis de risco e recompensa claramente definidos.",
    features: [
      "Fonte de preço personalizável (médias comuns ou versão suavizada)",
      "Detecção de tendência com SuperTrend baseada em ATR",
      "Alvo estatístico dinâmico com cálculos percentuais",
      "Visualização multi-nível (até 5 níveis de alvo/drawdown)",
      "Personalização avançada de parâmetros",
    ],
    techSpecs: [
      "Linhas de alvo (verde) para projeções de ganhos",
      "Linhas de drawdown (vermelho) para projeções de perdas",
      "Linha central (cinza) para ponto de entrada",
      "Análise estatística com média e desvio padrão",
      "Preenchimento com cores suaves para visualização de distâncias",
    ],
    products: [
      { id: "gk-lifetime", label: "Acesso Vitalício", price: "50€", priceNote: "Pagamento único", planId: "goldkiller_lifetime", highlight: true },
    ],
  },
  {
    key: "aurumflow",
    name: "MTM Aurum Flow Cripto",
    subtitle: "Perpétuos Cripto · Tendência",
    image: "/aurum-flow-preview.png",
    badge: "Novo",
    description:
      "O scanner de perpétuos cripto da MTM (otimizado para 1H). Só opera a favor da tendência (stack DEMA) com confirmação de momentum e entrega um plano completo e estático por sinal — entrada, stop e 3 alvos — com distâncias em % e cálculo de alavancagem e custo para o tamanho da tua conta.",
    features: [
      "Filtro de tendência obrigatório (DEMA 15/50/238) + confirmação RSI",
      "Níveis estáticos: entrada, SL e TP1–TP3 fixados na barra do sinal",
      "Stops e alvos por ATR (SL 1.5×ATR · alvos 1:1.5 / 1:3 / 1:6)",
      "Distância de cada nível em pontos e percentagem",
      "Painel de conta: alavancagem útil, notional e custo de fees",
    ],
    techSpecs: [
      "Timeframe recomendado: 1H",
      "Mercados: perpétuos cripto (Bybit / Binance)",
      "Gestão de risco integrada (risco % por trade)",
      "Alertas JSON prontos para webhook e copytrading",
      "Baseado no motor proprietário do MTM Scanner",
    ],
    products: [
      { id: "af-lifetime", label: "Acesso Vitalício", price: "50€", priceNote: "Pagamento único", planId: "aurumflow_lifetime", highlight: true },
    ],
  },
  {
    key: "mtm-scanner",
    name: "Scanner MTM V3.4",
    subtitle: "Market Structures and ATR",
    image: "https://s3.tradingview.com/snapshots/z/ZPM47fOg.png",
    description:
      "Scanner avançado de estruturas de mercado com cálculo automático de ATR, sinais de entrada e saída optimizados e compatibilidade com múltiplos timeframes.",
    features: [
      "Identificação de estruturas de mercado em tempo real",
      "Cálculo de ATR para gestão de risco",
      "Sinais de entrada e saída optimizados",
      "Compatível com múltiplos timeframes",
      "Atualizações regulares e suporte dedicado",
    ],
    techSpecs: [
      "Análise de estruturas de mercado em tempo real",
      "Cálculo automático de ATR para volatilidade",
      "Filtros de tendência avançados",
      "Alertas personalizáveis por email",
      "Integração com TradingView",
    ],
    products: [
      { id: "mtm-monthly", label: "Mensal", price: "12,50€/mês", planId: "mtm_scanner_monthly" },
      { id: "mtm-lifetime", label: "Vitalício", price: "250€", priceNote: "Pagamento único", planId: "mtm_scanner_lifetime", highlight: true },
    ],
  },
  {
    key: "sensei",
    name: "MTM Sensei",
    subtitle: "Inteligência Artificial Avançada",
    image: "/MTM%20Sensei%20Preview.png",
    badge: "Novo",
    description:
      "O scanner mais sofisticado da MTM. O Sensei usa inteligência artificial para identificar confluências entre múltiplas metodologias — Smart Money, Goldenzone, SR MTM e KillShot — gerando sinais de alta precisão para traders profissionais.",
    features: [
      "IA multi-confluência com Smart Money Concepts",
      "Integração com metodologia Goldenzone MTM",
      "Identificação automática de zonas SR (Suporte/Resistência)",
      "KillShot — sinal de alta probabilidade com confirmação múltipla",
      "Dashboard de performance em tempo real",
    ],
    techSpecs: [
      "Motor de IA proprietário treinado em dados históricos MTM",
      "Confluência automática de 4+ metodologias",
      "Alertas em tempo real no TradingView",
      "Score de qualidade de sinal (0–100)",
      "Historial de trades e taxa de acerto",
    ],
    products: [
      // O Sensei faz parte do Pack Scanners — ver secção Pack Scanners abaixo
    ],
  },
]

// ---------------------------------------------------------------------------
// Checkout Modal
// ---------------------------------------------------------------------------

interface CheckoutModalProps {
  product: ScannerProduct
  scannerName: string
  onClose: () => void
}

function CheckoutModal({ product, scannerName, onClose }: CheckoutModalProps) {
  const [tvUsername, setTvUsername] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [sponsorCode, setSponsorCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [isGuest, setIsGuest] = useState<boolean | null>(null) // null = a verificar

  // Verificar se está logado ao abrir o modal
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsGuest(!session?.access_token)
    })
  }, [])

  const handleCheckout = async () => {
    if (isGuest === null) {
      setError("A verificar sessão… tenta novamente dentro de um segundo.")
      return
    }
    if (!tvUsername.trim()) {
      setError("O teu nome de utilizador do TradingView é necessário para activar o acesso.")
      return
    }
    setError("")
    setIsLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.access_token) {
        // Utilizador autenticado — usa endpoint com auth
        const res = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            planId: product.planId,
            tradingview_username: tvUsername.trim(),
            sponsorCode: sponsorCode.trim() || '',
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(data.error || "Erro ao iniciar pagamento. Tenta novamente.")
          setIsLoading(false)
          return
        }
        window.location.href = data.url
      } else {
        const email = guestEmail.trim()
        if (!email) {
          setError("O teu email é necessário para receberes a confirmação de pagamento.")
          setIsLoading(false)
          return
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError("Email inválido. Verifica e tenta novamente.")
          setIsLoading(false)
          return
        }
        // Visitante sem conta — usa endpoint guest
        const res = await fetch("/api/stripe/scanner-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: product.planId,
            email,
            tvUsername: tvUsername.trim(),
            sponsorCode: sponsorCode.trim() || '',
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(data.error || "Erro ao iniciar pagamento. Tenta novamente.")
          setIsLoading(false)
          return
        }
        window.location.href = data.url
      }
    } catch {
      setError("Erro de rede. Verifica a tua ligação e tenta novamente.")
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-white mb-1">{scannerName}</h3>
          <div className="text-2xl font-black text-[#D2A63C]">{product.price}</div>
          {product.priceNote && <div className="text-xs text-gray-400 mt-0.5">{product.priceNote}</div>}
        </div>

        {/* Campo email — apenas para visitantes sem conta */}
        {isGuest && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              O teu email *
            </label>
            <Input
              type="email"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              placeholder="exemplo@email.com"
              className="bg-gray-800 border-gray-700 text-white"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Recebes a confirmação de compra e as instruções de acesso neste email.
            </p>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Nome de utilizador TradingView *
          </label>
          <Input
            value={tvUsername}
            onChange={e => setTvUsername(e.target.value)}
            placeholder="O teu @username no TradingView"
            className="bg-gray-800 border-gray-700 text-white"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            Após o pagamento recebes um email com as instruções de acesso ao script no TradingView.
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Código do patrocinador <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <Input
            value={sponsorCode}
            onChange={e => setSponsorCode(e.target.value)}
            placeholder="Username de quem te indicou"
            className="bg-gray-800 border-gray-700 text-white"
            disabled={isLoading}
          />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </div>
        )}

        <Button
          onClick={handleCheckout}
          disabled={isLoading || isGuest === null}
          className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold text-base"
          size="lg"
        >
          {isGuest === null ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A verificar sessão...</>
          ) : isLoading ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
          ) : (
            <>Avançar para Pagamento <ArrowRight className="ml-2 h-5 w-5" /></>
          )}
        </Button>

        <p className="text-xs text-gray-500 text-center mt-3">
          Pagamento seguro via Stripe · SSL encriptado
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ScannerPage() {
  const [checkoutProduct, setCheckoutProduct] = useState<{ product: ScannerProduct; scannerName: string } | null>(null)
  const [packBilling, setPackBilling] = useState<"monthly" | "semestral" | "lifetime">("monthly")

  const PACK_TOTAL_PRODUCTS: ScannerProduct[] = [
    { id: "pack-monthly",   label: "Mensal",    price: "35€/mês",             planId: "scanners_monthly",   highlight: false },
    { id: "pack-semestral", label: "Semestral", price: "165€", priceNote: "27,50€/mês · pago de 6 em 6 meses", planId: "scanners_semestral", highlight: true },
    { id: "pack-lifetime",  label: "Vitalício", price: "750€", priceNote: "Pagamento único · acesso para sempre",planId: "scanners_lifetime",  highlight: false },
  ]

  const selectedPackProduct = PACK_TOTAL_PRODUCTS.find(p =>
    p.id === `pack-${packBilling}`
  ) || PACK_TOTAL_PRODUCTS[0]

  return (
    <>
      {checkoutProduct && (
        <CheckoutModal
          product={checkoutProduct.product}
          scannerName={checkoutProduct.scannerName}
          onClose={() => setCheckoutProduct(null)}
        />
      )}

      <Breadcrumbs />
      <main className="min-h-screen bg-black text-white relative">
        <ParticleBackground />
        <div className="container mx-auto px-4 py-12 relative z-10 max-w-6xl">

          {/* Header */}
          <div className="text-center mb-14">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Scanners <span className="text-[#D2A63C]">MoreThanMoney™</span>
            </h1>
            <p className="text-gray-300 text-lg max-w-2xl mx-auto">
              Scripts exclusivos de análise técnica para TradingView — desenvolvidos pela equipa MTM para traders sérios.
            </p>
          </div>

          {/* Proteção Legal */}
          <div className="mb-12 p-5 rounded-xl border border-[#D2A63C]/20 bg-[#D2A63C]/5">
            <h2 className="text-sm font-semibold text-[#D2A63C] mb-1">⚖️ Propriedade Intelectual Protegida</h2>
            <p className="text-sm text-gray-400">
              Todos os produtos MTM estão protegidos por direitos de autor. Os nossos scanners utilizam algoritmos
              proprietários de IA para análise de mercado avançada — Goldenzone, SR MTM, Smart Money e KillShot.
              Qualquer reprodução não autorizada é estritamente proibida.
            </p>
          </div>

          {/* Individual Scanners */}
          {SCANNERS.map((scanner) => (
            <div key={scanner.key} className="mb-16">
              <div className="flex flex-col md:flex-row gap-10 items-start">
                {/* Image */}
                <div className="w-full md:w-1/2 shrink-0">
                  <div className="relative">
                    {scanner.badge && (
                      <div className="absolute top-3 left-3 z-10 bg-[#D2A63C] text-black text-xs font-bold px-3 py-1 rounded-full">
                        {scanner.badge}
                      </div>
                    )}
                    <img
                      src={scanner.image}
                      alt={`${scanner.name} Preview`}
                      className="w-full h-auto rounded-xl border border-[#D2A63C]/20 shadow-lg"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="w-full md:w-1/2">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-white">{scanner.name}</h2>
                    <p className="text-[#D2A63C] font-medium text-sm mt-0.5">{scanner.subtitle}</p>
                  </div>

                  <p className="text-gray-300 mb-5 leading-relaxed">{scanner.description}</p>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <h4 className="text-sm font-semibold text-[#D2A63C] mb-2 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" /> Funcionalidades
                      </h4>
                      <ul className="space-y-1.5">
                        {scanner.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                            <Check className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[#D2A63C] mb-2 flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" /> Características
                      </h4>
                      <ul className="space-y-1.5">
                        {scanner.techSpecs.map((s) => (
                          <li key={s} className="flex items-start gap-2 text-xs text-gray-300">
                            <Check className="w-3.5 h-3.5 text-[#D2A63C] shrink-0 mt-0.5" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 italic mb-5">
                    🔒 Propriedade Intelectual de RicardoGarciaPT / MoreThanMoney — protegido por direitos de autor.
                  </div>

                  {/* Pricing for individual scanner */}
                  {scanner.products.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {scanner.products.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => setCheckoutProduct({ product, scannerName: scanner.name })}
                          className={`flex flex-col items-center px-5 py-3 rounded-xl border-2 transition-all hover:scale-105 ${
                            product.highlight
                              ? "border-[#D2A63C] bg-[#D2A63C]/10 text-white"
                              : "border-gray-700 bg-gray-900/60 text-gray-200 hover:border-gray-500"
                          }`}
                        >
                          <span className="text-xs text-gray-400 mb-0.5">{product.label}</span>
                          <span className={`font-bold text-lg ${product.highlight ? "text-[#D2A63C]" : ""}`}>
                            {product.price}
                          </span>
                          {product.priceNote && (
                            <span className="text-xs text-gray-500 mt-0.5">{product.priceNote}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-xl p-4">
                      <p className="text-sm text-[#D2A63C] font-medium">
                        ✨ O Sensei está incluído no <strong>Pack Scanners</strong>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Ver preços abaixo ↓</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Pack Scanners */}
          <div className="mb-16">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-full px-4 py-1.5 text-[#D2A63C] text-sm font-medium mb-4">
                <Star className="w-4 h-4" /> Melhor Valor
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Pack Scanners</h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Acesso a todos os scanners MTM — Gold Killer, MTM Scanner V3.4 e Sensei — num único pack.
              </p>
            </div>

            {/* Billing Toggle */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex rounded-xl bg-gray-900 p-1 border border-gray-800">
                {(["monthly", "semestral", "lifetime"] as const).map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setPackBilling(cycle)}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      packBilling === cycle
                        ? "bg-[#D2A63C] text-black shadow"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {cycle === "monthly" ? "Mensal" : cycle === "semestral" ? "Semestral" : "Vitalício"}
                    {cycle === "semestral" && (
                      <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
                        -21%
                      </span>
                    )}
                    {cycle === "lifetime" && (
                      <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">
                        ∞
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* What's included */}
              <div className="md:col-span-2 bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                <h3 className="font-semibold text-white mb-4">O que está incluído</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {["MTM Gold Killer V2.1", "Scanner MTM V3.4", "Sensei"].map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-[#D2A63C] rounded-full shrink-0" />
                      <span className="text-sm text-gray-300">{name}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                    <span className="text-sm text-gray-300">Atualizações incluídas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                    <span className="text-sm text-gray-300">Suporte prioritário</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                    <span className="text-sm text-gray-300">Acesso TradingView</span>
                  </div>
                </div>
              </div>

              {/* Price + CTA */}
              <div
                className="bg-[#D2A63C]/10 border-2 border-[#D2A63C]/50 rounded-2xl p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="text-3xl font-black text-[#D2A63C]">{selectedPackProduct.price}</div>
                  {selectedPackProduct.priceNote && (
                    <p className="text-xs text-gray-400 mt-1">{selectedPackProduct.priceNote}</p>
                  )}
                </div>
                <Button
                  onClick={() => setCheckoutProduct({ product: selectedPackProduct, scannerName: "Pack Scanners" })}
                  className="mt-6 w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
                  size="lg"
                >
                  Obter Acesso <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <Card className="bg-gray-900/60 border-gray-800">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] flex items-center gap-2 text-base">
                  <BarChart3 className="w-5 h-5" /> Como Funciona
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4 text-sm">
                  Após o pagamento recebes um email com o teu nome de utilizador TradingView adicionado ao script. Basta acederes ao TradingView e adicionar o indicador à tua biblioteca.
                </p>
                <ul className="space-y-2 text-sm text-gray-300">
                  {["Acesso em minutos após pagamento", "Análise em tempo real 24/7", "Alertas automáticos no TradingView", "Atualizações gratuitas incluídas"].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-[#D2A63C] rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gray-900/60 border-gray-800">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] flex items-center gap-2 text-base">
                  <Shield className="w-5 h-5" /> Resultados Documentados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-300">
                  {[
                    "Taxa de precisão: 85%+",
                    "Redução de perdas: 60%+",
                    "Melhoria de timing: 70%+",
                    "ROI médio documentado: 20%+",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500 mt-4">
                  Resultados passados não garantem resultados futuros. Trading envolve risco.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* CTA Final */}
          <div className="text-center bg-gradient-to-r from-[#D2A63C]/10 to-purple-900/10 border border-[#D2A63C]/20 rounded-2xl p-10">
            <h2 className="text-3xl font-bold text-white mb-3">Pronto para elevar o teu trading?</h2>
            <p className="text-gray-300 mb-6 max-w-xl mx-auto">
              Junte-se à comunidade MTM e começa a usar as mesmas ferramentas que os nossos traders profissionais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => setCheckoutProduct({ product: PACK_TOTAL_PRODUCTS[1], scannerName: "Pack Scanners" })}
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold px-8"
                size="lg"
              >
                Ver Pack Scanners <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Link href="/register">
                <Button variant="outline" className="border-gray-700 text-white hover:bg-gray-800" size="lg">
                  Ver Todos os Planos MTM
                </Button>
              </Link>
            </div>
          </div>

        </div>
      </main>
    </>
  )
}

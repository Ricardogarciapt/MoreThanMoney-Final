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

import { SCANNERS, type ScannerProduct } from "@/lib/scanners-catalog"
import { CheckoutModal } from "@/components/scanner/checkout-modal"
import { SCANNER_LANDINGS } from "@/lib/scanner-landings"

const landingSlug = (key: string) => SCANNER_LANDINGS.find((l) => l.key === key)?.slug

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ScannerPage() {
  const [checkoutProduct, setCheckoutProduct] = useState<{ product: ScannerProduct; scannerName: string } | null>(null)
  // Pack de todos os scanners: só mensal, 35 €/mês (23/10/2026). Os planos semestral e vitalício do
  // pack deixaram de se vender aqui; o webhook continua a reconhecê-los para quem já os comprou.
  const selectedPackProduct: ScannerProduct = {
    id: "pack-monthly", label: "Mensal", price: "35€/mês", priceNote: "Todos os scanners · cancelas quando quiseres", planId: "scanners_monthly", highlight: true,
  }

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
            <div key={scanner.key} id={scanner.key} className="mb-16 scroll-mt-24">
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
                  {scanner.gallery && scanner.gallery.length > 1 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {scanner.gallery.slice(1).map((src) => (
                        <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                          <img
                            src={src}
                            alt={`${scanner.name} no gráfico`}
                            loading="lazy"
                            className="w-full h-auto rounded-lg border border-gray-800 hover:border-[#D2A63C]/50 transition-colors"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="w-full md:w-1/2">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-white">{scanner.name}</h2>
                    <p className="text-[#D2A63C] font-medium text-sm mt-0.5">{scanner.subtitle}</p>
                    {landingSlug(scanner.key) && (
                      <Link href={`/scanner/${landingSlug(scanner.key)}`} className="inline-flex items-center gap-1 text-sm text-gray-300 hover:text-[#E9C46A] mt-2">
                        Ver apresentação <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
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
          <div id="pack" className="mb-16 scroll-mt-24">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-full px-4 py-1.5 text-[#D2A63C] text-sm font-medium mb-4">
                <Star className="w-4 h-4" /> Melhor Valor
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Pack Scanners</h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Todos os scanners MTM num só pack, por 35€/mês — Gold Killer, Aurum Flow, Scanner V3.4, TrendShot e Sensei.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* What's included */}
              <div className="md:col-span-2 bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                <h3 className="font-semibold text-white mb-4">O que está incluído</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {["MTM Gold Killer V2.1", "Aurum Flow Cripto", "Scanner MTM V3.4", "TrendShot by MTM", "Sensei"].map((name) => (
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
                  <Shield className="w-5 h-5" /> Preços simples
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-300">
                  {[
                    "Cada scanner: 50€ por semestre",
                    "Cada scanner vitalício: 350€, pagamento único",
                    "Pack com todos os scanners: 35€/mês",
                    "Sem fidelização no pack mensal",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500 mt-4">
                  Conteúdo educativo, não constitui consultoria financeira. Resultados não garantidos; trading envolve risco.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* CTA Final */}
          <div className="text-center bg-gradient-to-r from-[#D2A63C]/10 to-purple-900/10 border border-[#D2A63C]/20 rounded-2xl p-10">
            <h2 className="text-3xl font-bold text-white mb-3">Pronto para elevar o teu trading?</h2>
            <p className="text-gray-300 mb-6 max-w-xl mx-auto">
              Junta-te à comunidade MTM e começa a usar as mesmas ferramentas que os nossos traders profissionais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => setCheckoutProduct({ product: selectedPackProduct, scannerName: "Pack Scanners" })}
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

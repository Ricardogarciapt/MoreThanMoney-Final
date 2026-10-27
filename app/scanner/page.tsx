"use client"

// Página /scanner: catálogo dos scanners MTM com compra direta (checkout Stripe), o Pack
// Scanners e, ao lado de cada nome, o botão para a landing desse scanner. Mesmo visual das
// landings /scanner/<slug>: carvão, ouro, Unbounded nos títulos.

import { useState } from "react"
import Link from "next/link"
import { Unbounded } from "next/font/google"
import Breadcrumbs from "@/components/breadcrumbs"
import { ArrowRight, ArrowDown, BarChart3, Check, Lock, Shield, Zap } from "lucide-react"

import { SCANNERS, type ScannerProduct } from "@/lib/scanners-catalog"
import { CheckoutModal } from "@/components/scanner/checkout-modal"
import { SCANNER_LANDINGS } from "@/lib/scanner-landings"

const display = Unbounded({ subsets: ["latin"], weight: ["600", "800"], display: "swap" })

const landingOf = (key: string) => SCANNER_LANDINGS.find((l) => l.key === key)

// Pack de todos os scanners: só mensal, 35 €/mês (23/10/2026). Os planos semestral e vitalício do
// pack deixaram de se vender aqui; o webhook continua a reconhecê-los para quem já os comprou.
const PACK: ScannerProduct = {
  id: "pack-monthly", label: "Mensal", price: "35€/mês", priceNote: "Todos os scanners · cancelas quando quiseres", planId: "scanners_monthly", highlight: true,
}

const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

function HowItWorksLink({ slug, size = "md" }: { slug: string; size?: "sm" | "md" }) {
  return (
    <Link
      href={`/scanner/${slug}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#D2A63C]/60 bg-[#D2A63C]/10 font-semibold text-[#E9C46A] transition-colors hover:bg-[#D2A63C] hover:text-black ${
        size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
      }`}
    >
      Saber aqui como funciona <ArrowRight className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </Link>
  )
}

export default function ScannerPage() {
  const [checkoutProduct, setCheckoutProduct] = useState<{ product: ScannerProduct; scannerName: string } | null>(null)
  const buyPack = () => setCheckoutProduct({ product: PACK, scannerName: "Pack Scanners" })

  return (
    <>
      {checkoutProduct && (
        <CheckoutModal product={checkoutProduct.product} scannerName={checkoutProduct.scannerName} onClose={() => setCheckoutProduct(null)} />
      )}

      <Breadcrumbs />
      <main className="relative min-h-screen overflow-x-clip bg-[#08080a] text-[#f4f3ef]">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-280px] h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(210,166,60,0.2),transparent)] blur-2xl" />

        {/* HERO */}
        <section className="relative mx-auto max-w-[1320px] px-4 pb-10 pt-14 sm:px-8 md:pt-20">
          <h1 className={`${display.className} max-w-[16ch] text-[clamp(2.2rem,5.6vw,4.8rem)] font-extrabold uppercase leading-[0.98] tracking-[-0.035em]`}>
            Scanners MTM. <span className="text-[#D2A63C]">Regras no teu gráfico.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg text-[#a9a7a0]">
            Scripts de análise técnica para o TradingView, feitos pela equipa MoreThanMoney. Sinal, stop e alvos desenhados antes de entrares.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => goTo("lista")}
              className="inline-flex items-center gap-2 rounded-full bg-[#D2A63C] px-6 py-3 font-semibold text-[#120e04] transition hover:-translate-y-0.5 hover:bg-[#E9C46A]"
            >
              Ver os scanners <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => goTo("pack")}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 font-semibold transition hover:bg-white/10"
            >
              Pack com todos por 35€/mês
            </button>
          </div>

          {/* Atalhos para cada scanner */}
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SCANNERS.map((s) => {
              const l = landingOf(s.key)
              return (
                <div key={s.key} className="flex flex-col justify-between gap-4 rounded-[22px] border border-white/10 bg-[#111114] p-5">
                  <button type="button" onClick={() => goTo(s.key)} className="text-left">
                    <span className="block font-bold leading-tight">{s.name}</span>
                    <span className="mt-1 block text-xs text-[#a9a7a0]">{s.subtitle}</span>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#E9C46A]">{s.products.length ? `desde ${s.products[0].price}` : "no Pack"}</span>
                    {l && <HowItWorksLink slug={l.slug} size="sm" />}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* PROPRIEDADE INTELECTUAL */}
        <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
          <div className="flex items-start gap-3 rounded-[22px] border border-[#D2A63C]/20 bg-[#D2A63C]/5 p-5">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#D2A63C]" />
            <p className="text-sm text-[#a9a7a0]">
              <strong className="text-[#E9C46A]">Propriedade intelectual protegida.</strong> Todos os produtos MTM estão protegidos por direitos de autor.
              Os nossos scanners utilizam algoritmos proprietários de análise de mercado (Goldenzone, SR MTM, Smart Money e TrendShot). Qualquer reprodução
              não autorizada é estritamente proibida.
            </p>
          </div>
        </div>

        {/* SCANNERS */}
        <section id="lista" className="mx-auto max-w-[1320px] scroll-mt-24 space-y-8 px-4 py-16 sm:px-8 md:py-24">
          {SCANNERS.map((scanner) => {
            const l = landingOf(scanner.key)
            const features = l?.features ?? scanner.features
            const specs = l?.specs ?? scanner.techSpecs
            return (
              <article
                key={scanner.key}
                id={scanner.key}
                className="scroll-mt-24 rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-2"
              >
                <div className="grid gap-8 rounded-[22px] bg-[#0f0f12] p-5 md:p-8 lg:grid-cols-[1.05fr_1fr]">
                  {/* Imagens */}
                  <div>
                    <div className="relative overflow-hidden rounded-[18px] border border-white/10">
                      {scanner.badge && (
                        <span className="absolute left-3 top-3 z-10 rounded-full bg-[#D2A63C] px-3 py-1 text-xs font-bold text-[#120e04]">{scanner.badge}</span>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scanner.image} alt={`${scanner.name} Preview`} className="h-auto w-full" />
                    </div>
                    {scanner.gallery && scanner.gallery.length > 1 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {scanner.gallery.slice(1).map((src) => (
                          <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`${scanner.name} no gráfico`} loading="lazy" className="h-auto w-full rounded-lg border border-white/10 transition-colors hover:border-[#D2A63C]/50" />
                          </a>
                        ))}
                      </div>
                    )}
                    {l?.video && (
                      <Link href={`/scanner/${l.slug}`} className="mt-3 inline-flex items-center gap-2 text-sm text-[#a9a7a0] hover:text-[#E9C46A]">
                        Ver o vídeo e a demonstração 3D <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className={`${display.className} text-2xl font-extrabold uppercase tracking-[-0.02em] md:text-3xl`}>{scanner.name}</h2>
                      {l && <HowItWorksLink slug={l.slug} />}
                    </div>
                    <p className="mt-1 text-sm font-medium text-[#D2A63C]">{scanner.subtitle}</p>
                    <p className="mt-4 leading-relaxed text-[#c9c7c0]">{l?.description ?? scanner.description}</p>

                    <div className="mt-6 grid gap-6 sm:grid-cols-2">
                      <div>
                        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#D2A63C]">
                          <Zap className="h-3.5 w-3.5" /> Funcionalidades
                        </h3>
                        <ul className="space-y-1.5">
                          {features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-sm text-[#a9a7a0]">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22c58b]" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#D2A63C]">
                          <BarChart3 className="h-3.5 w-3.5" /> Características
                        </h3>
                        <ul className="space-y-1.5">
                          {specs.map((s) => (
                            <li key={s} className="flex items-start gap-2 text-sm text-[#a9a7a0]">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D2A63C]" /> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <p className="mt-6 flex items-center gap-2 text-xs italic text-[#75736d]">
                      <Lock className="h-3.5 w-3.5" /> Propriedade intelectual de RicardoGarciaPT / MoreThanMoney, protegida por direitos de autor.
                    </p>

                    <div className="mt-auto pt-6">
                      {scanner.products.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {scanner.products.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => setCheckoutProduct({ product, scannerName: scanner.name })}
                              className={`flex flex-col items-start rounded-[18px] border-2 px-5 py-4 text-left transition hover:-translate-y-0.5 ${
                                product.highlight ? "border-[#D2A63C] bg-[#D2A63C]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                              }`}
                            >
                              <span className="text-xs text-[#a9a7a0]">{product.label}</span>
                              <span className={`${display.className} text-2xl font-extrabold ${product.highlight ? "text-[#E9C46A]" : ""}`}>{product.price}</span>
                              {product.priceNote && <span className="mt-0.5 text-xs text-[#75736d]">{product.priceNote}</span>}
                              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#E9C46A]">
                                Comprar <ArrowRight className="h-4 w-4" />
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-[#D2A63C]/30 bg-[#D2A63C]/10 p-5">
                          <p className="font-medium text-[#E9C46A]">O Sensei está incluído no Pack Scanners.</p>
                          <button type="button" onClick={() => goTo("pack")} className="mt-2 inline-flex items-center gap-1 text-sm text-[#a9a7a0] hover:text-[#E9C46A]">
                            Ver o pack <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </section>

        {/* PACK */}
        <section id="pack" className="mx-auto max-w-[1320px] scroll-mt-24 px-4 pb-16 sm:px-8 md:pb-24">
          <div className="overflow-hidden rounded-[28px] border border-[#D2A63C]/40 bg-[linear-gradient(160deg,rgba(210,166,60,0.18),rgba(210,166,60,0.03)_60%),#0f0f12] p-6 md:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <h2 className={`${display.className} text-[clamp(2rem,4.5vw,3.6rem)] font-extrabold uppercase leading-none tracking-[-0.03em]`}>
                  Pack <span className="text-[#D2A63C]">Scanners.</span>
                </h2>
                <p className="mt-4 max-w-[48ch] text-[#a9a7a0]">
                  Todos os scanners MTM num só pack, por 35€/mês: Gold Killer, Aurum Flow, Scanner MTM, TrendShot, Sensei e Premium Scanner.
                </p>
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {["MTM Gold Killer V2.1", "Aurum Flow", "Scanner MTM", "TrendShot by MTM", "Sensei", "MTM Premium Scanner", "Atualizações incluídas", "Suporte prioritário", "Acesso TradingView"].map((name) => (
                    <li key={name} className="flex items-center gap-2 text-sm text-[#c9c7c0]">
                      <Check className="h-4 w-4 text-[#D2A63C]" /> {name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-[#08080a]/70 p-6">
                <div className={`${display.className} text-5xl font-extrabold text-[#E9C46A]`}>{PACK.price}</div>
                <p className="mt-2 text-sm text-[#a9a7a0]">{PACK.priceNote}</p>
                <button
                  type="button"
                  onClick={buyPack}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-6 py-3.5 font-bold text-[#120e04] transition hover:bg-[#E9C46A]"
                >
                  Obter acesso <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA + PREÇOS */}
        <section className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-16 sm:px-8 md:grid-cols-2 md:pb-24">
          <div className="rounded-[28px] border border-white/10 bg-[#111114] p-7">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#E9C46A]"><BarChart3 className="h-5 w-5" /> Como funciona</h2>
            <p className="mt-3 text-sm text-[#a9a7a0]">
              Após o pagamento recebes um email com o teu nome de utilizador TradingView adicionado ao script. Basta acederes ao TradingView e adicionar o indicador à tua biblioteca.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[#c9c7c0]">
              {["Acesso em minutos após pagamento", "Análise em tempo real 24/7", "Alertas automáticos no TradingView", "Atualizações gratuitas incluídas"].map((item) => (
                <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#D2A63C]" /> {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-[#111114] p-7">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#E9C46A]"><Shield className="h-5 w-5" /> Preços simples</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#c9c7c0]">
              {["Cada scanner: 50€ por semestre", "Cada scanner vitalício: 350€, pagamento único", "Pack com todos os scanners: 35€/mês", "Sem fidelização no pack mensal"].map((item) => (
                <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#22c58b]" /> {item}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[#75736d]">Conteúdo educativo, não constitui consultoria financeira. Resultados não garantidos; trading envolve risco.</p>
          </div>
        </section>

        {/* FECHO */}
        <section className="mx-auto max-w-[1320px] px-4 pb-24 sm:px-8">
          <div className="rounded-[28px] border border-[#D2A63C]/25 bg-[radial-gradient(80%_120%_at_50%_0%,rgba(210,166,60,0.16),transparent_70%),#0f0f12] px-6 py-14 text-center">
            <h2 className={`${display.className} text-[clamp(1.8rem,4vw,3rem)] font-extrabold uppercase leading-none tracking-[-0.03em]`}>
              Pronto para operar <span className="text-[#D2A63C]">com regras?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[#a9a7a0]">
              Junta-te à comunidade MTM e usa as mesmas ferramentas que os nossos traders usam no dia a dia.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" onClick={buyPack} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-7 py-3.5 font-bold text-[#120e04] transition hover:bg-[#E9C46A]">
                Ver Pack Scanners <ArrowRight className="h-5 w-5" />
              </button>
              <Link href="/register" className="inline-flex items-center justify-center rounded-full border border-white/15 px-7 py-3.5 font-semibold transition hover:bg-white/5">
                Ver todos os planos MTM
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

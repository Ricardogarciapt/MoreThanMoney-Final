"use client"

// Landing de venda de um scanner (/scanner/<slug>), no estilo do studify-site:
// hero com vídeo, funcionalidades em bento, passos, ecrãs, preços e FAQ. Sem dependências novas:
// o movimento é CSS + IntersectionObserver e desliga com prefers-reduced-motion.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Unbounded } from "next/font/google"
import { ArrowUpRight, Asterisk, Play, Volume2, VolumeX, Check, Plus } from "lucide-react"
import type { ScannerData, ScannerProduct } from "@/lib/scanners-catalog"
import type { ScannerLanding } from "@/lib/scanner-landings"
import { CheckoutModal } from "@/components/scanner/checkout-modal"
import s from "./scanner-landing.module.css"

const display = Unbounded({ subsets: ["latin"], weight: ["600", "800"], display: "swap" })

// Igual ao pack da página /scanner (35 €/mês, só mensal desde 23/10/2026).
const PACK: ScannerProduct = {
  id: "pack-monthly",
  label: "Pack Scanners",
  price: "35€/mês",
  priceNote: "Todos os scanners · cancelas quando quiseres",
  planId: "scanners_monthly",
}

const FAQ = [
  {
    q: "Como recebo o acesso?",
    a: "No pagamento indicas o teu nome de utilizador do TradingView. O acesso ao script é dado a essa conta e recebes as instruções por email.",
  },
  {
    q: "Preciso de conta paga no TradingView?",
    a: "Não. O script funciona numa conta gratuita do TradingView; alguns limites de alertas e de indicadores por gráfico dependem do teu plano lá.",
  },
  {
    q: "O scanner abre ordens sozinho?",
    a: "Não. É uma ferramenta de análise: mostra a leitura do mercado e os níveis no gráfico. A decisão e a execução são tuas.",
  },
  {
    q: "Qual é a diferença entre semestral, vitalício e pack?",
    a: "O semestral dá 6 meses deste scanner. O vitalício é um pagamento único com acesso sem prazo. O pack dá todos os scanners MTM por 35€/mês e cancelas quando quiseres.",
  },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const els = root.querySelectorAll(`.${s.reveal}`)
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(s.visible)
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return ref
}

export function ScannerLandingView({
  scanner,
  landing,
  others,
}: {
  scanner: ScannerData
  landing: ScannerLanding
  others: { slug: string; name: string }[]
}) {
  const root = useReveal()
  const video = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [checkout, setCheckout] = useState<{ product: ScannerProduct; name: string } | null>(null)

  const plans = scanner.products
  const mainPlan = plans.find((p) => p.highlight) ?? plans[0] ?? PACK
  const buy = (product: ScannerProduct = mainPlan) =>
    setCheckout({ product, name: product === PACK ? "Pack Scanners" : scanner.name })
  const buyLabel = plans.length ? `Comprar por ${mainPlan.price}` : `Pack por ${PACK.price}`

  const gallery = scanner.gallery?.length ? scanner.gallery : [scanner.image]

  const playWithSound = () => {
    const v = video.current
    if (!v) return
    v.currentTime = 0
    v.muted = false
    setMuted(false)
    v.play().catch(() => {})
    v.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  const toggleSound = () => {
    const v = video.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  return (
    <div ref={root} className={s.page}>
      {checkout && (
        <CheckoutModal product={checkout.product} scannerName={checkout.name} onClose={() => setCheckout(null)} />
      )}
      <div className={s.grain} aria-hidden="true" />

      {/* HERO */}
      <section className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <div className={`${s.container} ${s.heroGrid}`}>
          <h1 className={`${display.className} ${s.heroTitle}`}>
            <span className={s.line}><span className={s.rise}>{landing.title[0]}</span></span>
            <span className={s.line}><span className={`${s.rise} ${s.gold}`}>{landing.title[1]}</span></span>
          </h1>
          <div className={s.heroSide}>
            <p className={`${s.heroSub} ${s.fadeIn}`}>{landing.sub}</p>
            <div className={`${s.ctas} ${s.fadeIn}`}>
              <button type="button" className={s.btnGold} onClick={() => buy()}>
                {buyLabel}
                <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </button>
              {landing.video && (
                <button type="button" className={s.btnGlass} onClick={playWithSound}>
                  <Play size={16} fill="currentColor" /> Ver com som
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={s.stage}>
          <div className={`${s.frame} ${s.stageFrame}`}>
            <div className={s.core}>
              {landing.video ? (
                <>
                  <video
                    ref={video}
                    src={landing.video}
                    poster={landing.poster ?? scanner.image}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={`Vídeo de apresentação do ${scanner.name}`}
                  />
                  <button type="button" className={s.soundBtn} onClick={toggleSound} aria-label={muted ? "Ligar o som" : "Desligar o som"}>
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scanner.image} alt={`${scanner.name} no gráfico do TradingView`} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAIXA DE MERCADOS */}
      <div className={s.marquee} aria-label={landing.markets.join(", ")}>
        <div className={s.marqueeTrack} aria-hidden="true">
          {[...landing.markets, ...landing.markets, ...landing.markets, ...landing.markets].map((m, i) => (
            <span key={i}>{m}<Asterisk size={18} strokeWidth={2.5} /></span>
          ))}
        </div>
      </div>

      {/* FUNCIONALIDADES */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            O que vês <span className={s.gold}>no gráfico.</span>
          </h2>
          <div className={s.bento}>
            {scanner.features.map((f, i) => (
              <article key={f} className={`${s.tile} ${s[`tile${i}`]} ${s.reveal}`}>
                {i === 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={s.tileImg} src={gallery[0]} alt="" loading="lazy" />
                )}
                <p className={s.tileText}>{f}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className={`${s.section} ${s.how}`}>
        <div className={`${s.container} ${s.howGrid}`}>
          <div className={s.howSticky}>
            <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>Do pagamento ao gráfico.</h2>
            <p className={`${s.body} ${s.reveal}`}>{scanner.description}</p>
          </div>
          <ol className={s.steps}>
            <li className={`${s.step} ${s.reveal}`}>
              <h3 className={display.className}>Escolhes o plano.</h3>
              <p>{plans.length ? "Semestral, vitalício ou o pack com todos os scanners." : "O Sensei vem no Pack Scanners, com todos os scanners MTM."} Pagas com segurança pelo Stripe.</p>
            </li>
            <li className={`${s.step} ${s.reveal}`}>
              <h3 className={display.className}>Dás o teu TradingView.</h3>
              <p>Indicas o teu nome de utilizador no pagamento. É a essa conta que o acesso é dado.</p>
            </li>
            <li className={`${s.step} ${s.reveal}`}>
              <h3 className={display.className}>Abres o gráfico.</h3>
              <p>Recebes as instruções por email e o script aparece nos teus indicadores, pronto a usar.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ECRÃS + ESPECIFICAÇÕES */}
      <section className={s.section}>
        <div className={s.container}>
          <div className={s.shots}>
            {gallery.map((src, i) => (
              <figure key={src} className={`${s.frame} ${s.reveal} ${i === 0 ? s.shotMain : ""}`}>
                <div className={s.core}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${scanner.name}, exemplo no gráfico ${i + 1}`} loading="lazy" />
                </div>
              </figure>
            ))}
          </div>
          <ul className={s.specs}>
            {scanner.techSpecs.map((t) => (
              <li key={t} className={s.reveal}>
                <Check size={18} className={s.gold} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PREÇO */}
      <section className={s.section} id="comprar">
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            Escolhe <span className={s.gold}>o teu acesso.</span>
          </h2>
          <div className={s.pricing}>
            {plans.map((p) => (
              <div key={p.id} className={`${s.plan} ${p.highlight ? s.planHi : ""} ${s.reveal}`}>
                <span className={s.planLabel}>{p.label}</span>
                <span className={`${display.className} ${s.planPrice}`}>{p.price}</span>
                <span className={s.planNote}>{p.priceNote}</span>
                <button type="button" className={p.highlight ? s.btnGold : s.btnGlass} onClick={() => buy(p)}>
                  Comprar {p.label.toLowerCase()}
                </button>
              </div>
            ))}
            <div className={`${s.plan} ${plans.length ? "" : s.planHi} ${s.reveal}`}>
              <span className={s.planLabel}>Pack Scanners</span>
              <span className={`${display.className} ${s.planPrice}`}>{PACK.price}</span>
              <span className={s.planNote}>{PACK.priceNote}</span>
              <button type="button" className={plans.length ? s.btnGlass : s.btnGold} onClick={() => buy(PACK)}>
                Assinar o pack
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.section}>
        <div className={`${s.container} ${s.faqWrap}`}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>Perguntas.</h2>
          <div>
            {FAQ.map((f) => (
              <details key={f.q} className={`${s.faq} ${s.reveal}`}>
                <summary>
                  {f.q} <Plus size={18} />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FECHO */}
      <section className={s.final}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.finalTitle} ${s.reveal}`}>{scanner.name}</h2>
          <button type="button" className={`${s.btnGold} ${s.reveal}`} onClick={() => buy()}>
            {buyLabel}
            <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
          </button>
          <nav className={s.others} aria-label="Outros scanners">
            {others.map((o) => (
              <Link key={o.slug} href={`/scanner/${o.slug}`}>{o.name}</Link>
            ))}
            <Link href="/scanner">Todos os scanners</Link>
          </nav>
          <p className={s.disclaimer}>
            Ferramenta educativa de análise técnica. Não executa ordens nem garante resultados. Trading envolve risco de perda de capital.
          </p>
        </div>
      </section>
    </div>
  )
}

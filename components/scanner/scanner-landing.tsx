"use client"

// Landing de venda de um scanner (/scanner/<slug>), no estilo evolutivo do studify-site e
// pensada como funil: promessa e vídeo, porquê um scanner, demonstração 3D presa ao scroll,
// pontos-chave do script ilustrados, sem vs com, como funciona, preço e fecho, com uma barra de
// compra fixa pelo meio. O movimento sai do scroll (variável --p), sem listeners de scroll, e
// desliga com prefers-reduced-motion.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Unbounded } from "next/font/google"
import { ArrowUpRight, ArrowDown, Asterisk, BellRing, Check, Layers, Play, Plus, Ruler, Target, Volume2, VolumeX, X as XIcon } from "lucide-react"
import type { ScannerData, ScannerProduct } from "@/lib/scanners-catalog"
import type { ScannerLanding } from "@/lib/scanner-landings"
import { CheckoutModal } from "@/components/scanner/checkout-modal"
import { ScannerChart3D } from "@/components/scanner/scanner-chart-3d"
import { ScannerKeyCards } from "@/components/scanner/scanner-key-cards"
import { CARD_TEXT } from "@/components/scanner/sim/scanner-sim"
import { useScrollProgress } from "@/components/scanner/use-scroll-progress"
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

// Vantagens de operar com um scanner: gerais e verdadeiras para qualquer um dos cinco.
const PORQUE = [
  { icon: Target, title: "Regras em vez de palpites", text: "O sinal aparece quando as condições se cumprem, não quando te apetece entrar." },
  { icon: Ruler, title: "Risco definido antes de entrar", text: "Entrada, stop e alvos desenhados no momento do sinal. Sabes o que arriscas." },
  { icon: BellRing, title: "Alertas no telemóvel", text: "O TradingView avisa-te quando há sinal. Não precisas de estar colado ao ecrã." },
  { icon: Layers, title: "A mesma leitura em todo o lado", text: "Ouro, forex, índices ou cripto, no timeframe que usas, com as mesmas regras." },
]

const SEM = [
  "Entradas por impulso, a meio do movimento",
  "O stop decide-se depois, quando o preço já vai contra",
  "Horas a olhar para o gráfico à espera de um sinal",
  "Cada análise é diferente da anterior",
]

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
  {
    q: "A animação da página mostra resultados reais?",
    a: "Não. A demonstração usa preços gerados para mostrar como o scanner desenha os sinais e os níveis. Resultados passados não garantem resultados futuros.",
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
  const heroRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<HTMLElement>(null)
  const panRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const priceRef = useRef<HTMLElement>(null)
  const [muted, setMuted] = useState(true)
  const [checkout, setCheckout] = useState<{ product: ScannerProduct; name: string } | null>(null)
  const [panDist, setPanDist] = useState(0)
  const [barOn, setBarOn] = useState(false)
  useScrollProgress(stageRef, "enter")
  const simProgress = useScrollProgress(simRef, "pin")
  useScrollProgress(panRef, "pin")

  const plans = scanner.products
  const mainPlan = plans.find((p) => p.highlight) ?? plans[0] ?? PACK
  const buy = (product: ScannerProduct = mainPlan) =>
    setCheckout({ product, name: product === PACK ? "Pack Scanners" : scanner.name })
  const buyLabel = plans.length ? `Quero o ${scanner.name.replace(/^MTM /, "")}` : "Quero o Pack"
  const gallery = scanner.gallery?.length ? scanner.gallery : [scanner.image]
  const cardTitles = ((CARD_TEXT as Record<string, { title: string }[]>)[landing.slug] ?? []).map((c) => c.title)
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  // Distância do pan = largura do trilho menos o ecrã; só em ecrãs largos (no telemóvel é scroll lateral).
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const wide = window.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)").matches
      setPanDist(wide ? Math.max(0, track.scrollWidth - window.innerWidth) : 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  // Barra de compra: aparece depois do hero e esconde-se quando a secção de preços está à vista.
  useEffect(() => {
    const hero = heroRef.current, price = priceRef.current
    if (!hero || !price) return
    let pastHero = false, atPrice = false
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) pastHero = !e.isIntersecting
        if (e.target === price) atPrice = e.isIntersecting
      }
      setBarOn(pastHero && !atPrice)
    }, { threshold: 0 })
    io.observe(hero)
    io.observe(price)
    return () => io.disconnect()
  }, [])

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
      <section ref={heroRef} className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <div className={`${s.container} ${s.heroGrid}`}>
          <h1 className={`${display.className} ${s.heroTitle}`}>
            <span className={s.line}><span className={s.rise}>{landing.title[0]}</span></span>
            <span className={s.line}><span className={`${s.rise} ${s.gold}`}>{landing.title[1]}</span></span>
          </h1>
          <div className={s.heroSide}>
            <p className={`${s.heroSub} ${s.fadeIn}`}>{landing.sub}</p>
            <div className={`${s.ctas} ${s.fadeIn}`}>
              <button type="button" className={s.btnGold} onClick={() => goTo("comprar")}>
                {buyLabel}
                <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </button>
              <button type="button" className={s.btnGlass} onClick={() => goTo("demo")}>
                Ver a demonstração <ArrowDown size={16} />
              </button>
            </div>
          </div>
        </div>

        <div ref={stageRef} className={s.stage}>
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
                  {muted && (
                    <button type="button" className={s.playBig} onClick={playWithSound}>
                      <Play size={18} fill="currentColor" /> Ver com som
                    </button>
                  )}
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

      {/* PORQUÊ UM SCANNER */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            Porquê operar <span className={s.gold}>com um scanner.</span>
          </h2>
          <div className={s.why}>
            {PORQUE.map(({ icon: Icon, title, text }) => (
              <div key={title} className={`${s.whyItem} ${s.reveal}`}>
                <span className={s.whyIcon}><Icon size={22} strokeWidth={1.8} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMONSTRAÇÃO 3D: fica presa ao ecrã e o scanner desenha o mercado à medida que desces */}
      <section id="demo" ref={simRef} className={s.simPin} aria-label={`Demonstração 3D do ${scanner.name}`}>
        <div className={s.simSticky}>
          <div className={s.container}>
            <h2 className={`${display.className} ${s.simTitle}`}>
              Vê-o <span className={s.gold}>a trabalhar.</span>
            </h2>
            <ScannerChart3D slug={landing.slug} progress={simProgress} tall />
          </div>
        </div>
      </section>

      {/* PONTOS-CHAVE DO SCRIPT: pan horizontal com cada ponto ilustrado */}
      <section ref={panRef} className={s.pan} style={{ ["--dist" as string]: `${panDist}px`, height: panDist ? `calc(100dvh + ${panDist}px)` : undefined }}>
        <div className={s.panSticky}>
          <div ref={trackRef} className={s.panTrack}>
            <div className={s.panIntro}>
              <h2 className={`${display.className} ${s.sectionTitle}`}>
                O que vês <span className={s.gold}>no gráfico.</span>
              </h2>
              <p className={s.body}>{landing.description ?? scanner.description}</p>
            </div>
            <ScannerKeyCards slug={landing.slug} numClass={`${display.className} ${s.panNum}`} />
            {gallery.map((src, i) => (
              <figure key={src} className={`${s.frame} ${s.panShot}`}>
                <div className={s.core}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${scanner.name} no TradingView, exemplo ${i + 1}`} loading="lazy" />
                </div>
                <figcaption>Captura real no TradingView.</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* SEM vs COM */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            A diferença <span className={s.gold}>no dia a dia.</span>
          </h2>
          <div className={s.versus}>
            <div className={`${s.vsCol} ${s.reveal}`}>
              <h3>Sem scanner</h3>
              <ul>
                {SEM.map((t) => (
                  <li key={t}><XIcon size={18} className={s.vsNo} /> {t}</li>
                ))}
              </ul>
            </div>
            <div className={`${s.vsCol} ${s.vsWith} ${s.reveal}`}>
              <h3>Com o {scanner.name}</h3>
              <ul>
                {cardTitles.map((t) => (
                  <li key={t}><Check size={18} className={s.gold} /> {t}</li>
                ))}
              </ul>
              <button type="button" className={s.btnGold} onClick={() => goTo("comprar")}>
                Ver planos <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className={`${s.section} ${s.how}`}>
        <div className={`${s.container} ${s.howGrid}`}>
          <div className={s.howSticky}>
            <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>Do pagamento ao gráfico.</h2>
            <p className={`${s.body} ${s.reveal}`}>Três passos e o scanner está no teu TradingView, nos teus mercados e timeframes.</p>
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

      {/* ESPECIFICAÇÕES */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            Os detalhes <span className={s.gold}>técnicos.</span>
          </h2>
          <ul className={s.specs}>
            {(landing.specs ?? scanner.techSpecs).map((t) => (
              <li key={t} className={s.reveal}>
                <Check size={18} className={s.gold} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PREÇO */}
      <section ref={priceRef} className={s.section} id="comprar">
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            Escolhe <span className={s.gold}>o teu acesso.</span>
          </h2>
          <div className={s.pricing}>
            {plans.map((p) => (
              <div key={p.id} className={`${s.plan} ${p.highlight ? s.planHi : ""} ${s.reveal}`}>
                {p.highlight && <span className={s.planBadge}>Acesso sem prazo</span>}
                <span className={s.planLabel}>{p.label}</span>
                <span className={`${display.className} ${s.planPrice}`}>{p.price}</span>
                <span className={s.planNote}>{p.priceNote}</span>
                <ul className={s.planList}>
                  <li><Check size={16} /> {scanner.name} na tua conta TradingView</li>
                  <li><Check size={16} /> Instruções de ativação por email</li>
                  <li><Check size={16} /> Alertas para o telemóvel</li>
                </ul>
                <button type="button" className={p.highlight ? s.btnGold : s.btnGlass} onClick={() => buy(p)}>
                  Comprar {p.label.toLowerCase()}
                </button>
              </div>
            ))}
            <div className={`${s.plan} ${plans.length ? "" : s.planHi} ${s.reveal}`}>
              <span className={s.planLabel}>Pack Scanners</span>
              <span className={`${display.className} ${s.planPrice}`}>{PACK.price}</span>
              <span className={s.planNote}>{PACK.priceNote}</span>
              <ul className={s.planList}>
                <li><Check size={16} /> Gold Killer, Aurum Flow, Scanner MTM, TrendShot e Sensei</li>
                <li><Check size={16} /> Sem fidelização</li>
                <li><Check size={16} /> Alertas para o telemóvel</li>
              </ul>
              <button type="button" className={plans.length ? s.btnGlass : s.btnGold} onClick={() => buy(PACK)}>
                Assinar o pack
              </button>
            </div>
          </div>
          <p className={s.payNote}>Pagamento seguro pelo Stripe. Recebes a confirmação e as instruções no teu email.</p>
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
        <div className={s.finalGlow} aria-hidden="true" />
        <div className={s.container}>
          <h2 className={`${display.className} ${s.finalTitle} ${s.reveal}`}>{scanner.name}</h2>
          <p className={`${s.finalSub} ${s.reveal}`}>{landing.sub}</p>
          <button type="button" className={`${s.btnGold} ${s.reveal}`} onClick={() => goTo("comprar")}>
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

      {/* BARRA DE COMPRA FIXA */}
      <div className={`${s.buyBar} ${barOn ? s.buyBarOn : ""}`} aria-hidden={!barOn}>
        <div className={s.buyBarInner}>
          <div className={s.buyBarText}>
            <b>{scanner.name}</b>
            <span>{plans.length ? `Desde ${plans[0].price} · ou ${mainPlan.price} vitalício` : `Incluído no Pack · ${PACK.price}`}</span>
          </div>
          <button type="button" className={s.btnGold} onClick={() => goTo("comprar")} tabIndex={barOn ? 0 : -1}>
            Ver planos <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
          </button>
        </div>
      </div>
    </div>
  )
}

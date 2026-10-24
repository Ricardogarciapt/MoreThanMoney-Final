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
import { CARD_TEXT_EN } from "@/components/scanner/sim/i18n"
import { UI, priceFor, type Lang } from "@/components/scanner/landing-i18n"
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

const WHY_ICONS = [Target, Ruler, BellRing, Layers]

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
  lang = "pt",
}: {
  scanner: ScannerData
  landing: ScannerLanding
  others: { slug: string; name: string }[]
  lang?: Lang
}) {
  const u = UI[lang]
  const L = lang === "en" && landing.en ? { ...landing, ...landing.en } : landing
  const P = (x: string) => priceFor(lang, x)
  const base = lang === "en" ? "/en" : ""
  const videoSrc = lang === "en" ? landing.videoEn ?? landing.video : landing.video
  const posterSrc = (lang === "en" ? landing.posterEn : undefined) ?? landing.poster ?? scanner.image
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
  const buyLabel = plans.length ? u.wantIt(scanner.name.replace(/^MTM /, "")) : u.wantPack
  const gallery = scanner.gallery?.length ? scanner.gallery : [scanner.image]
  const cardTitles = (((lang === "en" ? CARD_TEXT_EN : CARD_TEXT) as Record<string, { title: string }[]>)[landing.slug] ?? []).map((c) => c.title)
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
        <CheckoutModal product={checkout.product} scannerName={checkout.name} onClose={() => setCheckout(null)} lang={lang} />
      )}
      <div className={s.grain} aria-hidden="true" />

      {/* HERO */}
      <section ref={heroRef} className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <div className={`${s.container} ${s.heroGrid}`}>
          <h1 className={`${display.className} ${s.heroTitle}`}>
            <span className={s.line}><span className={s.rise}>{L.title[0]}</span></span>
            <span className={s.line}><span className={`${s.rise} ${s.gold}`}>{L.title[1]}</span></span>
          </h1>
          <div className={s.heroSide}>
            <nav className={`${s.langSwitch} ${s.fadeIn}`} aria-label="Idioma / Language">
              <Link href={`/scanner/${landing.slug}`} hrefLang="pt-PT" aria-current={lang === "pt" ? "page" : undefined}>PT</Link>
              <Link href={`/en/scanner/${landing.slug}`} hrefLang="en" aria-current={lang === "en" ? "page" : undefined}>EN</Link>
            </nav>
            <p className={`${s.heroSub} ${s.fadeIn}`}>{L.sub}</p>
            <div className={`${s.ctas} ${s.fadeIn}`}>
              <button type="button" className={s.btnGold} onClick={() => goTo("comprar")}>
                {buyLabel}
                <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </button>
              <button type="button" className={s.btnGlass} onClick={() => goTo("demo")}>
                {u.seeDemo} <ArrowDown size={16} />
              </button>
            </div>
          </div>
        </div>

        <div ref={stageRef} className={s.stage}>
          <div className={`${s.frame} ${s.stageFrame}`}>
            <div className={s.core}>
              {videoSrc ? (
                <>
                  <video
                    ref={video}
                    src={videoSrc}
                    poster={posterSrc}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={u.videoLabel(scanner.name)}
                  />
                  {muted && (
                    <button type="button" className={s.playBig} onClick={playWithSound}>
                      <Play size={18} fill="currentColor" /> {u.watchSound}
                    </button>
                  )}
                  <button type="button" className={s.soundBtn} onClick={toggleSound} aria-label={muted ? u.soundOn : u.soundOff}>
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scanner.image} alt={u.chartAlt(scanner.name)} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAIXA DE MERCADOS */}
      <div className={s.marquee} aria-label={L.markets.join(", ")}>
        <div className={s.marqueeTrack} aria-hidden="true">
          {[...L.markets, ...L.markets, ...L.markets, ...L.markets].map((m, i) => (
            <span key={i}>{m}<Asterisk size={18} strokeWidth={2.5} /></span>
          ))}
        </div>
      </div>

      {/* PORQUÊ UM SCANNER */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            {u.whyTitle[0]} <span className={s.gold}>{u.whyTitle[1]}</span>
          </h2>
          <div className={s.why}>
            {u.why.map(({ title, text }, k) => {
              const Icon = WHY_ICONS[k]
              return (
              <div key={title} className={`${s.whyItem} ${s.reveal}`}>
                <span className={s.whyIcon}><Icon size={22} strokeWidth={1.8} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* DEMONSTRAÇÃO 3D: fica presa ao ecrã e o scanner desenha o mercado à medida que desces */}
      <section id="demo" ref={simRef} className={s.simPin} aria-label={u.demoAria(scanner.name)}>
        <div className={s.simSticky}>
          <div className={s.container}>
            <h2 className={`${display.className} ${s.simTitle}`}>
              {u.demoTitle[0]} <span className={s.gold}>{u.demoTitle[1]}</span>
            </h2>
            <ScannerChart3D slug={landing.slug} progress={simProgress} tall lang={lang} />
          </div>
        </div>
      </section>

      {/* PONTOS-CHAVE DO SCRIPT: pan horizontal com cada ponto ilustrado */}
      <section ref={panRef} className={s.pan} style={{ ["--dist" as string]: `${panDist}px`, height: panDist ? `calc(100dvh + ${panDist}px)` : undefined }}>
        <div className={s.panSticky}>
          <div ref={trackRef} className={s.panTrack}>
            <div className={s.panIntro}>
              <h2 className={`${display.className} ${s.sectionTitle}`}>
                {u.keyTitle[0]} <span className={s.gold}>{u.keyTitle[1]}</span>
              </h2>
              <p className={s.body}>{L.description ?? scanner.description}</p>
            </div>
            <ScannerKeyCards slug={landing.slug} numClass={`${display.className} ${s.panNum}`} lang={lang} />
            {gallery.map((src, i) => (
              <figure key={src} className={`${s.frame} ${s.panShot}`}>
                <div className={s.core}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={u.shotAlt(scanner.name, i + 1)} loading="lazy" />
                </div>
                <figcaption>{u.realShot}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* SEM vs COM */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            {u.vsTitle[0]} <span className={s.gold}>{u.vsTitle[1]}</span>
          </h2>
          <div className={s.versus}>
            <div className={`${s.vsCol} ${s.reveal}`}>
              <h3>{u.without}</h3>
              <ul>
                {u.sem.map((t) => (
                  <li key={t}><XIcon size={18} className={s.vsNo} /> {t}</li>
                ))}
              </ul>
            </div>
            <div className={`${s.vsCol} ${s.vsWith} ${s.reveal}`}>
              <h3>{u.withIt(scanner.name)}</h3>
              <ul>
                {cardTitles.map((t) => (
                  <li key={t}><Check size={18} className={s.gold} /> {t}</li>
                ))}
              </ul>
              <button type="button" className={s.btnGold} onClick={() => goTo("comprar")}>
                {u.seePlans} <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className={`${s.section} ${s.how}`}>
        <div className={`${s.container} ${s.howGrid}`}>
          <div className={s.howSticky}>
            <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>{u.howTitle}</h2>
            <p className={`${s.body} ${s.reveal}`}>{u.howSub}</p>
          </div>
          <ol className={s.steps}>
            {u.steps(plans.length > 0).map((st) => (
              <li key={st.t} className={`${s.step} ${s.reveal}`}>
                <h3 className={display.className}>{st.t}</h3>
                <p>{st.p}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ESPECIFICAÇÕES */}
      <section className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>
            {u.specsTitle[0]} <span className={s.gold}>{u.specsTitle[1]}</span>
          </h2>
          <ul className={s.specs}>
            {(L.specs ?? scanner.techSpecs).map((t) => (
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
            {u.priceTitle[0]} <span className={s.gold}>{u.priceTitle[1]}</span>
          </h2>
          <div className={s.pricing}>
            {plans.map((p) => (
              <div key={p.id} className={`${s.plan} ${p.highlight ? s.planHi : ""} ${s.reveal}`}>
                {p.highlight && <span className={s.planBadge}>{u.noExpiry}</span>}
                <span className={s.planLabel}>{u.planLabel(p.label)}</span>
                <span className={`${display.className} ${s.planPrice}`}>{P(p.price)}</span>
                <span className={s.planNote}>{u.planNote(p.priceNote)}</span>
                <ul className={s.planList}>
                  {u.planIncl(scanner.name).map((x) => (
                    <li key={x}><Check size={16} /> {x}</li>
                  ))}
                </ul>
                <button type="button" className={p.highlight ? s.btnGold : s.btnGlass} onClick={() => buy(p)}>
                  {u.buyPlan(u.planLabel(p.label))}
                </button>
              </div>
            ))}
            <div className={`${s.plan} ${plans.length ? "" : s.planHi} ${s.reveal}`}>
              <span className={s.planLabel}>Pack Scanners</span>
              <span className={`${display.className} ${s.planPrice}`}>{P(PACK.price)}</span>
              <span className={s.planNote}>{u.packNote}</span>
              <ul className={s.planList}>
                {u.packIncl.map((x) => (
                  <li key={x}><Check size={16} /> {x}</li>
                ))}
              </ul>
              <button type="button" className={plans.length ? s.btnGlass : s.btnGold} onClick={() => buy(PACK)}>
                {u.subscribePack}
              </button>
            </div>
          </div>
          <p className={s.payNote}>{u.payNote}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.section}>
        <div className={`${s.container} ${s.faqWrap}`}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>{u.faqTitle}</h2>
          <div>
            {u.faq.map((f) => (
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
          <p className={`${s.finalSub} ${s.reveal}`}>{L.sub}</p>
          <button type="button" className={`${s.btnGold} ${s.reveal}`} onClick={() => goTo("comprar")}>
            {buyLabel}
            <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
          </button>
          <nav className={s.others} aria-label={u.others}>
            {others.map((o) => (
              <Link key={o.slug} href={`${base}/scanner/${o.slug}`}>{o.name}</Link>
            ))}
            <Link href="/scanner">{u.allScanners}</Link>
          </nav>
          <p className={s.disclaimer}>
            {u.disclaimer}
          </p>
        </div>
      </section>

      {/* BARRA DE COMPRA FIXA */}
      <div className={`${s.buyBar} ${barOn ? s.buyBarOn : ""}`} aria-hidden={!barOn}>
        <div className={s.buyBarInner}>
          <div className={s.buyBarText}>
            <b>{scanner.name}</b>
            <span>{plans.length ? u.barFrom(P(plans[0].price), P(mainPlan.price)) : u.barPack(P(PACK.price))}</span>
          </div>
          <button type="button" className={s.btnGold} onClick={() => goTo("comprar")} tabIndex={barOn ? 0 : -1}>
            Ver planos <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
          </button>
        </div>
      </div>
    </div>
  )
}

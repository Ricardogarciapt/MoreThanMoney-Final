"use client"

// Landing de venda de um EA (/sensei-ea, /sensei-scalp, /premium-scanner-ea) no mesmo estilo das
// landings dos scanners: hero com animação, faixa de mercados, factos, o que tem lá dentro, como
// trabalha, comparação, preços com a licença por conta MT5, instalação, FAQ e fecho com a barra de
// compra fixa. O pagamento abre o checkout de licenças (/api/licencas/checkout), que emite a chave.

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Unbounded } from "next/font/google"
import { ArrowDown, ArrowRight, ArrowUpRight, Asterisk, Check, Download, FileText, KeyRound, Loader2, Play, Plus, Volume2, VolumeX, type LucideIcon } from "lucide-react"
import s from "@/components/scanner/scanner-landing.module.css"
import e from "./ea-landing.module.css"

const display = Unbounded({ subsets: ["latin"], weight: ["600", "800"], display: "swap" })

export interface EaPlan {
  planId: string
  label: string
  price: string
  note: string
  incl: string[]
  highlight?: boolean
  badge?: string
  buyLabel: string
}

export interface EaLandingData {
  name: string
  eyebrow: string
  title: [string, string]
  sub: string
  markets: string[]
  hero: ReactNode
  /** Vídeo de apresentação: quando existe, ocupa o palco do hero (como nas landings dos scanners). */
  video?: string
  poster?: string
  heroCaption?: string
  heroNote?: ReactNode
  guia?: string
  facts: { valor: string; rotulo: string }[]
  stepsTitle: [string, string]
  stepsSub?: string
  steps: { t: string; d: string }[]
  stepsAside?: ReactNode
  featuresTitle: [string, string]
  featuresSub?: string
  features: { icon: LucideIcon; t: string; d: string }[]
  showcase?: { node: ReactNode; caption: string }[]
  compare?: {
    title: [string, string]
    text: ReactNode
    cols: { name: string; here?: boolean; href?: string; rows: [string, string][] }[]
  }
  cautionTitle?: [string, string]
  cautionSub?: string
  cautions?: { icon: LucideIcon; t: string; d: string }[]
  extra?: ReactNode
  priceTitle: [string, string]
  priceSub: string
  plans: EaPlan[]
  askTradingView?: boolean
  payNote: ReactNode
  install: { text: string; zip: string; zipLabel: string; tip?: ReactNode; downloadMt5?: ReactNode }
  faq: { q: string; a: string }[]
  disclaimer: string
  after?: ReactNode
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add(s.visible)
            io.unobserve(en.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    )
    root.querySelectorAll(`.${s.reveal}`).forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return ref
}

function Title({ t, className = "" }: { t: [string, string]; className?: string }) {
  return (
    <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal} ${className}`}>
      {t[0]} <span className={s.gold}>{t[1]}</span>
    </h2>
  )
}

export function EaLanding({ data: d }: { data: EaLandingData }) {
  const root = useReveal()
  const heroRef = useRef<HTMLElement>(null)
  const priceRef = useRef<HTMLElement>(null)
  const [plan, setPlan] = useState(d.plans.find((p) => p.highlight)?.planId ?? d.plans[0].planId)
  const [email, setEmail] = useState("")
  const [mt5Login, setMt5Login] = useState("")
  const [tvUser, setTvUser] = useState("")
  const [erro, setErro] = useState("")
  const [aEnviar, setAEnviar] = useState(false)
  const [barOn, setBarOn] = useState(false)
  const [muted, setMuted] = useState(true)
  const video = useRef<HTMLVideoElement>(null)
  const playWithSound = () => {
    const v = video.current
    if (!v) return
    v.currentTime = 0
    v.muted = false
    setMuted(false)
    v.play().catch(() => {})
  }
  const toggleSound = () => {
    const v = video.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }
  const chosen = d.plans.find((p) => p.planId === plan) ?? d.plans[0]
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  useEffect(() => {
    const hero = heroRef.current, price = priceRef.current
    if (!hero || !price) return
    let pastHero = false, atPrice = false
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.target === hero) pastHero = !en.isIntersecting
        if (en.target === price) atPrice = en.isIntersecting
      }
      setBarOn(pastHero && !atPrice)
    }, { threshold: 0 })
    io.observe(hero)
    io.observe(price)
    return () => io.disconnect()
  }, [])

  async function comprar() {
    setErro("")
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro("Escreve o teu email — é para lá que vai a chave.")
      return
    }
    if (d.askTradingView && !tvUser.trim()) {
      setErro("Escreve o teu utilizador do TradingView — é com ele que te damos acesso ao indicador.")
      return
    }
    setAEnviar(true)
    try {
      const r = await fetch("/api/licencas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan,
          email: email.trim(),
          mt5Login: mt5Login.replace(/\D/g, ""),
          ...(d.askTradingView ? { tradingviewUsername: tvUser.trim() } : {}),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.url) throw new Error(j.error || "Não foi possível abrir o pagamento")
      window.location.href = j.url
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido")
      setAEnviar(false)
    }
  }

  return (
    <div ref={root} className={s.page}>
      <div className={s.grain} aria-hidden="true" />

      {/* HERO */}
      <section ref={heroRef} className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <div className={`${s.container} ${s.heroGrid}`}>
          <div>
            <span className={`${e.eyebrow} ${s.fadeIn}`}>{d.eyebrow}</span>
            <h1 className={`${display.className} ${s.heroTitle}`}>
              <span className={s.line}><span className={s.rise}>{d.title[0]}</span></span>
              <span className={s.line}><span className={`${s.rise} ${s.gold}`}>{d.title[1]}</span></span>
            </h1>
          </div>
          <div className={s.heroSide}>
            <p className={`${s.heroSub} ${s.fadeIn}`}>{d.sub}</p>
            <div className={`${s.ctas} ${s.fadeIn}`}>
              <button type="button" className={s.btnGold} onClick={() => goTo("comprar")}>
                Comprar licença
                <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </button>
              {d.guia ? (
                <a className={s.btnGlass} href={d.guia} target="_blank" rel="noopener noreferrer">
                  <FileText size={16} /> Ler o guia (PDF)
                </a>
              ) : (
                <button type="button" className={s.btnGlass} onClick={() => goTo("como")}>
                  Como trabalha <ArrowDown size={16} />
                </button>
              )}
            </div>
            {d.heroNote && <p className={`${e.heroNote} ${s.fadeIn}`}>{d.heroNote}</p>}
          </div>
        </div>

        <div className={s.stage}>
          <div className={`${s.frame} ${s.stageFrame}`}>
            {d.video ? (
              <div className={s.core}>
                <video ref={video} src={d.video} poster={d.poster} autoPlay muted loop playsInline preload="metadata" aria-label={`Vídeo de apresentação do ${d.name}`} />
                {muted && (
                  <button type="button" className={s.playBig} onClick={playWithSound}>
                    <Play size={18} fill="currentColor" /> Ver com som
                  </button>
                )}
                <button type="button" className={s.soundBtn} onClick={toggleSound} aria-label={muted ? "Ligar o som" : "Desligar o som"}>
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
            ) : (
              <div className={`${s.core} ${e.heroVisual}`}>{d.hero}</div>
            )}
          </div>
          {!d.video && d.heroCaption && <p className={e.caption}>{d.heroCaption}</p>}
          <div className={e.facts}>
            {d.facts.map((f) => (
              <div key={f.rotulo} className={`${e.fact} ${s.reveal}`}>
                <span className={`${display.className} ${e.factValue}`}>{f.valor}</span>
                <span className={e.factLabel}>{f.rotulo}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAIXA */}
      <div className={s.marquee} aria-label={d.markets.join(", ")} style={{ marginTop: "clamp(48px, 7vw, 96px)" }}>
        <div className={s.marqueeTrack} aria-hidden="true">
          {[...d.markets, ...d.markets, ...d.markets, ...d.markets].map((m, i) => (
            <span key={i}>{m}<Asterisk size={18} strokeWidth={2.5} /></span>
          ))}
        </div>
      </div>

      {/* COMO TRABALHA */}
      <section id="como" className={`${s.section} ${s.how}`}>
        <div className={`${s.container} ${s.howGrid}`}>
          <div className={s.howSticky}>
            <Title t={d.stepsTitle} />
            {d.stepsSub && <p className={`${s.body} ${s.reveal}`}>{d.stepsSub}</p>}
            {d.stepsAside && <div className={s.reveal} style={{ marginTop: 32 }}>{d.stepsAside}</div>}
          </div>
          <ol className={s.steps}>
            {d.steps.map((st) => (
              <li key={st.t} className={`${s.step} ${s.reveal}`}>
                <h3 className={display.className}>{st.t}</h3>
                <p>{st.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* O QUE TEM LÁ DENTRO */}
      <section className={s.section}>
        <div className={s.container}>
          <Title t={d.featuresTitle} />
          {d.featuresSub && <p className={`${s.body} ${s.reveal}`} style={{ marginTop: -24, marginBottom: 40 }}>{d.featuresSub}</p>}
          <div className={s.why}>
            {d.features.map(({ icon: Icon, t, d: txt }) => (
              <div key={t} className={`${s.whyItem} ${s.reveal}`}>
                <span className={s.whyIcon}><Icon size={22} strokeWidth={1.8} /></span>
                <h3>{t}</h3>
                <p>{txt}</p>
              </div>
            ))}
          </div>
          {d.showcase && (
            <div className={e.showcase}>
              {d.showcase.map((sc) => (
                <figure key={sc.caption} className={`${s.frame} ${s.reveal}`}>
                  <div className={s.core}>{sc.node}</div>
                  <figcaption className={e.caption}>{sc.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* COMPARAÇÃO */}
      {d.compare && (
        <section className={s.section}>
          <div className={s.container}>
            <Title t={d.compare.title} />
            <p className={`${s.body} ${s.reveal}`} style={{ marginTop: -24, marginBottom: 40, maxWidth: "70ch" }}>{d.compare.text}</p>
            <div className={e.compare}>
              {d.compare.cols.map((c) => (
                <div key={c.name} className={`${e.compareCol} ${c.here ? e.compareHere : ""} ${s.reveal}`}>
                  <h3>{c.name}</h3>
                  <dl>
                    {c.rows.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.href && (
                    <Link href={c.href}>
                      Ver o {c.name} <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ANTES DE LIGAR */}
      {d.cautions && d.cautionTitle && (
        <section className={s.section}>
          <div className={s.container}>
            <Title t={d.cautionTitle} />
            {d.cautionSub && <p className={`${s.body} ${s.reveal}`} style={{ marginTop: -24, marginBottom: 40 }}>{d.cautionSub}</p>}
            <div className={s.why}>
              {d.cautions.map(({ icon: Icon, t, d: txt }) => (
                <div key={t} className={`${s.whyItem} ${s.reveal}`}>
                  <span className={s.whyIcon}><Icon size={22} strokeWidth={1.8} /></span>
                  <h3>{t}</h3>
                  <p>{txt}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {d.extra}

      {/* PREÇO E LICENÇA */}
      <section ref={priceRef} className={s.section} id="comprar">
        <div className={s.container}>
          <Title t={d.priceTitle} />
          <p className={`${s.body} ${s.reveal}`} style={{ marginTop: -24, marginBottom: 40, maxWidth: "70ch" }}>{d.priceSub}</p>
          <div className={s.pricing}>
            {d.plans.map((p) => (
              <button
                key={p.planId}
                type="button"
                onClick={() => setPlan(p.planId)}
                aria-pressed={plan === p.planId}
                className={`${s.plan} ${p.highlight ? s.planHi : ""} ${e.planPick} ${plan === p.planId ? e.planOn : ""} ${s.reveal}`}
              >
                {p.badge && <span className={s.planBadge}>{p.badge}</span>}
                <span className={s.planLabel}>{p.label}</span>
                <span className={`${display.className} ${s.planPrice}`}>{p.price}</span>
                <span className={s.planNote}>{p.note}</span>
                <ul className={s.planList}>
                  {p.incl.map((x) => (
                    <li key={x}><Check size={16} /> {x}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          <div className={`${e.form} ${s.reveal}`}>
            <div className={e.fields}>
              <label className={e.field}>
                Email
                <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="para onde vai a chave" autoComplete="email" />
              </label>
              {d.askTradingView && (
                <label className={e.field}>
                  Utilizador do TradingView
                  <input value={tvUser} onChange={(ev) => setTvUser(ev.target.value)} placeholder="para o acesso ao indicador" />
                </label>
              )}
              <label className={e.field}>
                Conta MT5 (opcional)
                <input value={mt5Login} inputMode="numeric" onChange={(ev) => setMt5Login(ev.target.value.replace(/\D/g, ""))} placeholder="só dígitos" />
              </label>
            </div>
            <p className={e.formNote}>Ainda não tens conta MT5? Compra na mesma — a licença prende-se à primeira conta onde ligares o EA.</p>
            {erro && <p className={e.error}>{erro}</p>}
            <button type="button" className={s.btnGold} onClick={comprar} disabled={aEnviar}>
              {aEnviar ? (
                <><Loader2 size={16} className="animate-spin" /> A abrir o pagamento…</>
              ) : (
                <><KeyRound size={16} /> {chosen.buyLabel}</>
              )}
            </button>
            <p className={e.formNote}>{d.payNote}</p>
          </div>

          <ol className={s.steps} style={{ marginTop: 40 }}>
            {[
              { t: "1 · Pagas", p: "E indicas o número da conta MT5, se já o tiveres. Se não, deixas em branco." },
              { t: "2 · Recebes a chave", p: "Por email, no formato MTM-XXXX-XXXX-XXXX, com o pacote e o guia." },
              { t: "3 · Instalas", p: "Copias o pacote para o teu MetaTrader — o LEIA-ME e o guia mostram onde fica cada ficheiro." },
              { t: "4 · Colas a chave", p: "No campo «Licença» do EA. Aparece «LICENCA: valida» e podes ligar o AutoTrading." },
            ].map((st) => (
              <li key={st.t} className={`${s.step} ${s.reveal}`}>
                <h3 className={display.className}>{st.t}</h3>
                <p>{st.p}</p>
              </li>
            ))}
          </ol>
          <p className={s.payNote}>
            Uma licença vale para uma conta MT5. Mudaste de corretora? Pedes e libertamos. Se a internet cair, o EA aguenta
            72 horas com a última validação antes de parar de abrir ordens.
          </p>
        </div>
      </section>

      {/* INSTALAR */}
      <section className={s.section}>
        <div className={s.container}>
          <Title t={["Instalar", "e ligar"]} />
          <div className={e.install}>
            <div className={e.downloads}>
              <p className={`${s.body} ${s.reveal}`}>{d.install.text}</p>
              {d.install.downloadMt5}
              <a className={`${s.btnGlass} ${s.reveal}`} href={d.install.zip} download>
                <Download size={16} /> {d.install.zipLabel}
              </a>
              {d.guia && (
                <a className={`${s.btnGlass} ${s.reveal}`} href={d.guia} target="_blank" rel="noopener noreferrer">
                  <FileText size={16} /> Guia em PDF
                </a>
              )}
            </div>
            <div className={`${e.tip} ${s.reveal}`}>
              <h3><KeyRound size={18} className={s.gold} /> O passo onde toda a gente tropeça</h3>
              <p>
                No MetaTrader: <b>Ferramentas → Opções → Consultores</b>. Liga «Permitir WebRequest para os seguintes URLs» e
                acrescenta <code>https://www.morethanmoney.pt</code>. Sem isto a licença não valida — e o erro parece ser da
                chave, mas não é.
              </p>
              {d.install.tip && <p style={{ marginTop: 12 }}>{d.install.tip}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.section}>
        <div className={`${s.container} ${s.faqWrap}`}>
          <h2 className={`${display.className} ${s.sectionTitle} ${s.reveal}`}>Perguntas que nos fazem sempre</h2>
          <div>
            {d.faq.map((f) => (
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
          <h2 className={`${display.className} ${s.finalTitle} ${s.reveal}`}>{d.name}</h2>
          <p className={`${s.finalSub} ${s.reveal}`}>{d.sub}</p>
          <button type="button" className={`${s.btnGold} ${s.reveal}`} onClick={() => goTo("comprar")}>
            Comprar licença
            <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
          </button>
          <nav className={s.others} aria-label="Outros EAs">
            <Link href="/ea">Todos os EAs</Link>
            <Link href="/sensei-ea">MTM Sensei EA</Link>
            <Link href="/sensei-scalp">MTM Sensei Scalp Edition</Link>
            <Link href="/premium-scanner-ea">MTM Premium Scanner EA</Link>
          </nav>
          <p className={s.disclaimer}>{d.disclaimer}</p>
        </div>
      </section>

      {d.after}

      {/* BARRA DE COMPRA FIXA */}
      <div className={`${s.buyBar} ${barOn ? s.buyBarOn : ""}`} aria-hidden={!barOn}>
        <div className={s.buyBarInner}>
          <div className={s.buyBarText}>
            <b>{d.name}</b>
            <span>{d.plans.map((p) => p.price).join(" · ")}</span>
          </div>
          <button type="button" className={s.btnGold} onClick={() => goTo("comprar")} tabIndex={barOn ? 0 : -1}>
            Ver licenças <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
          </button>
        </div>
      </div>
    </div>
  )
}

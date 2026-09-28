"use client"

import { useEffect, useRef, useState } from "react"
import { TESTEMUNHOS, type Testemunho } from "@/lib/testemunhos"
import { useT } from "@/components/i18n-provider"
import { LANDING_CSS } from "@/components/new-landing/styles"
import { mountLandingEffects } from "@/components/new-landing/effects"
import { SNAPSHOT, type LandingStats } from "@/lib/landing-stats"

/**
 * /new-landing — a landing pública.
 *
 * A navbar e o rodapé NÃO vivem aqui: a rota não está em `standalonePaths` do
 * ConditionalNavbarFooter, por isso recebe os globais do site. Tudo o resto (paleta, animações
 * de scroll, demos) está fechado dentro de `.l2` (ver styles.ts) para não vazar.
 *
 * Números: vêm de /api/landing-stats, recalculado pelo cron semanal. Enquanto a resposta não
 * chega mostra-se o SNAPSHOT — nunca um zero a contar para cima.
 *
 * Traduções: namespace `l2.` em lib/i18n/messages/landing2.ts (pt/en completos; os restantes
 * idiomas caem para pt por desenho do dicionário).
 */

const STRIP = [
  "Tap to Trade", "MTM Copy", "Sensei", "GoldKiller", "Aurum Flow", "MTM Scanner", "Alertas MTM",
  "Terminal com IA", "Portefólios cripto", "DCA inteligente", "Bootcamp 30h", "Certificação oficial",
  "Sessões ao vivo", "Feed da comunidade", "Mentor de IA", "Criadores UGC", "Parcerias IB", "Mindset e fitness",
  "Marca pessoal", "Social Media e UGC", "Mindset e Liderança", "Fitness e Bem-Estar", "Ações e ETF",
  "Estúdio MTM Social", "Convida e ganha",
]

/** Sequência real de 20/08/2026 no canal Premium. Os textos do motor não se traduzem: é o que sai. */
const MSGS: Array<{ c: string; t: string; cls?: string; tap?: boolean }> = [
  { c: "Sensei · scanner", t: "7. GOLD BUY SETUP\nGold Buy Zone 4370 – 4365\nSL 4360 · TP1 4375 · TP2 4380 · TP3 4385" },
  { c: "na tua app", t: "⚡ Nova ideia Premium — XAUUSD", cls: "act", tap: true },
  { c: "a tua conta", t: "✅ ENTRY HIT · XAUUSD 🔵 COMPRA\nPosição aberta · gestão automática ligada", cls: "act" },
  { c: "gestão", t: "HIT TP1 ✅ +100PIPS\nParcial realizada · stop movido para a entrada", cls: "win" },
  { c: "gestão", t: "HIT TP3 ✅ +200PIPS · HIT ALL TP ✅\n🏁 Posição fechada", cls: "win" },
]

/** Alunos reais de assessment_attempts (aprovados). Nome = primeiro + último, como em /avaliacoes. */
const CERTS: Array<[string, "fast-start" | "bootcamp" | "teste-final", string | null]> = [
  ["Mauro Monteiro", "bootcamp", "20,0"], ["Nuno Fernandes", "teste-final", "20,0"],
  ["Gonçalo Madeira", "teste-final", "19,2"], ["Luciene Moniz", "bootcamp", "19,5"],
  ["Jeronimo Santos", "bootcamp", "19,5"], ["Ailton Varela", "bootcamp", "19,0"],
  ["Rui Rodrigues", "bootcamp", "19,0"], ["Fábio Henriques", "bootcamp", "18,9"],
  ["Carlos Gomes", "bootcamp", "18,5"], ["André Dias", "bootcamp", "17,9"],
  ["Nuno Sá", "bootcamp", "17,9"], ["Isaac Benholiel", "bootcamp", "17,4"],
  ["Liliana Faria", "fast-start", null], ["Tiago Pedrosa", "fast-start", null],
  ["Eduarda Rodrigues", "fast-start", null], ["Rosânia Francisco", "fast-start", null],
]


const CHAPTERS: Array<[string, string]> = [
  ["problema", "O problema"], ["dia", "Em ação"], ["executar", "Executar"], ["numeros", "A prova"],
  ["eco", "O ecossistema"], ["cripto", "Cripto e DCA"], ["terminal", "Terminal IA"], ["alertas", "Alertas"],
  ["areas", "As áreas"], ["educacao", "Escola"], ["certificados", "Certificados"], ["comunidade", "Comunidade"],
  ["testemunhos", "Testemunhos"], ["construir", "Construir"], ["faq", "Perguntas"], ["l2-packs", "Packs"],
]

/**
 * As áreas da casa, lidas de `lms_academies` / `lms_educators` / `lms_streams` a 28/09/2026.
 *
 * A REGRA: só entra o que a casa entrega, e o que ainda não entrega entra MARCADO. As três
 * áreas com uma sala começaram agora e é isso que se diz — quem chega e encontra um catálogo
 * de uma aula sente-se enganado, e quem se sente enganado à entrada não volta.
 *
 * `edu` é o nome do educador na base; `null` significa que a área não tem aulas próprias e o
 * cartão desenha-se sem a linha do educador, com o que a sustenta em `meta`.
 * Se acrescentares uma área aqui, confirma primeiro na base — não pelo que era intenção.
 */
type Area = { t: string; edu: string | null; d: string; meta: string[]; href?: string; cta?: string }

const AREAS_VIVAS: Area[] = [
  {
    t: "Forex e metais", edu: "Ricardo Garcia",
    d: "Regressão de tendências e scanners, ao vivo. É a divisão mais cheia da casa: cinco salas, das básicas à mentoria VIP, e gravações organizadas em curso para quem falta.",
    meta: ["5 salas", "7 horários por semana", "gravações"], href: "/live-sessions",
  },
  {
    t: "Criptomoedas", edu: "Ruben Pereira",
    d: "Três salas próprias — DCA com MTM, Império Cripto e Live Trading Cripto — ligadas aos portefólios e à análise de reforço mensal que corre no site.",
    meta: ["3 salas", "2 horários por semana", "gravações"], href: "/live-sessions",
  },
  {
    t: "Social Media e UGC", edu: "MTM Social Media & UGC",
    d: "Marca pessoal e conteúdo: como começar nas redes e como produzir. Começou agora — uma sala, um horário semanal. Tens ainda o estúdio MTM Social para fazeres as tuas peças com a tua marca, e um canal só desta conversa.",
    meta: ["começou agora", "1 horário por semana", "estúdio MTM Social"], href: "/live-sessions",
  },
  {
    t: "Mindset e Liderança", edu: "MTM Mindset & Liderança",
    d: "A cabeça, a disciplina e a forma de conduzir pessoas. Começou agora, com uma sala e as gravações a seguir — e esta abre-se sem pagar nada.",
    meta: ["começou agora", "acesso livre", "gravações"], href: "/live-sessions",
  },
  {
    t: "Fitness e Bem-Estar", edu: "MTM Fitness & Bem-Estar",
    d: "Treino, hábitos e performance física. Começou agora, com três horários por semana já marcados. Do lado das ferramentas tens o registo de treinos, refeições e peso.",
    meta: ["começou agora", "3 horários por semana"], href: "/live-sessions",
  },
  {
    t: "Ações e ETF", edu: null,
    d: "Sem aulas próprias e sem educador atribuído. O que existe é a carteira de oito ETF acompanhada ao vivo, seis ações no Terminal com IA, um canal de chat dedicado e a análise de reforço publicada todos os dias.",
    meta: ["8 ETF", "6 ações no Terminal", "canal e análise diária"],
    href: "/portfolios", cta: "Ver os portefólios",
  },
]

/** Academias criadas na base, ainda sem educador e sem sala. Sem data — não temos nenhuma. */
const AREAS_A_ABRIR: Array<{ t: string; d: string }> = [
  { t: "Imobiliário", d: "Educação imobiliária e estratégias. Academia criada, à espera de educador." },
  { t: "Inteligência Artificial", d: "Ferramentas de IA aplicadas ao negócio. Academia criada, à espera de educador." },
  { t: "Network Marketing", d: "Fundamentos, prospeção, comunicação e crescimento de equipas. Academia criada, à espera de educador." },
]

const sig = (n: string) => {
  const p = n.replace(/^MTM\s+/, "").split(/[\s&]+/).filter(Boolean)
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase()
}

function AreaCard({ a, big, t }: { a: Area; big?: boolean; t: (k: string) => string }) {
  const corpo = (
    <>
      {a.edu ? (
        <div className="who3">
          <span className="av2">{sig(a.edu)}</span>
          <span>
            <span className="en">{a.edu}</span>
            <span className="er">{t("l2.areasEducator")} · {t("l2.areasLive")}</span>
          </span>
        </div>
      ) : (
        <p className="nt"><b />{t("l2.areasNoTeacher")}</p>
      )}
      <h3>{a.t}</h3>
      <p>{a.d}</p>
      <div className="mt">{a.meta.map((m) => (<span key={m}>{m}</span>))}</div>
      {a.href && <span className="go2">{a.cta ?? t("l2.areasGo")}</span>}
    </>
  )
  const cls = `ar r d1${big ? " big" : ""}`
  return a.href
    ? <a className={cls} href={a.href}>{corpo}</a>
    : <div className={cls}>{corpo}</div>
}

const iniciais = (n: string) =>
  n.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()

function CertCard({ c, t }: { c: (typeof CERTS)[number]; t: (k: string) => string }) {
  const [nome, tpl, nota] = c
  const label = tpl === "bootcamp" ? "l2.certBootcamp" : tpl === "teste-final" ? "l2.certFinal" : "l2.certFastStart"
  const curso = tpl === "bootcamp" ? "l2.courseBootcamp" : tpl === "teste-final" ? "l2.courseFinal" : "l2.courseFastStart"
  return (
    <div className="cf">
      <div className="cf__in">
        <span className="cf__c tl" /><span className="cf__c tr" /><span className="cf__c bl" /><span className="cf__c br" />
        <div className="seal">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
          </svg>
        </div>
        <p className="lb">{t(label)}</p>
        <p className="at">{t("l2.certTo")}</p>
        <p className="nm2">{nome}</p>
        <div className="rule" />
        <p className="co">{t(curso)}</p>
        {nota && <p className="gr">{t("l2.certGrade")}: {nota} {t("l2.gradeValues")}</p>}
        <p className="sg">{t("l2.certEducator")}</p>
      </div>
    </div>
  )
}

function Testimonial({ x, i, t }: { x: Testemunho; i: number; t: (k: string) => string }) {
  return (
    <div className={`tm r d${(i % 3) + 1}`}>
      <div className="st">★★★★★</div>
      <div className="qm">”</div>
      <p className="qt">“{x.q}”</p>
      <div className="who2">
        <div className="av">{iniciais(x.n)}</div>
        <div>
          <p className="nn" style={{ margin: 0 }}>{x.n}</p>
          <p className="lo" style={{ margin: 0 }}>{x.l} <span className="vf">✓ {t("l2.testVerified")}</span></p>
        </div>
      </div>
      <div className="rs">
        {x.p ? (<><span>{t("l2.testResult")} · {x.t}</span><b>{x.p}</b></>)
             : (<><span>{t("l2.testChat")}</span><b style={{ color: "var(--gold-lt)" }}>{t("l2.testVerbatim")}</b></>)}
      </div>
    </div>
  )
}

export default function NewLandingPage() {
  const t = useT()
  const root = useRef<HTMLDivElement>(null)
  const [video, setVideo] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [stats, setStats] = useState<LandingStats>(SNAPSHOT)
  const [ctaOn, setCtaOn] = useState(false)
  const [ctaFechado, setCtaFechado] = useState(false)

  const asOf = (() => {
    const d = new Date(stats.asOf)
    return Number.isNaN(d.getTime())
      ? stats.asOf
      : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
  })()

  useEffect(() => {
    let vivo = true
    fetch("/api/landing-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (vivo && s && typeof s.trades === "number") setStats(s) })
      .catch(() => { /* fica o snapshot */ })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!root.current) return
    return mountLandingEffects(root.current)
  }, [stats])

  // barra de conversão: entra depois da abertura, sai quando os packs aparecem
  useEffect(() => {
    if (ctaFechado) return
    const packs = document.getElementById("l2-packs")
    const onScroll = () => {
      const passouAbertura = scrollY > innerHeight * 0.85
      const chegouAosPacks = packs ? packs.getBoundingClientRect().top < innerHeight * 0.85 : false
      setCtaOn(passouAbertura && !chegouAosPacks)
    }
    addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => removeEventListener("scroll", onScroll)
  }, [ctaFechado])

  useEffect(() => {
    if (!video) return
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setVideo(false) }
    addEventListener("keydown", esc)
    document.body.style.overflow = "hidden"
    return () => { removeEventListener("keydown", esc); document.body.style.overflow = "" }
  }, [video])

  return (
    <div className="l2" ref={root}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100,600;100,700;100,800&family=Fraunces:ital,opsz,wght@1,9..144,500;1,9..144,600&family=Great+Vibes&family=Instrument+Sans:wght@400;500;600&display=swap"
      />

      <div id="l2-prog" />
      <canvas id="l2-amb" />
      <div className="aur a" /><div className="aur b" /><div className="mesh" /><div id="l2-grain" />

      <nav id="l2-rail" aria-label="Capítulos">
        {CHAPTERS.map(([id, nome], i) => (
          <a key={id} href={`#${id}`} data-s={id}>
            <i /><span>{String(i + 1).padStart(2, "0")} {nome}</span>
          </a>
        ))}
      </nav>

<header className="open2" id="open">
  <div className="open2__bg" id="hero" style={{backgroundImage:"url(/landing/hero.png)"}}></div>
  <div className="open2__veil"></div>
  <div className="wrap">
    <p className="kicker r">{t("l2.heroKicker")}</p>
    <h1 className="r d1">
      <span className="ln"><span>{t("l2.heroL1")}</span></span>
      <span className="ln"><span>{t("l2.heroL2a")}<em className="acc">{t("l2.heroL2b")}</em>.</span></span>
    </h1>
    <p className="l r d2">{t("l2.heroSub")}</p>
    <div className="acts r d3">
      <a className="btn" href="#dia">{t("l2.heroCta1")}</a>
      <button type="button" className="vbtn" onClick={() => setVideo(true)}><i />{t("l2.heroVideo")}</button>
    </div>
  </div>
  <span className="hint">{t("l2.scrollHint")}</span>
</header>

<div className="strip"><div className="strip__t">{[...STRIP, ...STRIP].map((s, i) => (<span key={i}><b>◆</b> {s}</span>))}</div></div>

<section id="problema" className="scene"><div className="scene__bg px" style={{backgroundImage:"url(/landing/cena1.jpg)",backgroundPosition:"65% center"}}></div><div className="scene__veil"></div>
  <div className="wrap"><p className="ch r"><b>01</b>{t("l2.ch1")}</p>
    <h2 className="r d1">{t("l2.probTitle")}</h2>
    <p className="r d2">{t("l2.probBody")}</p>
  </div>
</section>

<section className="nar">
  <div className="wrap">
    <p className="lb2 r">{t("l2.narLabel1")}</p>
    <q className="r d1">{t("l2.narQuote1")}</q>
    <p className="r d2">{t("l2.narBody1")}</p>
    <p className="sig2 r d3">{t("l2.narSign")}</p>
  </div>
</section>

<section id="dia" className="band">
  <div className="wrap">
    <div className="head r"><p className="ch"><b>02</b>{t("l2.ch2")}</p>
      <h2>{t("l2.diaTitle")}</h2>
      <p>{t("l2.diaSub")}</p></div>
    <div className="day">
      <div>
        <div className="beat" data-b="0"><div className="t">07:41</div><h3>{t("l2.beat1T")}</h3>
          <p>{t("l2.beat1B")}</p>
          <span className="tool">{t("l2.beat1Tool")}</span></div>
        <div className="beat" data-b="1"><div className="t">07:42</div><h3>{t("l2.beat2T")}</h3>
          <p>No Telegram e na app ao mesmo tempo. Sem link, sem PDF, sem "manda mensagem para saber mais".</p>
          <span className="tool">{t("l2.beat2Tool")}</span></div>
        <div className="beat" data-b="2"><div className="t">07:42</div><h3>{t("l2.beat3T")}</h3>
          <p>{t("l2.beat3B")}</p>
          <span className="tool">{t("l2.beat3Tool")}</span></div>
        <div className="beat" data-b="3"><div className="t">07:42</div><h3>{t("l2.beat4T")}</h3>
          <p>{t("l2.beat4B")}</p>
          <span className="tool">{t("l2.beat4Tool")}</span></div>
        <div className="beat" data-b="4"><div className="t">07:43</div><h3>{t("l2.beat5T")}</h3>
          <p>{t("l2.beat5B")}</p>
          <span className="tool">{t("l2.beat5Tool")}</span></div>
      </div>
      <div className="phone"><div className="phone__b"><div className="phone__s">
        <div className="phone__bar"><span className="dot"></span><span>{t("l2.feedTitle")}</span></div>
        <div className="feed">{MSGS.map((m, i) => (<div key={i} className={"msg " + (m.cls || "")}><span className="who">{m.c}</span>{m.t}{m.tap && <span className="tapbtn">{t("l2.feedTap")}</span>}</div>))}</div>
      </div></div></div>
    </div>
  </div>
</section>

<section id="executar">
  <div className="wrap">
    <div className="head r">
      <p className="ch">{t("l2.chExec")}</p>
      <h2>{t("l2.execTitle")}</h2>
      <p>{t("l2.execSub")}</p></div>

    <div className="two">
      <div className="way r d1">
        <div className="way__s">
          <div className="t2t"><div className="t2t__s">
            <div className="t2t__h"><b>XAUUSD</b><span className="chip buy">{t("l2.dcaBuy")}</span></div>
            <div className="t2t__r"><span>Entrada</span><b>2 412,5</b></div>
            <div className="t2t__r"><span>{t("l2.invalidation")}</span><b style={{"color": "#e0755f"}}>2 405,0</b></div>
            <div className="t2t__r"><span>{t("l2.exit")}</span><b style={{"color": "var(--live)"}}>2 430,0</b></div>
            <div className="t2t__b">Tap to trade</div>
            <div className="t2t__f">recebe → revê → confirma</div>
          </div></div>
          <span className="tap"></span>
        </div>
        <div className="way__c">
          <span className="n">{t("l2.t2tEyebrow")}</span>
          <h3>Tap to Trade MTM</h3>
          <p className="sb">{t("l2.t2tSub")}</p>
          <p>{t("l2.t2tBody")}</p>
          <div className="flow"><b>{t("l2.t2tF1")}</b>→<b>{t("l2.t2tF2")}</b>→<b>{t("l2.t2tF3")}</b></div>
        </div>
      </div>

      <div className="way r d2">
        <div className="way__s">
          <div className="copy"><svg viewBox="0 0 330 240" role="img" aria-label="Uma conta mestre a replicar para três contas de cliente">
            <path className="lnk" d="M96 120 C150 120 150 46 214 46"/>
            <path className="lnk" d="M96 120 C150 120 150 120 214 120"/>
            <path className="lnk" d="M96 120 C150 120 150 194 214 194"/>
            <circle className="halo" cx="62" cy="120"/>
            <circle className="mast" cx="62" cy="120" r="30"/>
            <text x="62" y="116" text-anchor="middle" font-size="15" fill="#d2a63c" font-weight="700">M</text>
            <text x="62" y="132" text-anchor="middle" font-size="6.5" letter-spacing="1.4">{t("l2.copyMaster")}</text>
            <text x="62" y="168" text-anchor="middle" font-size="7" letter-spacing="1.2">{t("l2.copyStrategy")}</text>
            <g>
              <rect className="cli" x="214" y="28" width="108" height="36" rx="9"/>
              <text x="226" y="45" font-size="8.5" letter-spacing=".8" fill="#f2f0e9">{t("l2.copyClient")}</text>
              <text x="226" y="56" font-size="8" fill="#4fc98a">▲ copiado · +1,2%</text>
              <rect className="cli" x="214" y="102" width="108" height="36" rx="9"/>
              <text x="226" y="119" font-size="8.5" letter-spacing=".8" fill="#f2f0e9">{t("l2.copyClient")}</text>
              <text x="226" y="130" font-size="8" fill="#4fc98a">▲ copiado · +0,8%</text>
              <rect className="cli" x="214" y="176" width="108" height="36" rx="9"/>
              <text x="226" y="193" font-size="8.5" letter-spacing=".8" fill="#f2f0e9">{t("l2.copyClient")}</text>
              <text x="226" y="204" font-size="8" fill="#4fc98a">▲ copiado · +1,5%</text>
            </g>
            <circle className="dot2 a" cx="0" cy="0"><animateMotion dur="2.6s" repeatCount="indefinite" path="M96 120 C150 120 150 46 214 46"/></circle>
            <circle className="dot2 b" cx="0" cy="0"><animateMotion dur="2.6s" begin="0.85s" repeatCount="indefinite" path="M96 120 C150 120 150 120 214 120"/></circle>
            <circle className="dot2 c" cx="0" cy="0"><animateMotion dur="2.6s" begin="1.7s" repeatCount="indefinite" path="M96 120 C150 120 150 194 214 194"/></circle>
          </svg></div>
        </div>
        <div className="way__c">
          <span className="n">{t("l2.copyEyebrow")}</span>
          <h3>MTM Copy</h3>
          <p className="sb">{t("l2.copySub")}</p>
          <p>{t("l2.copyBody")}</p>
          <div className="flow"><b>{t("l2.copyF1")}</b>→<b>{t("l2.copyF2")}</b>→<b>{t("l2.copyF3")}</b></div>
        </div>
      </div>
    </div>

    <p className="risk r d3">{t("l2.execRisk")}</p>
  </div>
</section>

<section id="numeros">
  <div className="wrap">
    <div className="head r">
      <p className="ch"><b>03</b>{t("l2.ch3")}</p>
      <h2>{t("l2.numTitle")}</h2>
      <p>{t("l2.numSub")}</p>
    </div>
    <div className="nums r d1">
      <div className="num"><div className="v" data-k="trades" data-to={stats.trades}>0</div><div className="l">{t("l2.numTrades")}</div></div>
      <div className="num"><div className="v" data-k="winRatePct" data-to={stats.winRatePct} data-suf="%">0</div><div className="l">{t("l2.numWin")}</div></div>
      <div className="num"><div className="v" data-k="sinais" data-to={stats.sinais}>0</div><div className="l">{t("l2.numSignals")}</div></div>
      <div className="num"><div className="v" data-k="ordens" data-to={stats.ordens}>0</div><div className="l">{t("l2.numOrders")}</div></div>
      <div className="num"><div className="v" data-k="certificados" data-to={stats.certificados}>0</div><div className="l">{t("l2.numCerts")}</div></div>
    </div>
    <p className="stamp r d2"><b /><span>{t("l2.numStamp").replace("{d}", asOf)}</span></p>
    <p className="risk r d2">{t("l2.numRisk").replace("{n}", String(stats.contas))}</p>
    <div className="jump r d3">
      <p>{t("l2.jump1")}<span>{t("l2.jump1Sub")}</span></p>
      <div className="ac"><a className="btn" href="#l2-packs">{t("l2.jump1Cta")}</a>
        <button type="button" className="btn g" onClick={() => setVideo(true)}>{t("l2.jumpVideo")}</button></div>
    </div>
  </div>
</section>

<section className="nar">
  <div className="wrap">
    <p className="lb2 r">{t("l2.narLabel2")}</p>
    <q className="r d1">{t("l2.narQuote2")}</q>
    <p className="r d2">{t("l2.narBody2")}</p>
    <p className="sig2 r d3">{t("l2.narSign")}</p>
  </div>
</section>
<section id="eco">
  <div className="wrap">
    <div className="head r"><p className="ch"><b>04</b>{t("l2.ch4")}</p>
      <h2>{t("l2.ecoTitle")}<br />{t("l2.ecoTitle2")}</h2>
      <p>{t("l2.ecoSub")}</p></div>
    <div className="grid4">
      <div className="card r d1"><span className="ic">◆</span><span className="n">{t("l2.eco1L")}</span><h3>{t("l2.beat3Tool")}</h3>
        <p>{t("l2.eco1B")}</p></div>
      <div className="card r d2"><span className="ic">⇄</span><span className="n">{t("l2.eco2L")}</span><h3>MTM Copy</h3>
        <p>{t("l2.eco2B")}</p></div>
      <div className="card r d3"><span className="ic">◈</span><span className="n">{t("l2.eco3L")}</span><h3>{t("l2.eco3T")}</h3>
        <p>{t("l2.eco3B")}</p></div>
      <div className="card r d4"><span className="ic">⬡</span><span className="n">{t("l2.eco4L")}</span><h3>{t("l2.eco4T")}</h3>
        <p>{t("l2.eco4B")}</p></div>
      <div className="card r d1"><span className="ic">✦</span><span className="n">{t("l2.eco5L")}</span><h3>{t("l2.eco5T")}</h3>
        <p>{t("l2.eco5B")}</p></div>
      <div className="card r d2"><span className="ic">◎</span><span className="n">{t("l2.eco6L")}</span><h3>{t("l2.eco6T")}</h3>
        <p>{t("l2.eco6B")}</p></div>
      <div className="card r d3"><span className="ic">◍</span><span className="n">{t("l2.eco7L")}</span><h3>{t("l2.eco7T")}</h3>
        <p>{t("l2.eco7B")}</p></div>
      <div className="card r d4"><span className="ic">◐</span><span className="n">{t("l2.eco8L")}</span><h3>{t("l2.eco8T")}</h3>
        <p>{t("l2.eco8B")}</p></div>
    </div>
    <div className="jump r d3">
      <p>{t("l2.jump2")}<span>{t("l2.jump2Sub")}</span></p>
      <div className="ac"><a className="btn" href="#l2-packs">{t("l2.jump2Cta")}</a></div>
    </div>
  </div>
</section>

<section id="cripto" className="band">
  <div className="wrap">
    <div className="head r">
      <p className="ch">{t("l2.chCripto")}</p>
      <h2>{t("l2.criptoTitle")}</h2>
      <p>{t("l2.criptoSub")}</p></div>

    <div className="demo r d1">
      <div className="demo__bar"><span className="lv"><b />CoinGecko live</span>
        <span className="lv"><b />Yahoo Finance live</span><em>auto-sync 2 min</em></div>
      <div className="demo__bd">
        <div className="tiles">
          <div className="tl"><div className="tv" data-to="28">0</div><div className="tn">{t("l2.criptoAssets")}<br />{t("l2.criptoAssetsSub")}</div></div>
          <div className="tl"><div className="tv" data-to="46">0</div><div className="tn">{t("l2.criptoFear")}<br />{t("l2.criptoFearSub")}</div></div>
          <div className="tl"><div className="tv" data-to="41" data-suf="%" data-pre="+">0</div><div className="tn">{t("l2.criptoEtf")}</div></div>
          <div className="tl"><div className="tv">~4x</div><div className="tn">{t("l2.criptoPot")}<br />{t("l2.criptoPotSub")}</div></div>
        </div>

        <p className="ch" style={{"margin": "26px 0 14px"}}>{t("l2.dcaTitle")}</p>
        <div className="gauges">
          <div className="ga"><div className="gl">{t("l2.dcaStrong")}</div><div className="gv" style={{"color": "var(--live)"}} data-to="1">0</div>
            <div className="gt"><i data-w="20" style={{"background": "var(--live)"}}></i></div><div className="gs">{t("l2.dcaStrongSub")}</div></div>
          <div className="ga"><div className="gl">{t("l2.dcaBuy")}</div><div className="gv" data-to="0">0</div>
            <div className="gt"><i data-w="15" style={{"background": "var(--gold)"}}></i></div><div className="gs">{t("l2.dcaBuySub")}</div></div>
          <div className="ga"><div className="gl">{t("l2.dcaWait")}</div><div className="gv" style={{"color": "var(--gold-lt)"}} data-to="1">0</div>
            <div className="gt"><i data-w="5" style={{"background": "var(--gold-dp)"}}></i></div><div className="gs">{t("l2.dcaWaitSub")}</div></div>
        </div>

        <div className="dca">
          <div className="dc"><div className="dc__t"><b>XRP</b><span className="chip pd">{t("l2.dcaNo")}</span></div>
            <span className="tk">XRPUSDT</span>
            <div className="px3">$1,2600</div><div className="sub2">+18,3% acima da média semanal</div>
            <p className="why">{t("l2.dcaWhy")}</p></div>
          <div className="dc"><div className="dc__t"><b>Chainlink</b><span className="chip pd">{t("l2.dcaNo")}</span></div>
            <span className="tk">LINKUSDT</span>
            <div className="px3">$10,6800</div><div className="sub2">+7,3% acima da média semanal</div>
            <p className="why">{t("l2.dcaWhy")}</p></div>
          <div className="dc"><div className="dc__t"><b>Kaspa</b><span className="chip pd">{t("l2.dcaNo")}</span></div>
            <span className="tk">KASUSDT</span>
            <div className="px3">$0,0280</div><div className="sub2">+7,1% acima da média semanal</div>
            <p className="why">{t("l2.dcaWhy")}</p></div>
        </div>
      </div>
    </div>

    <p className="risk r d2">Leitura real do portefólio MTM. A análise DCA é uma sugestão de alocação do
      reforço mensal, não uma recomendação de investimento. Sem grupos de "próximo 100x".</p>
    <p className="r d3" style={{"marginTop": "22px"}}><a className="btn g" href="/portfolios">{t("l2.criptoCta")}</a></p>
  </div>
</section>

<section id="terminal">
  <div className="wrap">
    <div className="head r">
      <p className="ch">{t("l2.chTerminal")}</p>
      <h2>{t("l2.terminalTitle")}</h2>
      <p>{t("l2.terminalSub")}</p></div>

    <div className="demo r d1" id="term">
      <div className="demo__bar"><span className="lv"><b />{t("l2.live")}</span><em>{t("l2.terminalBar")}</em></div>
      <div className="demo__bd">
        <div className="tsig">
          <span className="bull">▲ BULLISH</span>
          <span className="cv">{t("l2.conviction")}<b>{t("l2.convictionVal")}</b></span>
          <span className="px2">4576,4 <span style={{"fontSize": "12px", "color": "var(--faint)"}}>USD</span></span>
        </div>
        <p className="tline" id="l2-tline" data-txt={t("l2.terminalRead")}><span className="cur" /></p>

        <div className="gauges">
          <div className="ga"><div className="gl">{t("l2.retail")}</div><div className="gv" style={{"color": "var(--live)"}} data-to="68" data-suf="% bullish">0</div>
            <div className="gt"><i data-w="68" style={{"background": "linear-gradient(90deg,#e0755f,var(--gold),var(--live))"}}></i></div>
            <div className="gs">{t("l2.retailScale")}</div></div>
          <div className="ga"><div className="gl">{t("l2.fear")}</div><div className="gv" style={{"color": "var(--gold)"}} data-to="61">0</div>
            <div className="gt"><i data-w="61" style={{"background": "linear-gradient(90deg,#e0755f,var(--gold))"}}></i></div>
            <div className="gs">{t("l2.greed")}</div></div>
          <div className="ga"><div className="gl">{t("l2.inst")}</div><div className="gv" style={{"fontSize": "15px", "color": "var(--ink)"}}>{t("l2.instVal")}</div>
            <div className="gt"><i data-w="86" style={{"background": "var(--gold-lt)"}}></i></div>
            <div className="gs">{t("l2.instSub")}</div></div>
        </div>

        <p className="ch" style={{"margin": "0 0 14px"}}>{t("l2.scenarios")}</p>
        <div className="scen">
          <div className="sc"><div className="sh"><span style={{"color": "var(--live)"}}>Bullish</span><b style={{"color": "var(--live)"}}>+4,2%</b></div>
            <div className="bar"><i data-w="62" style={{"background": "var(--live)"}}></i></div>
            <p>Fed sinaliza cortes após CPI&lt;2,8% e emprego deteriora; DXY quebra 103 e safe-haven impulsiona para 4730–4763.</p></div>
          <div className="sc"><div className="sh"><span style={{"color": "var(--gold)"}}>Base</span><b style={{"color": "var(--gold)"}}>+1,1%</b></div>
            <div className="bar"><i data-w="34" style={{"background": "var(--gold)"}}></i></div>
            <p>{t("l2.scBase")}</p></div>
          <div className="sc"><div className="sh"><span style={{"color": "#e0755f"}}>Bearish</span><b style={{"color": "#e0755f"}}>−3,8%</b></div>
            <div className="bar"><i data-w="21" style={{"background": "#e0755f"}}></i></div>
            <p>{t("l2.scBear")}</p></div>
        </div>

        <div className="gauges" style={{"margin": "20px 0 0"}}>
          <div className="ga"><div className="gl">{t("l2.supports")}</div>
            <div className="gv" style={{"fontSize": "15px", "color": "var(--live)"}}>4370 · 4327,6 · 4315</div></div>
          <div className="ga"><div className="gl">{t("l2.resistances")}</div>
            <div className="gv" style={{"fontSize": "15px", "color": "#e0755f"}}>4643,5 · 4763</div></div>
          <div className="ga"><div className="gl">{t("l2.alsoTerminal")}</div>
            <div className="gv" style={{"fontSize": "15px", "color": "var(--ink)"}}>{t("l2.alsoTerminalVal")}</div>
            <div className="gs">{t("l2.alsoTerminalSub")}</div></div>
        </div>
      </div>
    </div>

    <p className="risk r d2">{t("l2.terminalRisk")}</p>
    <p className="r d3" style={{"marginTop": "22px"}}><a className="btn g" href="/mtm-terminal">{t("l2.terminalCta")}</a></p>
  </div>
</section>

<section id="alertas" className="band">
  <div className="wrap">
    <div className="head r">
      <p className="ch">{t("l2.chAlerts")}</p>
      <h2>{t("l2.alertsTitle")}</h2>
      <p>Nada de "manda mensagem para saber a entrada". Entrada, invalidação, três saídas e as
        confirmações que faltam — tudo à frente, antes de arriscares.</p></div>

    <div className="demo r d1">
      <div className="demo__bar"><span className="lv"><b />{t("l2.alertsLive")}</span>
        <em>{t("l2.alertsBar")}</em></div>
      <div className="demo__bd">
        <div className="alerts">
          <div className="al">
            <div className="al__t"><span className="sym">NATURALGAS</span><span className="chip buy">↗ Compra</span>
              <span className="chip tf">15m</span><span className="chip pd">{t("l2.pending")}</span></div>
            <div className="lvls">
              <div className="sl"><span>{t("l2.invalidation")}</span><b>2,7305</b></div>
              <div className="tp"><span>Saída 1</span><b>2,7682</b></div>
              <div className="tp"><span>Saída 2</span><b>2,7934</b></div>
              <div className="tp"><span>Saída 3</span><b>2,8186</b></div></div>
            <div className="conf"><span className="cf2 ok">✓ Acima POC</span><span className="cf2 no">✕ DEMA 15&gt;50</span><span className="cf2 no">✕ DEMA 50&gt;238</span></div>
            <div className="al__f"><span>MTM Scanner</span><span>1 / 3 confirmações</span></div></div>

          <div className="al">
            <div className="al__t"><span className="sym">GER40</span><span className="chip buy">↗ Compra</span>
              <span className="chip tf">15m</span><span className="chip pd">{t("l2.pending")}</span></div>
            <div className="lvls">
              <div className="sl"><span>{t("l2.invalidation")}</span><b>25 962,8</b></div>
              <div className="tp"><span>Saída 1</span><b>26 059,3</b></div>
              <div className="tp"><span>Saída 2</span><b>26 123,6</b></div>
              <div className="tp"><span>Saída 3</span><b>26 187,9</b></div></div>
            <div className="conf"><span className="cf2 ok">✓ Acima POC</span><span className="cf2 ok">✓ DEMA 15&gt;50</span><span className="cf2 no">✕ DEMA 50&gt;238</span></div>
            <div className="al__f"><span>MTM Scanner</span><span>2 / 3 confirmações</span></div></div>

          <div className="al">
            <div className="al__t"><span className="sym">US30</span><span className="chip sell">↘ Venda</span>
              <span className="chip tf">15m</span><span className="chip pd">{t("l2.pending")}</span></div>
            <div className="lvls">
              <div className="sl"><span>{t("l2.invalidation")}</span><b>53 070,7</b></div>
              <div className="tp"><span>Saída 1</span><b>52 830,2</b></div>
              <div className="tp"><span>Saída 2</span><b>52 669,9</b></div>
              <div className="tp"><span>Saída 3</span><b>52 509,6</b></div></div>
            <div className="conf"><span className="cf2 no">✕ Acima POC</span><span className="cf2 no">✕ DEMA 15&gt;50</span><span className="cf2 no">✕ DEMA 50&gt;238</span></div>
            <div className="al__f"><span>MTM Scanner</span><span>0 / 3 confirmações</span></div></div>
        </div>
        <p style={{"margin": "20px 0 0", "fontSize": "13px", "color": "var(--faint)", "lineHeight": "1.6"}}>{t("l2.alertsNote1")}<b style={{"color": "var(--gold)"}}>{t("l2.alertsNotePending")}</b>{t("l2.alertsNote2")}</p>
      </div>
    </div>

    <p className="r d3" style={{"marginTop": "26px"}}><a className="btn g" href="/alertas-mtm">{t("l2.alertsCta")}</a></p>
  </div>
</section>

{/* As áreas da casa. Duas famílias, e a diferença lê-se antes de se ler o texto: painel cheio
    com o nome do educador para o que já dá aulas, traço interrompido e sem botão para o que
    ainda está a abrir. Ver AREAS_VIVAS / AREAS_A_ABRIR no topo do ficheiro. */}
<section id="areas">
  <div className="wrap">
    <div className="head r"><p className="ch">{t("l2.chAreas")}</p>
      <h2>{t("l2.areasTitle")}<br />{t("l2.areasTitle2")}</h2>
      <p>{t("l2.areasSub")}</p></div>

    <p className="ch r" style={{ margin: "0 0 16px" }}>{t("l2.areasFam1")}</p>
    <p className="r d1" style={{ margin: "0 0 22px", color: "var(--faint)", fontSize: "14px" }}>{t("l2.areasFam1Sub")}</p>
    <div className="aw">
      <AreaCard a={AREAS_VIVAS[0]} big t={t} />
      <AreaCard a={AREAS_VIVAS[1]} big t={t} />
    </div>
    <div className="aw3">
      {AREAS_VIVAS.slice(2, 5).map((a) => (<AreaCard key={a.t} a={a} t={t} />))}
    </div>
    <div className="aw3" style={{ gridTemplateColumns: "1fr" }}>
      <AreaCard a={AREAS_VIVAS[5]} t={t} />
    </div>

    <p className="ch r" style={{ margin: "58px 0 16px" }}>{t("l2.areasFam2")}</p>
    <p className="r d1" style={{ margin: "0 0 22px", color: "var(--faint)", fontSize: "14px" }}>{t("l2.areasFam2Sub")}</p>
    <div className="aw3 soon r d2">
      {AREAS_A_ABRIR.map((a) => (
        <div className="ab" key={a.t}>
          <p className="lb3"><b />{t("l2.areasSoonTag")}</p>
          <h3>{a.t}</h3>
          <p>{a.d}</p>
        </div>
      ))}
    </div>
    <p className="r d3" style={{ marginTop: "22px", fontSize: "14px", color: "var(--dim)" }}>
      {t("l2.areasHint")}{" "}
      <a href="/criadores" style={{ color: "var(--gold-lt)", borderBottom: "1px solid var(--gold-dp)" }}>{t("l2.areasHintLink")}</a>.
    </p>

    <p className="risk r d3">{t("l2.areasRisk")}</p>
  </div>
</section>

<section className="band" id="educacao">
  <div className="wrap split">
    <div className="r">
      <p className="ch">{t("l2.chSchool")}</p>
      <h2>{t("l2.schoolTitle")}</h2>
      <p style={{"marginTop": "18px"}}>O Bootcamp são 30 horas a sério, e no fim há avaliação. Quem passa recebe
        um certificado oficial em nome próprio, com classificação e código de validação público. É a diferença
        entre "vi um curso" e "sou capaz de operar uma conta".</p>
      <div className="tags">
        <span className="tag">{t("l2.schoolTag1")}</span><span className="tag">{t("l2.schoolTag2")}</span>
        <span className="tag">{t("l2.schoolTag3")}</span><span className="tag">{t("l2.schoolTag4")}</span>
        <span className="tag">{t("l2.schoolTag5")}</span>
      </div>
      <p style={{"marginTop": "26px"}}><a className="btn g" href="/avaliacoes">{t("l2.schoolCta")}</a></p>
    </div>
    <figure className="fig reveal r d2">
      <img src="/landing/escola.jpg" alt={t("l2.schoolAlt")} />
      <figcaption>{t("l2.schoolCaption")}</figcaption>
    </figure>
  </div>
</section>

<section id="certificados">
  <div className="wrap">
    <div className="head r" style={{"textAlign": "center", "marginLeft": "auto", "marginRight": "auto"}}>
      <p className="ch" style={{"justifyContent": "center"}}><b>05</b>{t("l2.ch5")}</p>
      <p className="pill" style={{ margin: "0 0 20px" }}>✓ {t("l2.certsPill").replace("{n}", String(stats.certificados))}</p>
      <h2>{t("l2.certsTitle")}</h2>
      <p>{t("l2.certsSub")}</p>
    </div>
  </div>
  <div className="crail r d1"><div className="crail__t">{[...CERTS, ...CERTS].map((c, i) => (<CertCard key={i} c={c} t={t} />))}</div></div>
  <div className="wrap"><p className="risk r d2" style={{"marginTop": "34px"}}>{t("l2.certsRisk")}</p></div>
</section>
<section id="comunidade" className="band">
  <div className="wrap">
    <div className="head r"><p className="ch"><b>06</b>{t("l2.ch6")}</p>
      <h2>{t("l2.commTitle")}<br />{t("l2.commTitle2")}</h2>
      <p>{t("l2.commSub")}</p></div>
    <div className="grid3">
      <div className="card r d1"><span className="ic">◍</span><span className="n">{t("l2.comm1L")}</span><h3>{t("l2.comm1T")}</h3>
        <p>{t("l2.comm1B")}</p></div>
      <div className="card r d2"><span className="ic">◌</span><span className="n">{t("l2.comm2L")}</span><h3>{t("l2.comm2T")}</h3>
        <p>{t("l2.comm2B")}</p></div>
      <div className="card r d3"><span className="ic">▶</span><span className="n">{t("l2.live")}</span><h3>{t("l2.comm3T")}</h3>
        <p>{t("l2.comm3B")}</p></div>
      <div className="card r d1"><span className="ic">✦</span><span className="n">{t("l2.comm4L")}</span><h3>{t("l2.comm4T")}</h3>
        <p>{t("l2.comm4B")}</p></div>
      <div className="card r d2"><span className="ic">◇</span><span className="n">{t("l2.comm5L")}</span><h3>{t("l2.comm5T")}</h3>
        <p>{t("l2.comm5B")}</p></div>
      <div className="card r d3"><span className="ic">✧</span><span className="n">{t("l2.comm6L")}</span><h3>{t("l2.comm6T")}</h3>
        <p>{t("l2.comm6B")}</p></div>
    </div>
  </div>
</section>

<section id="testemunhos">
  <div className="wrap">
    <div className="head r" style={{"textAlign": "center", "marginLeft": "auto", "marginRight": "auto"}}>
      <p className="ch" style={{"justifyContent": "center"}}><b>07</b>{t("l2.ch7")}</p>
      <h2>{t("l2.testTitle")}</h2></div>
    <div className="tw">{TESTEMUNHOS.map((x, i) => (<Testimonial key={i} x={x} i={i} t={t} />))}</div>
    <p className="stamp r d3" style={{ justifyContent: "center", display: "flex" }}><b />{t("l2.testStamp").replace("{p}", "33").replace("{c}", String(stats.certificados))}</p>
    <div className="jump r d3">
      <p>{t("l2.jump3")}<span>{t("l2.jump3Sub")}</span></p>
      <div className="ac"><a className="btn" href="#l2-packs">{t("l2.jump3Cta")}</a>
        <a className="btn g" href="/FreeSession">{t("l2.jump3Cta2")}</a></div>
    </div>
  </div>
</section>

<section className="nar">
  <div className="wrap">
    <p className="lb2 r">{t("l2.narLabel3")}</p>
    <q className="r d1">{t("l2.narQuote3")}</q>
    <p className="r d2">{t("l2.narBody3")}</p>
    <p className="sig2 r d3">{t("l2.narSign")}</p>
  </div>
</section>

<section className="scene"><div className="scene__bg px" style={{backgroundImage:"url(/landing/cena2.jpg)"}}></div><div className="scene__veil"></div>
  <div className="wrap"><p className="ch r"><b>08</b>{t("l2.ch8")}</p>
    <h2 className="r d1">{t("l2.buildScene")}</h2>
    <p className="r d2">{t("l2.buildSceneSub")}</p>
    <p className="r d3" style={{"marginTop": "26px"}}><a className="btn" href="/apresentacao">{t("l2.buildSceneCta")}</a></p>
  </div>
</section>

<section id="construir" className="band">
  <div className="wrap">
    <div className="head r"><p className="ch">{t("l2.doorsLabel")}</p>
      <h2>{t("l2.doorsTitle")}<br />{t("l2.doorsTitle2")}</h2>
      <p>{t("l2.doorsSub")}</p></div>
    <div className="grid4">
      <div className="card r d1"><span className="ic">◐</span><span className="n">{t("l2.door1L")}</span><h3>{t("l2.door1T")}</h3>
        <p>Alojamos, promovemos e cobramos por ti. Ficas com <b style={{"color": "var(--gold-lt)"}}>90 a 95%</b> do que vendes, com 0€ de entrada.</p>
        <p style={{"marginTop": "16px"}}><a className="btn g" style={{"padding": "8px 16px", "fontSize": "13px"}} href="/criadores">{t("l2.door1Cta")}</a></p></div>
      <div className="card r d2"><span className="ic">◈</span><span className="n">{t("l2.door2L")}</span><h3>{t("l2.door2T")}</h3>
        <p>{t("l2.door2B")}</p>
        <p style={{"marginTop": "16px"}}><a className="btn g" style={{"padding": "8px 16px", "fontSize": "13px"}} href="/convida">{t("l2.door2Cta")}</a></p></div>
      <div className="card r d3"><span className="ic">◑</span><span className="n">{t("l2.door3L")}</span><h3>{t("l2.door3T")}</h3>
        <p>{t("l2.door3B")}</p>
        <p style={{"marginTop": "16px"}}><a className="btn g" style={{"padding": "8px 16px", "fontSize": "13px"}} href="/apresentacao">{t("l2.door3Cta")}</a></p></div>
      <div className="card r d4"><span className="ic">◒</span><span className="n">{t("l2.door4L")}</span><h3>{t("l2.door4T")}</h3>
        <p>{t("l2.door4B")}</p>
        <p style={{"marginTop": "16px"}}><a className="btn g" style={{"padding": "8px 16px", "fontSize": "13px"}} href="/work">{t("l2.door4Cta")}</a></p></div>
    </div>
    {/* O IB fica FORA da grelha, e de propósito: não há caminho self-service para entrar na
        rede de IBs, e um cartão com botão prometeria um que não existe. */}
    <p className="risk r d4" style={{ marginTop: "30px" }}>
      {t("l2.doorsIb")}{" "}
      <a href="/abrir-conta" style={{ color: "var(--gold-lt)", borderBottom: "1px solid var(--gold-dp)" }}>{t("l2.doorsIbCta")}</a>.
    </p>
  </div>
</section>

<section id="faq">
  <div className="wrap">
    <div className="head r" style={{"textAlign": "center", "marginLeft": "auto", "marginRight": "auto"}}>
      <p className="ch" style={{"justifyContent": "center"}}>{t("l2.chFaq")}</p>
      <h2>{t("l2.faqTitle")}</h2>
      <p>{t("l2.faqSub").split("{link}")[0]}<a href="/faq" style={{ color: "var(--gold-lt)" }}>/faq</a>{t("l2.faqSub").split("{link}")[1]}</p></div>
    <div className="faq r d1">
      {/* Estas duas ficam à cabeça de propósito: são as objeções que a página levantava
          e não respondia — "isto é só trading?" e "dá para ganhar sem operar?". */}
      <div className="fq"><button><span>{t("l2.faq9Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq9A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq10Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq10A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq1Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq1A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq2Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq2A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq3Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq3A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq4Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq4A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq5Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq5A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq6Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq6A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq7Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq7A")}</p></div></div></div>
      <div className="fq"><button><span>{t("l2.faq8Q")}</span><i>+</i></button>
        <div className="ans"><div className="in2"><p>{t("l2.faq8A")}</p></div></div></div>
    </div>
  </div>
</section>

<section id="l2-packs">
  <div className="wrap">
    <div className="head r"><p className="ch"><b>09</b>{t("l2.ch9")}</p><h2>{t("l2.packsTitle")}</h2>
      <p>{t("l2.packsSub")}</p></div>
    <div className="packs">
      <div className="pk r d1"><div className="nm">{t("l2.packMember")}</div><div className="pr">35€</div><div className="pe">{t("l2.packMemberPer")}</div>
        <p className="ln2">{t("l2.packMemberLine")}</p>
        <ul><li>{t("l2.beat2Tool")}</li><li>{t("l2.packMember2")}</li><li>{t("l2.packMember3")}</li><li>{t("l2.comm4T")}</li></ul>
        <a className="btn g" href="/register?plan=app_member">{t("l2.packStart")}</a></div>
      <div className="pk star r d2"><span className="fl">{t("l2.packPremiumFlag")}</span><div className="nm">{t("l2.packPremium")}</div>
        <div className="pr">65€</div><div className="pe">{t("l2.packPremiumPer")}</div>
        <p className="ln2">{t("l2.packPremiumLine")}</p>
        <ul><li>{t("l2.packPremium1")}</li><li>{t("l2.packPremium2")}</li><li>{t("l2.packPremium3")}</li><li>{t("l2.packPremium4")}</li><li>{t("l2.packPremium5")}</li><li>{t("l2.packPremium6")}</li></ul>
        <a className="btn" href="/register?plan=premium">{t("l2.packStart")}</a></div>
      <div className="pk r d3"><div className="nm">{t("l2.packScanners")}</div><div className="pr">35€</div><div className="pe">{t("l2.packScannersPer")}</div>
        <p className="ln2">{t("l2.packScannersLine")}</p>
        <ul><li>Sensei</li><li>GoldKiller</li><li>MTM Scanner</li><li>Aurum Flow</li></ul>
        <a className="btn g" href="/scanner">{t("l2.packSeeScanners")}</a></div>
      {/* MTM Auto vive fora do ecossistema: é a porta para quem chega sem nos conhecer, e por
          isso tem preço próprio e checkout próprio — não é um extra dos packs. */}
      <div className="pk r d3"><div className="nm">{t("l2.packAuto")}</div><div className="pr">25€</div><div className="pe">{t("l2.packAutoPer")}</div>
        <p className="ln2">{t("l2.packAutoLine")}</p>
        <ul><li>{t("l2.packAuto1")}</li><li>{t("l2.packAuto2")}</li><li>{t("l2.packAuto3")}</li><li>{t("l2.packAuto4")}</li></ul>
        <p className="ln2" style={{color:"var(--gold-lt)"}}>{t("l2.packAutoFree")}</p>
        <a className="btn g" href="/mtmauto">{t("l2.packAutoCta")}</a></div>
      {/* O Sensei EA também vive fora dos packs: compra-se por licença e corre na máquina do
          cliente, sem passar por conta nenhuma nossa. */}
      <div className="pk r d3"><div className="nm">{t("l2.packEa")}</div><div className="pr">297€</div><div className="pe">{t("l2.packEaPer")}</div>
        <p className="ln2">{t("l2.packEaLine")}</p>
        <ul><li>{t("l2.packEa1")}</li><li>{t("l2.packEa2")}</li><li>{t("l2.packEa3")}</li><li>{t("l2.packEa4")}</li></ul>
        <p className="ln2" style={{color:"var(--gold-lt)"}}>{t("l2.packEaFree")}</p>
        <a className="btn g" href="/sensei-ea">{t("l2.packEaCta")}</a></div>

      {/* A segunda EA. O `ln2` da primeira linha diz que é OUTRA — sem isso, dois cartões
          com o nome Sensei lado a lado leem-se como dois planos do mesmo produto. */}
      <div className="pk d3"><div className="nm">{t("l2.packSc")}</div><div className="pr">200€</div><div className="pe">{t("l2.packScPer")}</div>
        <p className="ln2">{t("l2.packScLine")}</p>
        <ul><li>{t("l2.packSc1")}</li><li>{t("l2.packSc2")}</li><li>{t("l2.packSc3")}</li><li>{t("l2.packSc4")}</li></ul>
        <p className="ln2" style={{color:"var(--gold-lt)"}}>{t("l2.packScFree")}</p>
        <a className="btn g" href="/sensei-scalp">{t("l2.packScCta")}</a></div>
    </div>
    <p className="risk r d3">{t("l2.packsGuarantee")}</p>
  </div>
</section>


      {/* barra de conversão — entra depois da abertura e retira-se nos packs */}
      <div id="l2-cta" className={ctaOn ? "on" : ""}>
        <div className="in"><div className="bar">
          <div className="tx"><b>{t("l2.ctaBarTitle")}</b><span>{t("l2.ctaBarSub")}</span></div>
          <div className="ac">
            <button type="button" className="btn g" onClick={() => setVideo(true)}>{t("l2.ctaBarVideo")}</button>
            <a className="btn" href="#l2-packs">{t("l2.ctaBarPacks")}</a>
          </div>
          <button type="button" className="x" aria-label={t("l2.close")} onClick={() => { setCtaFechado(true); setCtaOn(false) }}>✕</button>
        </div></div>
      </div>

      {/* vídeo de boas-vindas — só carrega o iframe depois do clique */}
      {video && (
        <div className="vm on" role="dialog" aria-modal="true" aria-label={t("l2.videoTitle")} onClick={(e) => { if (e.target === e.currentTarget) setVideo(false) }}>
          <div className="vm__c">
            <div className="vm__h">
              <div><h3>{t("l2.videoTitle")}</h3><p>{t("l2.videoSub")}</p></div>
              <button type="button" className="vm__x" aria-label={t("l2.close")} onClick={() => setVideo(false)}>✕</button>
            </div>
            <div className="vm__f">
              {playing ? (
                <iframe
                  src="https://www.youtube.com/embed/dgd0-mLIrMw?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3"
                  title={t("l2.videoTitle")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  <img src="https://i.ytimg.com/vi/dgd0-mLIrMw/maxresdefault.jpg" alt={t("l2.videoTitle")} />
                  <div className="vm__p" onClick={() => setPlaying(true)}><span>▶</span></div>
                </>
              )}
            </div>
            <p className="vm__l">
              {t("l2.videoFallback")}{" "}
              <a href="https://www.youtube.com/watch?v=dgd0-mLIrMw" target="_blank" rel="noopener noreferrer">
                {t("l2.videoFallbackLink")}
              </a>.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

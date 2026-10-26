"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, X, PlayCircle } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { OUTRAS, textosOutra, extrasOutra, TESTEMUNHOS_OUTRAS, type Outra } from "./textos-linguas"

type Lang = "pt" | "en" | Outra
const LINGUAS: Lang[] = ["pt", "en", "es", "de", "it", "nl", "pl"]
const HTML_LANG: Record<Lang, string> = { pt: "pt-PT", en: "en", es: "es", de: "de", it: "it", nl: "nl", pl: "pl" }
const eOutra = (l: Lang): l is Outra => (OUTRAS as string[]).includes(l)
type Precos = { trialDias: number; premium1oMes: number; premiumMes: number; membroMes: number }

const eur = (v: number, lang: "pt" | "en") =>
  lang === "pt" ? `${String(v).replace(".", ",")} €` : `€${v}`

/**
 * Textos PT/EN da /apresentacao. Seguem o guião do vídeo (video/apresentacao/guiao.json):
 * a página e o vídeo dizem a mesma coisa pela mesma ordem, e acabam no mesmo sítio.
 * Os testemunhos ficam verbatim em português; em inglês mostra-se a tradução por baixo.
 */
function textos(lang: Lang, p: Precos) {
  if (eOutra(lang)) return textosOutra(lang, p)
  const d = p.trialDias
  if (lang === "en")
    return {
      voltar: "Back", entrar: "Sign in", area: "Member area",
      kicker: "MoreThanMoney · Presentation",
      h1a: "More than money.", h1b: "A system.",
      sub: "Learn, apply and follow everything in one place — live classes, our own scanners, the MTM System app and a community that has your back. Watch the video before you decide.",
      cta: `Start your ${d} free days`,
      micro: `No card · no charge during the ${d} days · cancel whenever you want`,
      video: "/videos/apresentacao-en.mp4", poster: "/videos/apresentacao-poster-en.jpg",
      probT: "Why most people give up",
      prob: "Random videos, tips from strangers, an account opened in a rush, money lost. Willpower was never the problem.",
      falta: ["No method", "No tools", "Nobody by your side"],
      comoT: "How the system works",
      como: [
        ["You learn", "Weekly live rooms — forex & gold, crypto, stocks & ETFs, social media, mindset — and every class recorded and organised into a course. From zero, at your pace."],
        ["You apply", "Scanners written by us read trend, zones and risk before you get in. On your phone and on TradingView. A checklist instead of a guess."],
        ["You follow", "The MTM System app: community feed, chat, live classes, alerts with entry, stop and targets, and the AI Mentor 24/7. You make the call."],
        ["You execute", "In the MTM Auto app, Tap to Trade opens the order in your account with one tap and the system manages it. MTM Auto also copies the house strategies. The account is always yours."],
      ],
      ganhaT: "Earn while you learn",
      ganha: [
        ["Open your account", "With PU Prime, a regulated broker, through our link."],
        ["Start small", "Apply what you saw in class, with defined risk."],
        ["Practise with the community", "Every step followed, every alert in the history."],
      ],
      ganhaCta: "How to open the account",
      risco: "Trading involves risk of capital loss. You decide every trade; we never hold your money.",
      provaT: "No cars. No profit promises.",
      prova: "Here we show process: positions are logged, alerts stay in the history and the community is there to check. What members wrote in the community chat:",
      traduzido: "translated",
      faqT: "Before you decide",
      faq: [
        ["I don't have time.", "Alerts arrive on your phone and classes are recorded."],
        ["I lost money before.", "Then you know why we start with risk management. Protecting capital comes first."],
        ["I know nothing about trading.", "The academy starts from zero, and the Fast Start guides you through the first days."],
        ["What does it cost?", `Premium is free for ${d} days, no card. If you stay, the 1st month is ${eur(p.premium1oMes, "en")} and then ${eur(p.premiumMes, "en")}/month. Monthly plans have a 7-day guarantee and no lock-in.`],
        ["I have an iPhone.", "Download the MTM System app and subscribe inside it. If you already paid on the website, just sign in — you don't pay twice."],
        ["Is this financial advice?", "No. It's education and decision tools. Results are not guaranteed and you decide every trade."],
      ],
      ofertaT: "Premium",
      oferta: [
        `${d} days free — no card`,
        `1st month ${eur(p.premium1oMes, "en")}, then ${eur(p.premiumMes, "en")}/month`,
        "Live classes, scanners, alerts, Tap to Trade",
        "MTM System app on iOS and Android",
        "7-day guarantee · no lock-in",
      ],
      membro: `Just want the app and the community? Member plan from ${eur(p.membroMes, "en")}/month.`,
      autoLink: "Only want the copy-trading app? MTM Auto",
      passosT: "Your next 4 steps",
      passos: ["Create your account", "Install the app", "Open your broker account", "Join your first class"],
      guiamos: "We guide you through each one at /onboarding.",
      afilT: "And if you want to share it",
      afil: "Affiliate plan: 30% on the first month and 10% on every renewal, for as long as the person you brought stays. But first, learn.",
      deck: "Presenting on a call? Open the full slides",
      aviso: "Educational content, not financial advice. Trading involves risk of capital loss. Past results do not guarantee future results.",
    }
  return {
    voltar: "Voltar", entrar: "Entrar", area: "Área de membro",
    kicker: "MoreThanMoney · Apresentação",
    h1a: "Mais do que dinheiro.", h1b: "Um sistema.",
    sub: "Aprendes, aplicas e acompanhas tudo no mesmo sítio — aulas ao vivo, scanners nossos, a app MTM System e uma comunidade ao teu lado. Vê o vídeo antes de decidires.",
    cta: `Começa os ${d} dias grátis`,
    micro: `Sem cartão · sem cobrança nos ${d} dias · cancelas quando quiseres`,
    video: "/videos/apresentacao-pt.mp4", poster: "/videos/apresentacao-poster-pt.jpg",
    probT: "Porque é que a maioria desiste",
    prob: "Vídeos soltos, dicas de desconhecidos, uma conta aberta à pressa, dinheiro perdido. O problema nunca foi a vontade.",
    falta: ["Sem método", "Sem ferramentas", "Sem ninguém ao lado"],
    comoT: "Como funciona o sistema",
    como: [
      ["Aprendes", "Salas ao vivo todas as semanas — forex e ouro, cripto, ações e ETF, redes sociais, mindset — e cada aula gravada e organizada em curso. Do zero, ao teu ritmo."],
      ["Aplicas", "Scanners escritos por nós leem a tendência, as zonas e o risco antes de entrares. No telemóvel e no TradingView. Um checklist em vez de um palpite."],
      ["Acompanhas", "A app MTM System: feed da comunidade, chat, aulas ao vivo, alertas com entrada, stop e alvos, e o Mentor AI 24/7. Quem decide és tu."],
      ["Executas", "Na app MTM Auto, o Tap to Trade abre a ordem na tua conta com um toque e o sistema gere a posição. O MTM Auto também copia as estratégias da casa. A conta é sempre tua."],
    ],
    ganhaT: "Ganha enquanto aprendes",
    ganha: [
      ["Abres a tua conta", "Na PU Prime, corretora regulada, pelo nosso link."],
      ["Começas pequeno", "Aplicas o que viste na sala, com o risco definido."],
      ["Praticas com a comunidade", "Cada passo acompanhado, cada alerta no histórico."],
    ],
    ganhaCta: "Como abrir a conta",
    risco: "O trading envolve risco de perda de capital. Quem decide cada operação és tu; nunca guardamos o teu dinheiro.",
    provaT: "Sem carros. Sem promessas de lucro.",
    prova: "Aqui mostra-se processo: as posições ficam registadas, os alertas ficam no histórico e a comunidade está lá para confirmar. O que os membros escreveram no chat da comunidade:",
    traduzido: "",
    faqT: "Antes de decidires",
    faq: [
      ["Não tenho tempo.", "Os alertas chegam ao telemóvel e as aulas ficam gravadas."],
      ["Já perdi dinheiro.", "Então percebes porque é que começamos pela gestão de risco. Proteger capital vem primeiro."],
      ["Não sei nada de trading.", "A academia começa do zero e o Fast Start guia-te nos primeiros dias."],
      ["Quanto custa?", `O Premium é grátis durante ${d} dias, sem cartão. Se ficares, o 1.º mês custa ${eur(p.premium1oMes, "pt")} e depois ${eur(p.premiumMes, "pt")}/mês. Os planos mensais têm 7 dias de garantia e não têm fidelização.`],
      ["Tenho iPhone.", "Descarregas a app MTM System e subscreves lá dentro. Se já pagaste no site, basta entrares — não pagas duas vezes."],
      ["Isto é aconselhamento financeiro?", "Não. É educação e ferramentas de decisão. Os resultados não são garantidos e quem decide cada operação és tu."],
    ],
    ofertaT: "Premium",
    oferta: [
      `${d} dias grátis — sem cartão`,
      `1.º mês ${eur(p.premium1oMes, "pt")}, depois ${eur(p.premiumMes, "pt")}/mês`,
      "Aulas ao vivo, scanners, alertas, Tap to Trade",
      "App MTM System em iOS e Android",
      "7 dias de garantia · sem fidelização",
    ],
    membro: `Só queres a app e a comunidade? Plano Membro a partir de ${eur(p.membroMes, "pt")}/mês.`,
    autoLink: "Só queres a app de cópia? MTM Auto",
    passosT: "Os teus próximos 4 passos",
    passos: ["Cria a tua conta", "Instala a app", "Abre a conta na corretora", "Entra na primeira aula"],
    guiamos: "Guiamos-te em cada um em /onboarding.",
    afilT: "E se quiseres partilhar",
    afil: "Plano de afiliado: 30% na primeira mensalidade e 10% em cada renovação, enquanto a pessoa que trouxeste ficar. Mas primeiro, aprende.",
    deck: "Vais apresentar numa chamada? Abre os slides completos",
    aviso: "Conteúdo educativo, não constitui aconselhamento financeiro. O trading envolve risco de perda de capital. Resultados passados não garantem resultados futuros.",
  }
}

/** Verbatim do chat da comunidade (docs/mtm-sales-brain.md §2). Não se editam. */
const TESTEMUNHOS: { pt: string; en: string }[] = [
  {
    pt: "O melhor Resultado que podemos ter não é o Saldo das contas... mas sim o poder que ganhamos ao saber proteger capital.",
    en: "The best result we can have isn't the account balance... it's the power we gain from knowing how to protect capital.",
  },
  {
    pt: "Grato por estar na melhor comunidade, ecossistema de educação financeira do país.",
    en: "Grateful to be in the best community, the best financial education ecosystem in the country.",
  },
  { pt: "Boas Maltinha. Fechei os Futuros que tinha em compra. Guardei lucros.", en: "Hi folks. Closed the futures I was holding. Took profits." },
  { pt: "Máquinas!!!! Vocês dão um up tão grande e uma força para que isto aconteça!! Obrigado 🙏", en: "Legends!!!! You give us such a boost and the strength to make this happen!! Thank you 🙏" },
  { pt: "Bora let's go, grato pela confiança.", en: "Let's go, grateful for the trust." },
]

/**
 * Dentro da app e os dois pilares. Os prints são do Ricardo (25/10/2026), com o win rate, o saldo e o
 * número de conta desfocados — a página não mostra números de desempenho.
 * Os pilares e as áreas seguem lib/pilares.ts (a mesma lista de /mtmmarkets e /contentbussiness).
 */
function extras(lang: Lang) {
  if (eOutra(lang)) return extrasOutra(lang)
  const en = lang === "en"
  return {
    pilar: en ? "Pillar" : "Pilar",
    appT: en ? "Inside the MTM System app" : "Por dentro da app MTM System",
    appSub: en ? "Real screens from the app, not mock-ups." : "Ecrãs reais da app, não maquetas.",
    telas: [
      ["/images/apresentacao/app-feed.jpg", "Feed", en ? "The community and the founder's posts, by topic." : "A comunidade e as publicações do fundador, por tema."],
      ["/images/apresentacao/app-chat.jpg", "Chat", en ? "Open channels per market, and the signals & ideas channels." : "Canais abertos por mercado, e os canais de sinais e ideias."],
      ["/images/apresentacao/app-aulas.jpg", en ? "Classes" : "Aulas", en ? "Every academy, live rooms and the weekly schedule." : "Todas as academias, salas ao vivo e a grelha da semana."],
      ["/images/apresentacao/app-alertas.jpg", en ? "Alerts" : "Alertas", en ? "Entry, stop and targets on the chart, with push notifications." : "Entrada, stop e alvos no gráfico, com notificação no telemóvel."],
      ["/images/apresentacao/app-scanner.jpg", "Scanner", en ? "Our scanners on the chart: GoldKiller, MTM, Sensei and more." : "Os nossos scanners no gráfico: GoldKiller, MTM, Sensei e mais."],
      ["/images/apresentacao/app-webtrader.jpg", "WebTrader", en ? "MTM Funded: practise on a simulated account inside the app." : "MTM Funded: praticas numa conta simulada dentro da app."],
    ] as [string, string, string][],
    fita: en
      ? ["Live classes", "Trading Alerts", "Tap to Trade", "MTM Auto", "Scanners", "AI Terminal", "Portfolios & DCA", "MTM Funded", "AI Mentor", "MTM Social Studio", "Community chat", "Certification"]
      : ["Aulas ao vivo", "Trading Alerts", "Tap to Trade", "MTM Auto", "Scanners", "Terminal com IA", "Portefólios e DCA", "MTM Funded", "Mentor AI", "Estúdio MTM Social", "Chat da comunidade", "Certificação"],
    pilaresT: en ? "Two pillars, one system" : "Dois pilares, um sistema",
    pilares: [
      {
        nome: "MTM Markets", href: "/mtmmarkets",
        def: en ? "Markets and money: learning to trade them, and the tools that trade them for you when you can't be there." : "Os mercados e o dinheiro: aprender a operá-los, e as ferramentas que os operam por ti quando não podes estar.",
        areas: en ? ["Forex & metals", "Crypto", "Stocks & ETFs", "Real estate"] : ["Forex e metais", "Criptomoedas", "Ações e ETF", "Imobiliário"],
        mais: en ? ["Alerts & Tap to Trade", "MTM Auto", "Scanners", "AI Terminal", "MTM Funded"] : ["Alertas e Tap to Trade", "MTM Auto", "Scanners", "Terminal com IA", "MTM Funded"],
      },
      {
        nome: "MTM Content & Business", href: "/contentbussiness",
        def: en ? "Building an audience and building a business: personal brand, content, and ways to earn here without opening a trade." : "Construir audiência e construir negócio: marca pessoal, conteúdo, e as formas de ganhar aqui sem abrir uma ordem.",
        areas: en ? ["Social media & UGC", "Faceless marketing", "Artificial intelligence", "Network marketing", "Mindset & leadership"] : ["Social Media e UGC", "Faceless Marketing", "Inteligência Artificial", "Network Marketing", "Mindset e Liderança"],
        mais: en ? ["MTM Social Studio", "Creator programme", "Invite & earn", "Marketing material"] : ["Estúdio MTM Social", "Programa de criadores", "Convida e ganha", "Material de marketing"],
      },
    ],
    academias: en ? "Academies" : "Academias",
    ferramentas: en ? "Tools" : "Ferramentas",
    verPilar: en ? "See the pillar" : "Ver o pilar",
  }
}

/** Aparece ao entrar no ecrã. Sem animação para quem pediu menos movimento. */
function Revela({ children, atraso = 0, className = "" }: { children: ReactNode; atraso?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visto, setVisto] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVisto(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${visto ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${className}`}
      style={{ transitionDelay: `${atraso}ms` }}
    >
      {children}
    </div>
  )
}

/** Os ecrãs da app, um de cada vez, a passar sozinhos até alguém tocar num. */
function CarrosselApp({ telas }: { telas: [string, string, string][] }) {
  const [i, setI] = useState(0)
  const [parado, setParado] = useState(false)
  useEffect(() => {
    if (parado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => setI((x) => (x + 1) % telas.length), 3800)
    return () => clearInterval(id)
  }, [parado, telas.length])
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
      <ul className="order-2 space-y-2 lg:order-1">
        {telas.slice(0, 3).map(([, n, d], k) => (
          <ItemTela key={n} n={n} d={d} ativo={i === k} onClick={() => { setI(k); setParado(true) }} />
        ))}
      </ul>
      <div className="relative order-1 mx-auto h-[540px] w-[260px] overflow-hidden rounded-[44px] border-[3px] lg:order-2" style={{ borderColor: "#2a2722", boxShadow: "0 30px 90px rgba(0,0,0,.7), 0 0 0 8px #050505, 0 0 80px rgba(210,166,60,.18)" }}>
        {telas.map(([src, n], k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={n} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top transition-all duration-700" style={{ opacity: i === k ? 1 : 0, transform: i === k ? "scale(1)" : "scale(1.04)" }} />
        ))}
      </div>
      <ul className="order-3 space-y-2">
        {telas.slice(3).map(([, n, d], k) => (
          <ItemTela key={n} n={n} d={d} ativo={i === k + 3} onClick={() => { setI(k + 3); setParado(true) }} />
        ))}
      </ul>
    </div>
  )
}

function ItemTela({ n, d, ativo, onClick }: { n: string; d: string; ativo: boolean; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="w-full rounded-2xl border p-4 text-left transition-all duration-300" style={{ borderColor: ativo ? "rgba(210,166,60,.6)" : "rgba(210,166,60,.15)", background: ativo ? "rgba(210,166,60,.10)" : "transparent" }}>
        <p className="text-[15px] font-bold" style={{ color: ativo ? OURO : "#f3ede1" }}>{n}</p>
        <p className="mt-1 text-[13px] leading-snug text-[#a39b8b]">{d}</p>
      </button>
    </li>
  )
}

const OURO = "#D2A63C"

export default function ApresentacaoVsl({ precos }: { precos: Precos }) {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState<Lang>("pt")
  const [query, setQuery] = useState("")

  // Idioma: ?lang= ganha, depois a última escolha, depois a língua do navegador. O ref de quem partilhou segue até ao onboarding.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const pedido = q.get("lang")
    let guardado: string | null = null
    try { guardado = localStorage.getItem("mtm_apresentacao_lang") } catch {}
    const valida = (v: string | null): v is Lang => !!v && (LINGUAS as string[]).includes(v)
    // Sem ?lang nem escolha guardada, segue a língua do navegador (pt-BR → pt, de-AT → de…).
    const doNavegador = (navigator.languages || [navigator.language]).map((x) => x.slice(0, 2).toLowerCase()).find(valida)
    const l: Lang = valida(pedido) ? pedido : valida(guardado) ? guardado : doNavegador ?? "pt"
    setLang(l)
    const ref = q.get("ref")
    if (ref) setQuery(`?ref=${encodeURIComponent(ref)}`)
  }, [])

  const mudar = (l: Lang) => {
    setLang(l)
    try { localStorage.setItem("mtm_apresentacao_lang", l) } catch {}
    const u = new URL(window.location.href)
    u.searchParams.set("lang", l)
    window.history.replaceState(null, "", u.toString())
  }

  const t = useMemo(() => textos(lang, precos), [lang, precos])
  const x = useMemo(() => extras(lang), [lang])
  const destino = `/onboarding${query}`

  const Cta = ({ grande }: { grande?: boolean }) => (
    <div className="flex flex-col items-center gap-3">
      <Link
        href={destino}
        className={`rounded-2xl font-bold text-black transition-transform hover:scale-[1.02] ${grande ? "px-10 py-5 text-lg" : "px-8 py-4 text-base"}`}
        style={{ background: `linear-gradient(180deg, #E9C46A, ${OURO})`, boxShadow: "0 12px 40px rgba(210,166,60,.25)" }}
      >
        {t.cta}
      </Link>
      <p className="text-center text-[13px] text-[#a39b8b]">{t.micro}</p>
    </div>
  )

  return (
    <div className="min-h-screen text-[#f3ede1]" style={{ background: "#0b0a08" }} lang={HTML_LANG[lang]}>
      <header
        className="sticky top-0 z-50 flex h-14 items-center justify-between px-4 sm:px-6"
        style={{ background: "rgba(11,10,8,.88)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(210,166,60,.15)" }}
      >
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: OURO }}>
          <ArrowLeft size={15} /> {t.voltar}
        </button>
        <div className="flex items-center gap-3">
          <select
            value={lang}
            onChange={(e) => mudar(e.target.value as Lang)}
            aria-label="Idioma / Language"
            className="rounded-lg border bg-transparent px-2 py-1 text-[12px] font-bold uppercase md:hidden"
            style={{ borderColor: "rgba(210,166,60,.3)", color: OURO }}
          >
            {LINGUAS.map((l) => <option key={l} value={l} style={{ background: "#0b0a08" }}>{l.toUpperCase()}</option>)}
          </select>
          <div className="hidden rounded-lg border p-0.5 text-[12px] font-bold md:flex" style={{ borderColor: "rgba(210,166,60,.3)" }} role="group" aria-label="Idioma / Language">
            {LINGUAS.map((l) => (
              <button
                key={l}
                onClick={() => mudar(l)}
                aria-pressed={lang === l}
                className="rounded-md px-2 py-1 uppercase sm:px-2.5"
                style={lang === l ? { background: OURO, color: "#111" } : { color: OURO }}
              >
                {l}
              </button>
            ))}
          </div>
          <Link
            href={user ? "/member-area" : "/login"}
            className="rounded-lg px-3.5 py-1.5 text-[12px] font-bold"
            style={{ color: OURO, background: "rgba(210,166,60,.1)", border: "1px solid rgba(210,166,60,.3)" }}
          >
            {user ? t.area : t.entrar}
          </Link>
        </div>
      </header>

      <main>
        {/* Hero + vídeo */}
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pt-16">
          <p className="text-[12px] font-semibold uppercase tracking-[.3em]" style={{ color: OURO }}>{t.kicker}</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {t.h1a} <span style={{ color: OURO }}>{t.h1b}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[#c9c1b1] sm:text-[18px]">{t.sub}</p>
          <div className="mx-auto mt-9 overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(210,166,60,.3)", boxShadow: "0 30px 90px rgba(0,0,0,.6)" }}>
            <video key={t.video} className="aspect-video w-full bg-black" controls playsInline preload="metadata" poster={t.poster}>
              <source src={t.video} type="video/mp4" />
              <track kind="subtitles" src={t.video.replace(/\.mp4$/, ".vtt")} srcLang={lang} label={lang.toUpperCase()} />
            </video>
          </div>
          <div className="mt-9"><Cta grande /></div>
        </section>

        {/* Fita das funcionalidades */}
        <div className="relative overflow-hidden border-y py-4" style={{ borderColor: "rgba(210,166,60,.15)" }} aria-hidden>
          <div className="mtm-fita flex w-max gap-10 whitespace-nowrap text-[15px] font-semibold uppercase tracking-[.2em]" style={{ color: OURO }}>
            {[...x.fita, ...x.fita].map((f, k) => <span key={k}>✦ {f}</span>)}
          </div>
          <style>{`@keyframes mtmFita{from{transform:translateX(0)}to{transform:translateX(-50%)}}.mtm-fita{animation:mtmFita 40s linear infinite}@media (prefers-reduced-motion: reduce){.mtm-fita{animation:none}}`}</style>
        </div>

        {/* O problema */}
        <section className="border-y px-4 py-14 sm:px-6" style={{ borderColor: "rgba(210,166,60,.12)", background: "rgba(255,255,255,.015)" }}>
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">{t.probT}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-[#b9b1a1]">{t.prob}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {t.falta.map((f) => (
                <span key={f} className="flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-semibold" style={{ borderColor: "rgba(255,90,79,.35)", color: "#f0a39d" }}>
                  <X size={15} /> {f}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">{t.comoT}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.como.map(([titulo, txt], i) => (
              <Revela key={titulo} atraso={i * 120}>
              <div className="h-full rounded-2xl border p-6 transition-transform duration-300 hover:-translate-y-1" style={{ borderColor: "rgba(210,166,60,.2)", background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01))" }}>
                <p className="font-mono text-[13px]" style={{ color: OURO }}>0{i + 1}</p>
                <h3 className="mt-2 text-xl font-bold">{titulo}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#b9b1a1]">{txt}</p>
              </div>
              </Revela>
            ))}
          </div>
        </section>

        {/* Os dois pilares */}
        <section className="px-4 py-16 sm:px-6" style={{ background: "radial-gradient(900px 420px at 50% 0%, rgba(210,166,60,.08), transparent 70%)" }}>
          <div className="mx-auto max-w-6xl">
            <Revela><h2 className="text-center text-2xl font-bold sm:text-3xl">{x.pilaresT}</h2></Revela>
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              {x.pilares.map((pl, k) => (
                <Revela key={pl.nome} atraso={k * 150}>
                  <div className="group h-full rounded-3xl border p-7 transition-transform duration-300 hover:-translate-y-1" style={{ borderColor: "rgba(210,166,60,.3)", background: "linear-gradient(180deg,#16130c,#0e0c09)" }}>
                    <p className="font-mono text-[12px] uppercase tracking-[.25em] text-[#8f887a]">{x.pilar} {k + 1}</p>
                    <h3 className="mt-2 text-2xl font-extrabold sm:text-3xl" style={{ color: OURO }}>{pl.nome}</h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-[#c9c1b1]">{pl.def}</p>
                    <p className="mt-5 text-[12px] font-bold uppercase tracking-[.2em] text-[#8f887a]">{x.academias}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pl.areas.map((a) => <span key={a} className="rounded-full border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: "rgba(210,166,60,.35)", color: "#E9C46A" }}>{a}</span>)}
                    </div>
                    <p className="mt-4 text-[12px] font-bold uppercase tracking-[.2em] text-[#8f887a]">{x.ferramentas}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pl.mais.map((a) => <span key={a} className="rounded-full bg-white/5 px-3 py-1.5 text-[13px] text-[#d9d2c3]">{a}</span>)}
                    </div>
                    <Link href={pl.href} className="mt-6 inline-block text-[14px] font-semibold underline underline-offset-4" style={{ color: OURO }}>{x.verPilar} →</Link>
                  </div>
                </Revela>
              ))}
            </div>
          </div>
        </section>

        {/* Por dentro da app */}
        <section className="border-y px-4 py-16 sm:px-6" style={{ borderColor: "rgba(210,166,60,.12)", background: "rgba(255,255,255,.015)" }}>
          <div className="mx-auto max-w-6xl">
            <Revela>
              <h2 className="text-center text-2xl font-bold sm:text-3xl">{x.appT}</h2>
              <p className="mt-2 text-center text-[15px] text-[#b9b1a1]">{x.appSub}</p>
            </Revela>
            <Revela atraso={150} className="mt-10"><CarrosselApp telas={x.telas} /></Revela>
          </div>
        </section>

        {/* Ganha enquanto aprendes */}
        <section className="px-4 py-16 sm:px-6" style={{ background: "radial-gradient(800px 400px at 50% 0%, rgba(210,166,60,.10), transparent 70%)" }}>
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="text-3xl font-extrabold sm:text-4xl" style={{ color: OURO }}>{t.ganhaT}</h2>
            <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
              {t.ganha.map(([a, b], i) => (
                <Revela key={a} atraso={i * 150}>
                <div className="h-full rounded-2xl border p-6" style={{ borderColor: "rgba(210,166,60,.25)", background: "#12100c" }}>
                  <p className="text-3xl font-black" style={{ color: OURO }}>0{i + 1}</p>
                  <h3 className="mt-2 text-lg font-bold">{a}</h3>
                  <p className="mt-1 text-[14px] text-[#b9b1a1]">{b}</p>
                </div>
                </Revela>
              ))}
            </div>
            <Link href="/abrir-conta" className="mt-7 inline-block text-[14px] font-semibold underline underline-offset-4" style={{ color: OURO }}>
              {t.ganhaCta} →
            </Link>
            <p className="mx-auto mt-4 max-w-xl text-[12px] text-[#8f887a]">{t.risco}</p>
          </div>
        </section>

        {/* Prova */}
        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">{t.provaT}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-[15px] leading-relaxed text-[#b9b1a1]">{t.prova}</p>
          <div className="mt-8 space-y-4">
            {TESTEMUNHOS.map((m, i) => (
              <Revela key={i} atraso={i * 120}>
              <figure className="rounded-2xl border p-6" style={{ borderColor: "rgba(210,166,60,.18)", background: "rgba(255,255,255,.02)" }}>
                <blockquote className={i === 0 ? "text-xl italic leading-snug sm:text-2xl" : "text-[16px]"} lang="pt-PT">“{m.pt}”</blockquote>
                {lang !== "pt" && <p className="mt-2 text-[13px] text-[#8f887a]">{eOutra(lang) ? TESTEMUNHOS_OUTRAS[lang][i] : m.en} ({t.traduzido})</p>}
              </figure>
              </Revela>
            ))}
          </div>
        </section>

        {/* Objeções */}
        <section className="border-y px-4 py-16 sm:px-6" style={{ borderColor: "rgba(210,166,60,.12)", background: "rgba(255,255,255,.015)" }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">{t.faqT}</h2>
            <div className="mt-8 divide-y" style={{ borderColor: "rgba(210,166,60,.15)" }}>
              {t.faq.map(([q, a]) => (
                <details key={q} className="group py-4" style={{ borderColor: "rgba(210,166,60,.15)" }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] font-semibold">
                    {q}
                    <span className="ml-4 transition-transform group-open:rotate-45" style={{ color: OURO }}>+</span>
                  </summary>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#b9b1a1]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Oferta + passos */}
        <section className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div className="rounded-3xl border p-8" style={{ borderColor: "rgba(210,166,60,.55)", background: "linear-gradient(180deg,#1a160d,#0f0d09)" }}>
            <p className="text-[12px] font-bold uppercase tracking-[.3em]" style={{ color: OURO }}>{t.ofertaT}</p>
            <ul className="mt-5 space-y-3">
              {t.oferta.map((o, i) => (
                <li key={o} className={`flex items-start gap-3 ${i === 0 ? "text-2xl font-extrabold" : "text-[15px]"}`}>
                  <Check size={i === 0 ? 24 : 18} className="mt-1 shrink-0" style={{ color: OURO }} /> {o}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] text-[#8f887a]">{t.membro}</p>
            <Link href="/onboarding/mtm-auto" className="mt-1 inline-block text-[13px] underline underline-offset-4 text-[#b9b1a1]">{t.autoLink} →</Link>
          </div>
          <div className="flex flex-col justify-between rounded-3xl border p-8" style={{ borderColor: "rgba(210,166,60,.2)" }}>
            <div>
              <h2 className="text-2xl font-bold">{t.passosT}</h2>
              <ol className="mt-5 space-y-3">
                {t.passos.map((p, i) => (
                  <li key={p} className="flex items-center gap-4 text-[16px] font-semibold">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[14px] font-black text-black" style={{ background: OURO }}>{i + 1}</span>
                    {p}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[14px] text-[#b9b1a1]">{t.guiamos}</p>
            </div>
            <div className="mt-8"><Cta /></div>
          </div>
        </section>

        {/* Segunda porta */}
        <section className="mx-auto max-w-3xl px-4 pb-16 text-center sm:px-6">
          <h2 className="text-xl font-bold">{t.afilT}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#b9b1a1]">{t.afil}</p>
          <a href="/apresentacoes/mtm-oportunidade.html?v=19" target="_blank" rel="noopener" className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: OURO }}>
            <PlayCircle size={16} /> {t.deck}
          </a>
        </section>
      </main>

      <footer className="border-t px-4 py-8 text-center text-[12px] leading-relaxed text-[#8f887a] sm:px-6" style={{ borderColor: "rgba(210,166,60,.12)" }}>
        <p className="mx-auto max-w-3xl">{t.aviso}</p>
        <p className="mt-2">© 2026 MoreThanMoney · morethanmoney.pt</p>
      </footer>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, X, PlayCircle } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

type Lang = "pt" | "en"
type Precos = { trialDias: number; premium1oMes: number; premiumMes: number; membroMes: number }

const eur = (v: number, lang: Lang) =>
  lang === "pt" ? `${String(v).replace(".", ",")} €` : `€${v}`

/**
 * Textos PT/EN da /apresentacao. Seguem o guião do vídeo (video/apresentacao/guiao.json):
 * a página e o vídeo dizem a mesma coisa pela mesma ordem, e acabam no mesmo sítio.
 * Os testemunhos ficam verbatim em português; em inglês mostra-se a tradução por baixo.
 */
function textos(lang: Lang, p: Precos) {
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
        ["You execute", "Tap to Trade opens the order in your account with one tap and the system manages it. MTM Auto copies the house strategies. The account is always yours."],
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
      ["Executas", "O Tap to Trade abre a ordem na tua conta com um toque e o sistema gere a posição. O MTM Auto copia as estratégias da casa. A conta é sempre tua."],
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
]

const OURO = "#D2A63C"

export default function ApresentacaoVsl({ precos }: { precos: Precos }) {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState<Lang>("pt")
  const [query, setQuery] = useState("")

  // Idioma: ?lang= ganha, depois a última escolha. O ref de quem partilhou segue até ao onboarding.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const pedido = q.get("lang")
    let guardado: string | null = null
    try { guardado = localStorage.getItem("mtm_apresentacao_lang") } catch {}
    const l = pedido === "en" || pedido === "pt" ? pedido : guardado === "en" ? "en" : "pt"
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
    <div className="min-h-screen text-[#f3ede1]" style={{ background: "#0b0a08" }} lang={lang === "pt" ? "pt-PT" : "en"}>
      <header
        className="sticky top-0 z-50 flex h-14 items-center justify-between px-4 sm:px-6"
        style={{ background: "rgba(11,10,8,.88)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(210,166,60,.15)" }}
      >
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: OURO }}>
          <ArrowLeft size={15} /> {t.voltar}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border p-0.5 text-[12px] font-bold" style={{ borderColor: "rgba(210,166,60,.3)" }} role="group" aria-label="Idioma / Language">
            {(["pt", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => mudar(l)}
                aria-pressed={lang === l}
                className="rounded-md px-2.5 py-1 uppercase"
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
            </video>
          </div>
          <div className="mt-9"><Cta grande /></div>
        </section>

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
              <div key={titulo} className="rounded-2xl border p-6" style={{ borderColor: "rgba(210,166,60,.2)", background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01))" }}>
                <p className="font-mono text-[13px]" style={{ color: OURO }}>0{i + 1}</p>
                <h3 className="mt-2 text-xl font-bold">{titulo}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#b9b1a1]">{txt}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Ganha enquanto aprendes */}
        <section className="px-4 py-16 sm:px-6" style={{ background: "radial-gradient(800px 400px at 50% 0%, rgba(210,166,60,.10), transparent 70%)" }}>
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="text-3xl font-extrabold sm:text-4xl" style={{ color: OURO }}>{t.ganhaT}</h2>
            <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
              {t.ganha.map(([a, b], i) => (
                <div key={a} className="rounded-2xl border p-6" style={{ borderColor: "rgba(210,166,60,.25)", background: "#12100c" }}>
                  <p className="text-3xl font-black" style={{ color: OURO }}>0{i + 1}</p>
                  <h3 className="mt-2 text-lg font-bold">{a}</h3>
                  <p className="mt-1 text-[14px] text-[#b9b1a1]">{b}</p>
                </div>
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
              <figure key={i} className="rounded-2xl border p-6" style={{ borderColor: "rgba(210,166,60,.18)", background: "rgba(255,255,255,.02)" }}>
                <blockquote className={i === 0 ? "text-xl italic leading-snug sm:text-2xl" : "text-[16px]"} lang="pt-PT">“{m.pt}”</blockquote>
                {lang === "en" && <p className="mt-2 text-[13px] text-[#8f887a]">{m.en} ({t.traduzido})</p>}
              </figure>
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

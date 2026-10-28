import type { Metadata } from "next"
import Link from "next/link"
import { Unbounded } from "next/font/google"
import { ArrowRight, ArrowUpRight, Asterisk, Bot, Check, KeyRound, Download, Plus } from "lucide-react"
import s from "@/components/scanner/scanner-landing.module.css"
import e from "@/components/ea/ea-landing.module.css"

// Funil simples dos EAs: escolhe pelo teu estilo, vê os três lado a lado e segue para a landing de cada um.

const display = Unbounded({ subsets: ["latin"], weight: ["600", "800"], display: "swap" })

export const metadata: Metadata = {
  title: "EAs para MetaTrader 5 · MoreThanMoney",
  description:
    "MTM Sensei EA, Sensei Scalp Edition e MTM Premium Scanner EA: três Expert Advisors para MetaTrader 5, com licença por conta. Escolhe o que encaixa no teu estilo.",
  alternates: { canonical: "/ea" },
}

const EAS = [
  {
    href: "/sensei-ea",
    nome: "MTM Sensei EA",
    tag: "Ouro, BTC e US30 · M15 e H1",
    texto: "Vinte confirmações antes de cada entrada, quatro saídas parciais, breakeven e trailing. Poucas trades por dia, com stop e alvos na corretora.",
    pontos: ["Entra a mercado quando o setup confirma", "Modo prop firm e filtro de notícias", "Incluído para membros Premium, VIP e Fundador"],
    preco: "297 €/ano · 1000 € vitalícia",
  },
  {
    href: "/premium-scanner-ea",
    nome: "MTM Premium Scanner EA",
    tag: "Ouro · M15 · TradingView + MT5",
    texto: "A regra do Premium Scanner nas três sessões do ouro: cinco critérios votam a direcção, espera pelo recuo e gere por partes. Indicador, estratégia e EA no mesmo pacote.",
    pontos: ["Ordem limite no meio da zona", "50 % no TP1 e stop na entrada", "Indicador + estratégia no TradingView"],
    preco: "1250 € · pacote vitalício",
    hi: true,
  },
  {
    href: "/sensei-scalp",
    nome: "MTM Sensei Scalp Edition",
    tag: "Ouro · M5 · scalper",
    texto: "Uma pendente de cada lado, breakeven desde o primeiro cêntimo e reversão quando o preço vira. Dezenas de ciclos por dia, com três travões de risco ligados.",
    pontos: ["O preço escolhe o lado", "Tecto diário de ciclos e de perda", "Licença separada do Sensei EA"],
    preco: "200 €/ano · 697 € vitalícia",
  },
]

const ESCOLHA = [
  { q: "Quero poucas trades, com stop e alvos fixos", a: "MTM Sensei EA", href: "/sensei-ea" },
  { q: "Quero a regra do Premium Scanner no ouro, também no TradingView", a: "MTM Premium Scanner EA", href: "/premium-scanner-ea" },
  { q: "Quero um scalper rápido no ouro em M5", a: "MTM Sensei Scalp Edition", href: "/sensei-scalp" },
]

const FAQ = [
  { q: "Uma licença serve para os três?", a: "Não. Cada EA tem a sua licença, por conta MT5. Uma chave não abre outro EA, e o próprio EA diz-te se colaste a chave errada." },
  { q: "Preciso de deixar o computador ligado?", a: "Sim, ou de uma VPS. Os EAs correm dentro do MetaTrader 5 — se o terminal fechar, não abrem ordens novas." },
  { q: "Posso experimentar antes?", a: "Os pacotes são abertos: descarregas, instalas e conheces o painel. Para abrir ordens precisas da chave. Testa sempre em conta demo e no testador do MetaTrader primeiro." },
  { q: "Como recebo a licença?", a: "Pagas na página do EA e a chave segue por email, no formato MTM-XXXX-XXXX-XXXX, com o pacote e o guia." },
]

export default function EaHubPage() {
  return (
    <div className={s.page}>
      <div className={s.grain} aria-hidden="true" />

      <section className={s.hero} style={{ paddingBottom: "clamp(48px, 7vw, 96px)" }}>
        <div className={s.heroGlow} aria-hidden="true" />
        <div className={`${s.container} ${s.heroGrid}`}>
          <div>
            <span className={`${e.eyebrow} ${s.fadeIn}`}>
              <Bot size={14} /> Expert Advisors · MetaTrader 5
            </span>
            <h1 className={`${display.className} ${s.heroTitle}`}>
              <span className={s.line}><span className={s.rise}>Os EAs</span></span>
              <span className={s.line}><span className={`${s.rise} ${s.gold}`}>da MTM</span></span>
            </h1>
          </div>
          <div>
            <p className={`${s.heroSub} ${s.fadeIn}`}>
              Três robôs para o MetaTrader 5, cada um com a sua regra e o seu ritmo. Escolhe pelo teu estilo, vê o que cada
              um faz e compra a licença na página dele.
            </p>
            <div className={`${s.ctas} ${s.fadeIn}`}>
              <a className={s.btnGold} href="#escolher">
                Qual é o meu?
                <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
              </a>
              <a className={s.btnGlass} href="#eas">Ver os três</a>
            </div>
          </div>
        </div>
      </section>

      <div className={s.marquee} aria-label="MTM Sensei EA, MTM Premium Scanner EA, MTM Sensei Scalp Edition">
        <div className={s.marqueeTrack} aria-hidden="true">
          {Array.from({ length: 4 }).flatMap((_, k) =>
            ["MTM Sensei EA", "MTM Premium Scanner EA", "MTM Sensei Scalp Edition"].map((m) => (
              <span key={`${k}-${m}`}>{m}<Asterisk size={18} strokeWidth={2.5} /></span>
            )),
          )}
        </div>
      </div>

      <section id="escolher" className={s.section}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle}`}>
            Qual é <span className={s.gold}>o teu?</span>
          </h2>
          <div className={e.quiz}>
            {ESCOLHA.map((c) => (
              <Link key={c.href} href={c.href} className={e.quizItem}>
                <span>{c.q}</span>
                <b>{c.a}</b>
                <em>Ver a página <ArrowRight size={14} /></em>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="eas" className={s.section} style={{ paddingTop: 0 }}>
        <div className={s.container}>
          <h2 className={`${display.className} ${s.sectionTitle}`}>
            Os três <span className={s.gold}>lado a lado</span>
          </h2>
          <div className={e.eaCards}>
            {EAS.map((ea) => (
              <article key={ea.href} className={`${e.eaCard} ${ea.hi ? e.eaCardHi : ""}`}>
                <span className={e.eaTag}>{ea.tag}</span>
                <h3 className={display.className}>{ea.nome}</h3>
                <p>{ea.texto}</p>
                <ul>
                  {ea.pontos.map((p) => (
                    <li key={p}><Check size={16} /> {p}</li>
                  ))}
                </ul>
                <span className={e.eaPrice}>{ea.preco}</span>
                <Link href={ea.href} className={ea.hi ? s.btnGold : s.btnGlass}>
                  Conhecer o {ea.nome.replace(/^MTM /, "")}
                  <span className={s.btnIcon}><ArrowUpRight size={16} strokeWidth={2.2} /></span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.how}`}>
        <div className={`${s.container} ${s.howGrid}`}>
          <div className={s.howSticky}>
            <h2 className={`${display.className} ${s.sectionTitle}`}>Do pagamento <span className={s.gold}>ao gráfico</span></h2>
            <p className={s.body}>O mesmo caminho nos três EAs. Uma licença vale para uma conta MT5.</p>
          </div>
          <ol className={s.steps}>
            <li className={s.step}>
              <h3 className={display.className}><KeyRound size={18} /> Pagas e recebes a chave</h3>
              <p>Na página do EA, com Stripe. A chave chega por email com o pacote e o guia.</p>
            </li>
            <li className={s.step}>
              <h3 className={display.className}><Download size={18} /> Instalas no MetaTrader 5</h3>
              <p>Copias o pacote para o teu MT5 e permites o WebRequest para https://www.morethanmoney.pt.</p>
            </li>
            <li className={s.step}>
              <h3 className={display.className}><Bot size={18} /> Testas e ligas</h3>
              <p>Primeiro em demo e com o lote mínimo. Sobe só quando conheceres o ritmo do EA na tua corretora.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className={s.section}>
        <div className={`${s.container} ${s.faqWrap}`}>
          <h2 className={`${display.className} ${s.sectionTitle}`}>Perguntas que nos fazem sempre</h2>
          <div>
            {FAQ.map((f) => (
              <details key={f.q} className={s.faq}>
                <summary>
                  {f.q} <Plus size={18} />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={s.final}>
        <div className={s.finalGlow} aria-hidden="true" />
        <div className={s.container}>
          <h2 className={`${display.className} ${s.finalTitle}`}>Escolhe o teu EA</h2>
          <nav className={s.others} aria-label="EAs">
            {EAS.map((ea) => (
              <Link key={ea.href} href={ea.href}>{ea.nome}</Link>
            ))}
            <Link href="/scanner">Scanners</Link>
          </nav>
          <p className={s.disclaimer}>
            Conteúdo educativo, não constitui consultoria financeira. Software de apoio à decisão. Negociar com alavancagem
            implica risco de perda do capital investido. Resultados passados não garantem resultados futuros.
          </p>
        </div>
      </section>
    </div>
  )
}

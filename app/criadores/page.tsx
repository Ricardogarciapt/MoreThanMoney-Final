import type { Metadata } from "next"
import Link from "next/link"

/**
 * Landing de recrutamento de CRIADORES/EDUCADORES (MTM Marketplace).
 * Destino dos CTA do carrossel «Traz o teu conteúdo. Nós vendemos por ti.» e da intent
 * 'educator' do funil de Instagram (lib/instagram/funnel.ts). Página estática, preto+dourado.
 * As candidaturas encaminham para conversa pessoal com o Ricardo (@ricardogarciapt).
 */

const GOLD = "#D2A63C"
const INK = "#0b0d12"
const PAPER = "#f5f2ea"
const MUTED = "#9aa0ac"
const APPLY_DM = "https://ig.me/m/ricardogarciapt"

export const metadata: Metadata = {
  title: "Criadores & Educadores | More Than Money",
  description:
    "Traz o teu conteúdo. Nós vendemos por ti. Ficas com 90%, 0€ de entrada. A MTM trata da promoção, tráfego, pagamentos e alojamento. Candidaturas abertas.",
  openGraph: {
    title: "Traz o teu conteúdo. Nós vendemos por ti. | MTM Creators",
    description:
      "Ficas com 90% de tudo o que vendes. 10% de comissão MTM, só quando vendes. 0€ de entrada. Candidaturas abertas.",
    url: "https://www.morethanmoney.pt/criadores",
    siteName: "More Than Money",
    locale: "pt_PT",
    type: "website",
  },
}

const AREAS = [
  "Finanças Pessoais",
  "Stocks & ETF",
  "Fitness Trainer",
  "UGC Educator",
  "Trading & Cripto",
  "Mindset & Produtividade",
]

const DOES = [
  { t: "Promoção & tráfego", d: "Site, redes sociais e email a trabalhar pelo teu conteúdo." },
  { t: "Pagamentos & faturação", d: "Checkout, cobranças e faturação tratados por nós." },
  { t: "Alojamento & tecnologia", d: "Plataforma, área de membros e app já construídas." },
  { t: "Comunidade", d: "356 membros ativos e a crescer, prontos a comprar." },
]

const STEPS = [
  { n: "01", t: "Publicas o teu conteúdo", d: "Curso, mentoria ou comunidade — o formato é teu." },
  { n: "02", t: "Nós promovemos e vendemos", d: "Tráfego, funil, pagamentos e suporte por nossa conta." },
  { n: "03", t: "Recebes 90%", d: "Comissão MTM de 10% só quando há venda. Simples." },
]

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        border: `1px solid ${GOLD}55`,
        color: PAPER,
        background: "rgba(210,166,60,0.06)",
        borderRadius: 999,
        padding: "12px 22px",
        fontSize: 18,
        fontWeight: 600,
        margin: "0 10px 12px 0",
      }}
    >
      {children}
    </span>
  )
}

export default function CriadoresPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: INK,
        backgroundImage:
          "radial-gradient(900px 500px at 50% -8%, rgba(210,166,60,0.18), rgba(210,166,60,0) 60%)",
        color: PAPER,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "clamp(40px, 6vw, 96px) clamp(20px, 5vw, 56px)" }}>
        {/* topbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: GOLD, display: "inline-block" }} />
            <span style={{ color: GOLD, fontSize: 15, fontWeight: 700, letterSpacing: 3 }}>MTM CREATORS</span>
          </div>
          <span style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>@morethanmoney.pt</span>
        </div>

        {/* hero */}
        <div style={{ width: 96, height: 8, background: GOLD, borderRadius: 4, marginBottom: 28 }} />
        <h1 style={{ fontSize: "clamp(40px, 8vw, 84px)", lineHeight: 1.03, fontWeight: 900, letterSpacing: -1.5, margin: 0 }}>
          Traz o teu conteúdo.
          <br />
          <span style={{ color: GOLD }}>Nós vendemos por ti.</span>
        </h1>
        <p style={{ color: MUTED, fontSize: "clamp(18px, 2.4vw, 24px)", marginTop: 24, maxWidth: 680, lineHeight: 1.5 }}>
          A More Than Money está a recrutar criadores e educadores para o marketplace. Sem promessas. Só ferramentas
          reais.
        </p>
        <div style={{ marginTop: 36, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <Link
            href={APPLY_DM}
            style={{
              display: "inline-block",
              background: GOLD,
              color: INK,
              fontWeight: 800,
              fontSize: 19,
              padding: "18px 34px",
              borderRadius: 999,
              textDecoration: "none",
            }}
          >
            Candidata-te →
          </Link>
          <span style={{ color: MUTED, fontSize: 16 }}>
            ou comenta «CRIAR» num dos nossos posts no Instagram
          </span>
        </div>

        {/* model stats */}
        <section
          style={{
            marginTop: 72,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
          }}
        >
          {[
            { big: "90%", small: "Fica contigo de tudo o que vendes" },
            { big: "5–10%", small: "Comissão MTM — só quando vendes" },
            { big: "0€", small: "De entrada · sem mensalidade · sem exclusividade" },
          ].map((s) => (
            <div
              key={s.big}
              style={{ border: `1px solid ${GOLD}22`, borderRadius: 20, padding: "28px 26px", background: "rgba(255,255,255,0.02)" }}
            >
              <div style={{ color: GOLD, fontSize: "clamp(36px, 5vw, 52px)", fontWeight: 900, letterSpacing: -1 }}>{s.big}</div>
              <div style={{ color: MUTED, fontSize: 16, marginTop: 8, lineHeight: 1.4 }}>{s.small}</div>
            </div>
          ))}
        </section>

        {/* what MTM does */}
        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: -0.5, margin: 0 }}>
            Tu crias. Nós tratamos do resto.
          </h2>
          <div
            style={{
              marginTop: 32,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
          >
            {DOES.map((d) => (
              <div key={d.t} style={{ display: "flex", gap: 16 }}>
                <span
                  style={{ width: 18, height: 18, minWidth: 18, marginTop: 6, background: GOLD, borderRadius: 4, transform: "rotate(45deg)" }}
                />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{d.t}</div>
                  <div style={{ color: MUTED, fontSize: 16, marginTop: 4, lineHeight: 1.45 }}>{d.d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* open areas */}
        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: -0.5, margin: 0 }}>Áreas em aberto</h2>
          <p style={{ color: MUTED, fontSize: 17, marginTop: 12, marginBottom: 28 }}>
            Procuramos criadores fortes nestas áreas — e abrimos outras se fizer sentido.
          </p>
          <div>
            {AREAS.map((a) => (
              <Pill key={a}>{a}</Pill>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: -0.5, margin: 0 }}>Como funciona</h2>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 28 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                <div style={{ color: GOLD, fontSize: "clamp(30px, 4vw, 44px)", fontWeight: 900, minWidth: 72 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{s.t}</div>
                  <div style={{ color: MUTED, fontSize: 16, marginTop: 4, lineHeight: 1.45 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* final CTA */}
        <section
          style={{
            marginTop: 88,
            border: `1px solid ${GOLD}33`,
            borderRadius: 28,
            padding: "clamp(32px, 5vw, 56px)",
            background: "rgba(210,166,60,0.05)",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "clamp(30px, 5vw, 52px)", fontWeight: 900, letterSpacing: -1, margin: 0 }}>Candidata-te</h2>
          <p style={{ color: MUTED, fontSize: 18, marginTop: 16, maxWidth: 620, marginInline: "auto", lineHeight: 1.5 }}>
            Envia-nos 1 exemplo do teu conteúdo (perfil, portfólio ou amostra) e a tua área. Se fizer sentido, o Ricardo
            (@ricardogarciapt) fala contigo em privado sobre os próximos passos.
          </p>
          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
            <Link
              href={APPLY_DM}
              style={{ display: "inline-block", background: GOLD, color: INK, fontWeight: 800, fontSize: 19, padding: "18px 36px", borderRadius: 999, textDecoration: "none" }}
            >
              Falar com o Ricardo
            </Link>
            <Link
              href="https://www.instagram.com/morethanmoney.pt/"
              style={{ display: "inline-block", border: `1px solid ${GOLD}`, color: PAPER, fontWeight: 700, fontSize: 19, padding: "17px 34px", borderRadius: 999, textDecoration: "none" }}
            >
              Ver @morethanmoney.pt
            </Link>
          </div>
          <p style={{ color: `${MUTED}aa`, fontSize: 13, marginTop: 28 }}>
            A MTM é educação e ferramentas, não aconselhamento financeiro. Sem promessas de lucro.
          </p>
        </section>
      </div>
    </main>
  )
}

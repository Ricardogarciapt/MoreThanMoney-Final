import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export const metadata: Metadata = {
  title: "MTM Auto — copy trading no teu telemóvel | MoreThanMoney",
  description:
    "Os sinais MTM abrem na tua conta, com o teu risco, geridos do início ao fim. Web app, Android e iOS.",
}

export const revalidate = 300

const APP_URL = "https://mtm-auto.vercel.app"

/**
 * Os links de descarga mudam a cada versão — ficam na base de dados para não obrigarem a um
 * deploy do site sempre que sai um build novo.
 */
async function linksDeDescarga() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("key, value")
      .in("key", ["mtmauto_apk_url", "mtmauto_testflight_url"])
    const mapa = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]))
    const texto = (v: unknown) => (typeof v === "string" ? v : (v as { url?: string })?.url ?? null)
    return {
      apk: texto(mapa.get("mtmauto_apk_url")) ?? "/downloads/MTMAuto.apk",
      testflight: texto(mapa.get("mtmauto_testflight_url")),
    }
  } catch {
    return { apk: "/downloads/MTMAuto.apk", testflight: null }
  }
}

/** Moldura de telemóvel. O conteúdo é HTML a sério — fica nítido em qualquer ecrã. */
function Telemovel({ children, legenda }: { children: React.ReactNode; legenda: string }) {
  return (
    <figure className="flex w-full max-w-[248px] shrink-0 flex-col items-center">
      <div className="w-full rounded-[2rem] border border-white/12 bg-[#08090C] p-2 shadow-[0_24px_60px_-24px_rgba(210,166,60,0.45)]">
        <div className="relative h-[430px] overflow-hidden rounded-[1.6rem] bg-[#08090C] px-3 pt-4">
          {children}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#08090C] to-transparent" />
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[12px] text-white/45">{legenda}</figcaption>
    </figure>
  )
}

const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[9px] uppercase tracking-[0.09em] text-white/40">{children}</p>
)

const Cartao = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-[#12141A] p-3">{children}</div>
)

function EcraSinais() {
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-bold text-white">Signals</p>
      <div className="rounded-[1.05rem] bg-gradient-to-br from-[#D2A63C]/60 to-[#D2A63C]/20 p-[1.5px]">
        <div className="rounded-[1rem] bg-[#12141A] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">XAUUSD</span>
            <span className="rounded-full bg-[#28C878]/15 px-2 py-0.5 text-[9px] font-bold text-[#28C878]">BUY</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div><Etiqueta>Entry</Etiqueta><p className="text-[12px] font-semibold text-white">4 615.0</p></div>
            <div><Etiqueta>Stop</Etiqueta><p className="text-[12px] font-semibold text-[#FF4D4D]">4 610.0</p></div>
            <div><Etiqueta>Target</Etiqueta><p className="text-[12px] font-semibold text-[#28C878]">4 635.0</p></div>
          </div>
          <button className="mt-3 w-full rounded-xl bg-[#D2A63C] py-2 text-[12px] font-bold text-black">
            Tap to Trade
          </button>
        </div>
      </div>
      <Cartao>
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-white">EURUSD</span>
          <span className="text-[11px] font-bold text-[#28C878]">+18 pips</span>
        </div>
        <p className="mt-1 text-[10px] text-white/40">Running · break-even moved to entry</p>
      </Cartao>
      <Cartao>
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-white">BTCUSD</span>
          <span className="text-[11px] font-bold text-[#28C878]">TP2 hit</span>
        </div>
        <p className="mt-1 text-[10px] text-white/40">50% closed · runner trailing</p>
      </Cartao>
    </div>
  )
}

function EcraEstrategias() {
  const linhas = [
    { i: "PO", n: "Premium · Gold", d: "Fully managed, entry to exit", w: "68%" },
    { i: "SS", n: "Sensei Scanner", d: "Gold and Bitcoin, confirmed only", w: "61%" },
    { i: "MS", n: "MTM Scanner · Forex", d: "Stops widened to 20 pips", w: "57%" },
  ]
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-bold text-white">Strategies</p>
      <p className="text-[10.5px] text-white/45">Choose who you copy. You can follow several.</p>
      {linhas.map((l) => (
        <Cartao key={l.i}>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#D2A63C]/15 text-[10px] font-bold text-[#D2A63C]">
              {l.i}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{l.n}</p>
              <p className="truncate text-[9.5px] text-white/40">{l.d}</p>
            </div>
            <span className="text-[11px] font-bold text-[#D2A63C]">{l.w}</span>
          </div>
        </Cartao>
      ))}
    </div>
  )
}

function EcraRisco() {
  return (
    <div className="space-y-2">
      <Etiqueta>Copy settings</Etiqueta>
      <p className="text-[14px] font-bold text-white">Premium · Gold</p>
      <Cartao>
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-white">Auto-accept signals</span>
          <span className="h-[18px] w-8 rounded-full bg-[#28C878]" />
        </div>
      </Cartao>
      <Etiqueta>Lot size</Etiqueta>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/50 p-1">
        <span className="rounded-lg py-1.5 text-center text-[10.5px] text-white/45">My settings</span>
        <span className="rounded-lg bg-[#D2A63C] py-1.5 text-center text-[10.5px] font-bold text-black">Risk %</span>
        <span className="rounded-lg py-1.5 text-center text-[10.5px] text-white/45">Fixed lot</span>
        <span className="rounded-lg py-1.5 text-center text-[10.5px] text-white/45">Multiplier</span>
      </div>
      <div className="pt-1">
        <div className="flex items-center justify-between">
          <Etiqueta>Risk per trade</Etiqueta>
          <span className="text-[12px] font-bold text-[#D2A63C]">1%</span>
        </div>
        <div className="mt-1.5 h-1 w-full rounded-full bg-white/10">
          <div className="h-1 w-1/5 rounded-full bg-[#D2A63C]" />
        </div>
      </div>
      <Cartao>
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-white">Automatic break-even</span>
          <span className="h-[18px] w-8 rounded-full bg-[#28C878]" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-black/50 p-1">
          <span className="rounded bg-[#D2A63C] py-1 text-center text-[9.5px] font-bold text-black">TP1</span>
          <span className="py-1 text-center text-[9.5px] text-white/45">TP2</span>
          <span className="py-1 text-center text-[9.5px] text-white/45">TP3</span>
        </div>
      </Cartao>
    </div>
  )
}

function EcraLigacao() {
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-bold text-white">Connection</p>
      <p className="text-[10.5px] text-white/45">Trades open in this account.</p>
      <div className="rounded-[1.05rem] bg-gradient-to-br from-[#D2A63C]/55 to-[#D2A63C]/18 p-[1.5px]">
        <div className="rounded-[1rem] bg-[#12141A] p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-semibold text-white">PU Prime · Live</p>
              <p className="text-[9.5px] text-white/40">PUPrime-Live · 90210</p>
            </div>
            <span className="rounded-full bg-[#28C878]/15 px-2 py-0.5 text-[9px] font-bold text-[#28C878]">
              Connected
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-black/40 px-2.5 py-1.5">
              <Etiqueta>Balance</Etiqueta>
              <p className="text-[12.5px] font-semibold text-white">USD 1 240.00</p>
            </div>
            <div className="rounded-xl bg-black/40 px-2.5 py-1.5">
              <Etiqueta>Equity</Etiqueta>
              <p className="text-[12.5px] font-semibold text-[#28C878]">USD 1 296.40</p>
            </div>
          </div>
        </div>
      </div>
      <Cartao>
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-white">Demo account</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/60">FREE</span>
        </div>
        <p className="mt-1 text-[9.5px] text-white/40">One live and one demo included.</p>
      </Cartao>
    </div>
  )
}

function EcraHistorico() {
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-bold text-white">History</p>
      <div className="rounded-[1.05rem] border border-[#D2A63C]/40 p-3">
        <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
          <div><Etiqueta>Result</Etiqueta><p className="text-[14px] font-bold text-[#28C878]">+312</p></div>
          <div><Etiqueta>Pips</Etiqueta><p className="text-[14px] font-bold text-[#28C878]">+184</p></div>
          <div><Etiqueta>Win rate</Etiqueta><p className="text-[14px] font-bold text-white">63%</p></div>
        </div>
      </div>
      {[
        { s: "XAUUSD", r: "+42 pips", c: "#28C878" },
        { s: "EURUSD", r: "+18 pips", c: "#28C878" },
        { s: "GBPJPY", r: "−12 pips", c: "#FF4D4D" },
      ].map((l) => (
        <Cartao key={l.s}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-white">{l.s}</span>
            <span className="text-[11.5px] font-bold" style={{ color: l.c }}>{l.r}</span>
          </div>
        </Cartao>
      ))}
    </div>
  )
}

const COMO = [
  { n: "1", t: "Liga a tua conta MT4 ou MT5", d: "Número da conta, palavra-passe e servidor — o servidor escolhe-se de uma lista, que é onde a maioria das ligações falha." },
  { n: "2", t: "Escolhe quem copias", d: "Segue uma estratégia ou várias. Cada uma com o seu risco, ou todas com o da tua conta." },
  { n: "3", t: "Decide como entras", d: "Automático, ou um toque teu em cada sinal. O motor trata do resto: break-even, parciais nos alvos e trailing." },
]

const PORQUE = [
  { t: "O risco é teu, não do sinal", d: "O lote sai do teu saldo e da distância ao stop. Um tecto de risco por trade que nenhuma estratégia ultrapassa — nem em lote fixo." },
  { t: "Diz-te sempre porque não abriu", d: "Conta sem saldo, cópia em pausa, limite de posições atingido. O motivo fica escrito no histórico em vez de um silêncio." },
  { t: "Break-even e trailing a sério", d: "O break-even mede-se pelo preço a que a tua ordem encheu, não pelo nível escrito no sinal. O trailing sobe e nunca desce." },
  { t: "Uma conta real e uma demo incluídas", d: "Testa em demo com as mesmas regras da real. As contas seguintes custam 7 €, uma vez." },
]

export default async function MtmAutoPage() {
  const links = await linksDeDescarga()

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="pointer-events-none absolute left-1/2 top-[-10rem] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full blur-[140px]"
          style={{ background: "rgba(210,166,60,0.22)" }}
        />
        <div className="container relative mx-auto px-4 py-16 text-center">
          <Image
            src="/images/mtm/logo-mtm-auto.png"
            alt="MTM Auto"
            width={190}
            height={190}
            className="mx-auto h-auto w-[170px]"
            priority
          />
          <h1 className="mt-6 text-3xl font-bold tracking-tight md:text-5xl">
            Os sinais MTM abrem na <span className="text-[#D2A63C]">tua</span> conta
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/65 md:text-lg">
            Copy trading e Tap to Trade num só sítio: escolhes quem copias, com que risco, e o motor
            acompanha cada posição — break-even, saídas parciais nos alvos e trailing — até fechar.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={APP_URL}
              target="_blank"
              className="rounded-xl bg-[#D2A63C] px-6 py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
            >
              Abrir a web app
            </Link>
            <a
              href={links.apk}
              className="rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white/85 transition-colors hover:border-white/40"
            >
              Descarregar APK (Android)
            </a>
            {links.testflight ? (
              <a
                href={links.testflight}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white/85 transition-colors hover:border-white/40"
              >
                iOS · TestFlight
              </a>
            ) : (
              /* Um botão que não leva a lado nenhum é pior do que a verdade dita à frente. */
              <span className="cursor-not-allowed rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white/30">
                iOS · TestFlight em breve
              </span>
            )}
          </div>
          <p className="mt-4 text-xs text-white/40">
            Descarregar é grátis · 25 €/mês · <span className="text-white/60">conta real PU Prime validada não paga</span>
          </p>
        </div>
      </section>

      {/* Ecrãs */}
      <section className="border-b border-white/10 py-14">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold md:text-3xl">A app, por dentro</h2>
          <div className="mt-10 flex flex-wrap justify-center gap-6">
            <Telemovel legenda="Sinais — aceitar com um toque"><EcraSinais /></Telemovel>
            <Telemovel legenda="Estratégias — segue quem quiseres"><EcraEstrategias /></Telemovel>
            <Telemovel legenda="Risco — por estratégia"><EcraRisco /></Telemovel>
            <Telemovel legenda="Ligação — a tua conta de corretora"><EcraLigacao /></Telemovel>
            <Telemovel legenda="Histórico — o que cada trade deu"><EcraHistorico /></Telemovel>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-b border-white/10 py-14">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold md:text-3xl">Três passos</h2>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
            {COMO.map((p) => (
              <div key={p.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#D2A63C]/15 text-sm font-bold text-[#D2A63C]">
                  {p.n}
                </span>
                <h3 className="mt-3 text-base font-semibold">{p.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Porquê */}
      <section className="border-b border-white/10 py-14">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold md:text-3xl">O que a torna diferente</h2>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
            {PORQUE.map((p) => (
              <div key={p.t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-base font-semibold text-[#D2A63C]">{p.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preço */}
      <section className="py-14">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl rounded-3xl border border-[#D2A63C]/30 bg-gradient-to-b from-[#D2A63C]/[0.08] to-transparent p-8 text-center">
            <p className="text-4xl font-bold">25 €<span className="text-base font-normal text-white/50">/mês</span></p>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Quatro formas de entrar, e três não te custam nada: conta real PU Prime validada (basta
              ter tido 100 $ alguma vez), cupão, ou já seres membro MoreThanMoney — entras com o mesmo
              email e não pagas.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`${APP_URL}/registo`}
                target="_blank"
                className="rounded-xl bg-[#D2A63C] px-6 py-3.5 text-sm font-bold text-black"
              >
                Criar conta
              </Link>
              <Link
                href="/automation"
                className="rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white/85"
              >
                Ver toda a automatização
              </Link>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-white/35">
              Trading envolve risco. Resultados passados não garantem resultados futuros, e nada aqui é
              aconselhamento financeiro.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

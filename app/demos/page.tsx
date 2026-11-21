import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Bot, CalendarCheck, Check, ClipboardList, FileText, GraduationCap,
  LayoutTemplate, LineChart, Megaphone, MessagesSquare, Move3d, Receipt, ShoppingBag, Smartphone, Sparkles, Users, Wand2,
} from "lucide-react"
import { linkAgendar } from "@/lib/agenda/link"
import { demosPublicadas } from "@/lib/site-solucoes/demos-diarias"
import { KITS, MODELOS, PROTOTIPOS } from "@/lib/site-solucoes/showroom"
import { LOCALE } from "@/lib/site-solucoes/i18n/base"
import { dicionario } from "@/lib/site-solucoes/i18n/dicionarios"
import { alternativas, idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { IdiomaSolucoes, SeletorIdioma } from "@/components/solucoes/idioma"
import { MontraModelos } from "@/components/solucoes/montra-modelos"
import { MiniTelemovel } from "@/components/solucoes/mini-telemovel"
import { CenaCGI } from "@/components/solucoes/cena-cgi"
import { EcraProjeto } from "@/components/solucoes/ecra-projeto"
import { Revelar } from "@/components/solucoes/revelar"

/**
 * Showroom de demos: tudo o que se pode mostrar a um negócio num só sítio.
 * Modelos por sector (app a funcionar com o nome do visitante), protótipos completos feitos para
 * negócios concretos, as 14 soluções que entregamos e as demos diárias.
 * Nada aqui é caso de cliente: modelos fictícios, protótipos marcados como proposta.
 * Ordem do Ricardo (17/11): nunca mostrar «em montagem»/«em breve» — entregamos todas.
 */

type Props = { searchParams: Promise<{ lang?: string | string[]; modelo?: string | string[]; ra?: string | string[] }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t } = tradutorServidor(idioma)
  return {
    title: t("Showroom de demos | MoreThanMoney"),
    description: t("Todas as demos num só sítio: automações, modelos por sector e kits prontos a entregar com a marca do teu negócio."),
    alternates: alternativas("/demos", idioma),
  }
}

const ICONE: Record<string, React.ComponentType<{ className?: string }>> = {
  "pagina-app": Smartphone,
  "agenda-lembretes": CalendarCheck,
  scanners: LineChart,
  "agente-ia": Bot,
  orcamento: FileText,
  crm: ClipboardList,
  "app-equipa": Users,
  faturas: Receipt,
  relatorios: BarChart3,
  redes: Megaphone,
  loja: ShoppingBag,
  cursos: GraduationCap,
  "mentor-ia": MessagesSquare,
  "white-label": LayoutTemplate,
}

/** Três telemóveis pequenos no topo: o mesmo kit com a cara de três sectores. */
function TelemoveisTopo({ t }: { t: (s: string) => string }) {
  const tres = ["restaurante", "barbearia", "clinica"].map((id) => MODELOS.find((m) => m.id === id)!)
  const pos = ["left-0 top-10", "left-1/2 top-0 z-10 -translate-x-1/2", "right-0 top-10"]
  const anim = ["telFlutuaE", "telFlutuaC", "telFlutuaD"]
  return (
    <div className="relative mx-auto h-[380px] w-full max-w-[460px] [perspective:1200px] md:h-[460px]">
      {/* CGI: partículas douradas que se juntam em esfera, telemóvel e rede de agentes */}
      <CenaCGI className="absolute -inset-16 md:-inset-24" />
      <div className="absolute inset-x-6 bottom-0 h-16 rounded-[50%] bg-[#D2A63C]/25 blur-3xl" aria-hidden="true" />
      {tres.map((m, i) => (
        <div key={m.id} className={`absolute ${pos[i]}`}>
          <div className="motion-safe:[animation:var(--a)_7s_ease-in-out_infinite] [transform-style:preserve-3d]" style={{ ["--a" as string]: anim[i] }}>
            <MiniTelemovel m={m} t={t} className="ring-1 ring-[#D2A63C]/20" />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes telFlutuaE { 0%,100% { transform: rotateY(18deg) rotateZ(-6deg) translateY(0) } 50% { transform: rotateY(10deg) rotateZ(-4deg) translateY(-14px) } }
        @keyframes telFlutuaC { 0%,100% { transform: rotateX(6deg) translateY(-6px) } 50% { transform: rotateX(-4deg) translateY(10px) } }
        @keyframes telFlutuaD { 0%,100% { transform: rotateY(-18deg) rotateZ(6deg) translateY(-8px) } 50% { transform: rotateY(-10deg) rotateZ(4deg) translateY(8px) } }
      `}</style>
    </div>
  )
}

export default async function ShowroomDemos({ searchParams }: Props) {
  const sp = await searchParams
  const idioma = await idiomaDoPedido(sp.lang)
  const pedido = Array.isArray(sp.modelo) ? sp.modelo[0] : sp.modelo
  const modeloInicial = MODELOS.some((m) => m.id === pedido) ? pedido : undefined
  const { t, tf, ligar } = tradutorServidor(idioma)
  const fmt = (d: string) => new Intl.DateTimeFormat(LOCALE[idioma], { day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00Z`))
  const demos = demosPublicadas()
  const publicadas = demos.map((d) => d.slug)
  const agendar = `${linkAgendar("negocios")}&origem=demos`
  const pedirSolucao = (kit: string) => `${agendar}&solucao=${kit}`

  return (
    <IdiomaSolucoes idioma={idioma} dic={dicionario(idioma)}>
      <main lang={idioma} className="min-h-[100dvh] overflow-x-hidden bg-[#08090C] pb-24 text-zinc-100 antialiased">
        {/* Brilho dourado de fundo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px] bg-[radial-gradient(ellipse_at_top,rgba(210,166,60,0.18),transparent_60%)]" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 pt-8">
          <div className="flex items-center justify-between gap-3">
            <Link href={ligar("/solucoes")} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("Soluções")}
            </Link>
            <SeletorIdioma idioma={idioma} rotulo={t("Idioma")} />
          </div>

          {/* Topo */}
          <header className="grid gap-10 pt-10 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t("Showroom")}
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                {t("Vê o teu negócio a funcionar")} <span className="bg-gradient-to-r from-[#D2A63C] to-[#E9C46A] bg-clip-text text-transparent">{t("antes de decidires")}</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-zinc-300">
                {t("Escolhe o teu sector, escreve o nome do teu negócio e mexe na app como se já fosse tua. Depois montamos a versão real com a tua marca.")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#modelos" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-7 font-semibold text-black shadow-lg shadow-[#D2A63C]/20 hover:bg-[#E9C46A]">
                  <Wand2 className="h-4 w-4" aria-hidden="true" /> {t("Ver com o meu nome")}
                </a>
                <a href={agendar} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-white/15 px-7 font-semibold hover:border-[#D2A63C]/60">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" /> {t("Marcar diagnóstico")}
                </a>
              </div>
              <Link href={ligar("/demos?ra=1#modelos")} className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#E9C46A] hover:text-white">
                <Move3d className="h-4 w-4" aria-hidden="true" /> {t("Novo: põe a app em realidade aumentada em cima do teu balcão")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <ul className="mt-8 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3">
                {["Demo com a tua marca", "Preço fechado", "14 soluções entregáveis"].map((x) => (
                  <li key={x} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(x)}
                  </li>
                ))}
              </ul>
            </div>
            <TelemoveisTopo t={t} />
          </header>

          <nav aria-label={t("Nesta página")} className="sticky top-0 z-20 -mx-4 mt-12 flex gap-6 overflow-x-auto border-y border-white/5 bg-[#08090C]/90 px-4 py-3 text-sm text-zinc-400 backdrop-blur">
            <a href="#modelos" className="shrink-0 hover:text-white">{t("Modelos por sector")}</a>
            <a href="#prototipos" className="shrink-0 hover:text-white">{t("Protótipos completos")}</a>
            <a href="#solucoes" className="shrink-0 hover:text-white">{t("Soluções")}</a>
            <a href="#demos-diarias" className="shrink-0 hover:text-white">{t("Demos do dia")}</a>
          </nav>

          {/* Modelos por sector */}
          <section id="modelos" className="scroll-mt-16 pt-16">
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">{t("Modelos por sector")}</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">{t("A mesma base, a cara de cada negócio. Escolhe um sector e mexe no telemóvel.")}</p>
            <div className="mt-8">
              <MontraModelos publicadas={publicadas} agendar={agendar} inicial={modeloInicial} abrirRA={sp.ra === "1"} />
            </div>
          </section>

          {/* Protótipos completos, feitos para um negócio concreto */}
          <section id="prototipos" className="scroll-mt-16 pt-24">
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">{t("Protótipos completos")}</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">{t("Feitos de raiz para um negócio concreto, com a marca dele, para lhe mostrar como ficaria. Abre e mexe à vontade.")}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {PROTOTIPOS.map((p, i) => (
                <Revelar key={p.id} atraso={i * 120}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent transition hover:border-[#D2A63C]/60">
                  <div className="relative bg-[radial-gradient(90%_80%_at_30%_0%,rgba(210,166,60,0.22),transparent_65%)] px-5 pt-5">
                    <EcraProjeto src={p.img} alt={tf("Protótipo de {marca}", { marca: p.marca })} url={p.url} />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">{t(p.sector)}</p>
                      <p className="mt-1 text-xl font-bold">{p.marca}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-zinc-400">{t("Proposta · ainda não é cliente")}</span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-300">{t(p.resumo)}</p>
                  <ul className="mt-4 grid gap-1.5 text-sm text-zinc-300 sm:grid-cols-2">
                    {p.partes.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(x)}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-[#E9C46A]">
                    {t("Abrir o protótipo")} <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                    {p.codigo ? <span className="font-normal text-zinc-500">· {t("back-office:")} {p.codigo}</span> : null}
                  </span>
                  </div>
                </a>
                </Revelar>
              ))}
            </div>
          </section>

          {/* As soluções que entregamos (todas) */}
          <section id="solucoes" className="scroll-mt-16 pt-24">
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">{t("14 soluções, todas entregáveis")}</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">
              {t("Cada solução tem um kit. Mandas-nos a ficha, montamos a demo com a tua marca e entregamos com preço fechado.")}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {KITS.map((k) => {
                const temDemo = k.demo && publicadas.includes(k.demo)
                const Icone = ICONE[k.kit] ?? Sparkles
                return (
                  <Revelar key={k.kit} atraso={(KITS.indexOf(k) % 3) * 90}>
                  <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition duration-300 hover:-translate-y-1 hover:border-[#D2A63C]/50 hover:bg-[#D2A63C]/[0.04] hover:shadow-[0_20px_50px_-20px_rgba(210,166,60,0.35)]">
                    <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#D2A63C]/0 blur-2xl transition duration-500 group-hover:bg-[#D2A63C]/25" aria-hidden="true" />
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D2A63C]/15 text-[#E9C46A] transition duration-500 group-hover:rotate-[8deg] group-hover:scale-110">
                      <Icone className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-lg font-semibold">{t(k.solucao)}</p>
                    <p className="mt-1 text-sm text-zinc-400">{t(k.promessa)}</p>
                    <p className="mt-4 text-xs text-zinc-500">
                      <span className="uppercase tracking-wider">{t("Mandas-nos")}:</span> {k.ficha.map((f) => t(f)).join(" · ")}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1 pt-4">
                      <a href={pedirSolucao(k.kit)} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#E9C46A]">
                        {t("Quero esta")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                      </a>
                      {temDemo && (
                        <Link href={ligar(`/solucoes/demos/${k.demo}`)} className="inline-flex min-h-[44px] items-center text-sm text-zinc-400 hover:text-white">
                          {t("Ver a demo")}
                        </Link>
                      )}
                    </div>
                  </div>
                  </Revelar>
                )
              })}
            </div>
          </section>

          {/* Demos diárias */}
          <section id="demos-diarias" className="scroll-mt-16 pt-24">
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">{t("Uma demo nova por dia")}</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">{t("Trabalho repetido que um agente faz por ti. Vê em 1 minuto como fica no ecrã.")}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {demos.map((d, i) => (
                <Link
                  key={d.slug}
                  href={ligar(`/solucoes/demos/${d.slug}`)}
                  className={`group flex flex-col rounded-2xl border p-5 transition hover:border-[#D2A63C]/60 ${
                    i === 0 ? "border-[#D2A63C]/40 bg-gradient-to-br from-[#D2A63C]/10 to-transparent md:col-span-2" : "border-white/10"
                  }`}
                >
                  <p className="text-xs text-zinc-500">
                    {i === 0 ? <span className="font-semibold text-[#D2A63C]">{t("Demo de hoje")} · </span> : null}
                    {fmt(d.data)}
                  </p>
                  <p className={`mt-2 font-semibold ${i === 0 ? "text-2xl" : ""}`}>{t(d.titulo)}</p>
                  <p className="mt-2 text-sm text-zinc-400">{t(d.para)}</p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-semibold text-[#E9C46A]">
                    {t("Ver a demo")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              ))}
              <div className="flex flex-col justify-center rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                <p className="font-semibold text-zinc-300">{t("Amanhã há outra")}</p>
                <p className="mt-1">{t("Entra uma demo nova todos os dias. Guarda esta página.")}</p>
              </div>
            </div>
          </section>

          {/* Fecho */}
          <section className="pt-24">
            <div className="relative overflow-hidden rounded-3xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#D2A63C]/20 via-[#D2A63C]/5 to-transparent p-8 md:p-14">
              <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#D2A63C]/20 blur-3xl" aria-hidden="true" />
              <CenaCGI className="absolute -right-24 top-1/2 hidden h-[420px] w-[520px] -translate-y-1/2 opacity-80 md:block" formas={["anel", "telemovel", "rede"]} intensidade={0.9} />
              <h2 className="relative max-w-2xl text-3xl font-bold tracking-tight md:text-5xl">{t("Queres ver isto com o teu nome?")}</h2>
              <p className="relative mt-4 max-w-2xl text-lg text-zinc-300">{t("Numa conversa de 30 minutos escolhemos a demo certa e montamo-la com a marca do teu negócio.")}</p>
              <a href={agendar} className="relative mt-8 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#D2A63C] px-7 font-semibold text-black shadow-lg shadow-[#D2A63C]/20 hover:bg-[#E9C46A]">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" /> {t("Marcar diagnóstico")}
              </a>
            </div>
            <p className="mt-6 text-xs text-zinc-500">
              {t("As demos e os modelos usam dados e negócios fictícios. Os protótipos são propostas a negócios que ainda não são clientes. Nada aqui garante resultados.")}
            </p>
          </section>
        </div>
      </main>
    </IdiomaSolucoes>
  )
}

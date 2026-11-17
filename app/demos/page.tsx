import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarCheck, Check } from "lucide-react"
import { linkAgendar } from "@/lib/agenda/link"
import { demosPublicadas } from "@/lib/site-solucoes/demos-diarias"
import { KITS, PROTOTIPOS, ROTULO_ESTADO, type EstadoKit } from "@/lib/site-solucoes/showroom"
import { LOCALE } from "@/lib/site-solucoes/i18n/base"
import { dicionario } from "@/lib/site-solucoes/i18n/dicionarios"
import { alternativas, idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { IdiomaSolucoes, SeletorIdioma } from "@/components/solucoes/idioma"
import { MontraModelos } from "@/components/solucoes/montra-modelos"

/**
 * Showroom de demos: tudo o que se pode mostrar a um negócio num só sítio.
 * Demos diárias (lib/site-solucoes/demos-diarias.ts), modelos por sector e kits plug and play
 * (resumo do Monorepo em lib/site-solucoes/showroom.ts). Tudo demonstração, nenhum caso de cliente.
 */

type Props = { searchParams: Promise<{ lang?: string | string[] }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t } = tradutorServidor(idioma)
  return {
    title: t("Showroom de demos | MoreThanMoney"),
    description: t("Todas as demos num só sítio: automações, modelos por sector e kits prontos a entregar com a marca do teu negócio."),
    alternates: alternativas("/demos", idioma),
  }
}

const ORDEM: EstadoKit[] = ["pronto", "a-montar", "por-fazer"]
const COR_ESTADO: Record<EstadoKit, string> = {
  pronto: "border-[#D2A63C]/50 bg-[#D2A63C]/15 text-[#E9C46A]",
  "a-montar": "border-white/20 bg-white/5 text-zinc-200",
  "por-fazer": "border-white/10 text-zinc-500",
}

export default async function ShowroomDemos({ searchParams }: Props) {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t, ligar } = tradutorServidor(idioma)
  const fmt = (d: string) => new Intl.DateTimeFormat(LOCALE[idioma], { day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00Z`))
  const demos = demosPublicadas()
  const publicadas = demos.map((d) => d.slug)
  const agendar = `${linkAgendar("negocios")}&origem=demos`

  return (
    <IdiomaSolucoes idioma={idioma} dic={dicionario(idioma)}>
      <main lang={idioma} className="min-h-[100dvh] bg-[#08090C] pb-24 text-zinc-100 antialiased">
        <div className="mx-auto max-w-6xl px-4 pt-8">
          <div className="flex items-center justify-between gap-3">
            <Link href={ligar("/solucoes")} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("Soluções")}
            </Link>
            <SeletorIdioma idioma={idioma} rotulo={t("Idioma")} />
          </div>

          {/* Topo */}
          <header className="pt-10 md:pt-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("Showroom")}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">{t("Vê antes de decidires")}</h1>
            <p className="mt-4 max-w-2xl text-lg text-zinc-400">
              {t("Todas as demos num só sítio: o que um agente faz por ti, como fica com a cara de cada sector e os kits que já entregamos.")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#modelos" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-6 font-semibold text-black hover:bg-[#E9C46A]">
                {t("Experimentar um modelo")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href={agendar} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/15 px-6 font-semibold hover:border-[#D2A63C]/60">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" /> {t("Quero ver com a minha marca")}
              </a>
            </div>
            <nav aria-label={t("Nesta página")} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
              <a href="#demos-diarias" className="hover:text-white">{t("Demos do dia")}</a>
              <a href="#prototipos" className="hover:text-white">{t("Protótipos completos")}</a>
              <a href="#modelos" className="hover:text-white">{t("Modelos por sector")}</a>
              <a href="#kits" className="hover:text-white">{t("Kits prontos")}</a>
            </nav>
          </header>

          {/* Demos diárias */}
          <section id="demos-diarias" className="scroll-mt-8 pt-20">
            <h2 className="text-2xl font-bold tracking-tight md:text-4xl">{t("Uma demo nova por dia")}</h2>
            <p className="mt-2 max-w-2xl text-zinc-400">{t("Trabalho repetido que um agente faz por ti. Vê em 1 minuto como fica no ecrã.")}</p>
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

          {/* Protótipos completos, feitos para um negócio concreto */}
          <section id="prototipos" className="scroll-mt-8 pt-20">
            <h2 className="text-2xl font-bold tracking-tight md:text-4xl">{t("Protótipos completos")}</h2>
            <p className="mt-2 max-w-2xl text-zinc-400">{t("Feitos de raiz para um negócio concreto, com a marca dele, para lhe mostrar como ficaria. Abre e mexe à vontade.")}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {PROTOTIPOS.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="group flex flex-col rounded-3xl border border-white/10 p-6 transition hover:border-[#D2A63C]/60">
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
                </a>
              ))}
            </div>
          </section>

          {/* Modelos por sector */}
          <section id="modelos" className="scroll-mt-8 pt-20">
            <h2 className="text-2xl font-bold tracking-tight md:text-4xl">{t("Modelos por sector")}</h2>
            <p className="mt-2 max-w-2xl text-zinc-400">{t("A mesma base, a cara de cada negócio. Escolhe um sector e mexe no telemóvel.")}</p>
            <div className="mt-8">
              <MontraModelos publicadas={publicadas} />
            </div>
          </section>

          {/* Kits */}
          <section id="kits" className="scroll-mt-8 pt-20">
            <h2 className="text-2xl font-bold tracking-tight md:text-4xl">{t("Kits plug and play")}</h2>
            <p className="mt-2 max-w-2xl text-zinc-400">
              {t("Cada solução tem um kit. Mandas-nos a ficha, montamos a demo com a tua marca e entregamos com preço fechado.")}
            </p>
            {ORDEM.map((estado) => (
              <div key={estado} className="mt-10">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">{t(ROTULO_ESTADO[estado])}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {KITS.filter((k) => k.estado === estado).map((k) => {
                    const temDemo = k.demo && publicadas.includes(k.demo)
                    return (
                      <div key={k.kit} className="flex flex-col rounded-2xl border border-white/10 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold">{t(k.solucao)}</p>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${COR_ESTADO[k.estado]}`}>{t(ROTULO_ESTADO[k.estado])}</span>
                        </div>
                        <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">{t("Mandas-nos")}</p>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                          {k.ficha.map((f) => (
                            <li key={f} className="flex gap-2">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(f)}
                            </li>
                          ))}
                        </ul>
                        {temDemo && (
                          <Link href={ligar(`/solucoes/demos/${k.demo}`)} className="mt-auto inline-flex min-h-[44px] items-center gap-2 pt-3 text-sm font-semibold text-[#E9C46A]">
                            {t("Ver a demo")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* Fecho */}
          <section className="pt-20">
            <div className="rounded-3xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#D2A63C]/15 to-transparent p-8 md:p-12">
              <h2 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">{t("Queres ver isto com o teu nome?")}</h2>
              <p className="mt-3 max-w-2xl text-zinc-300">{t("Numa conversa de 30 minutos escolhemos a demo certa e montamo-la com a marca do teu negócio.")}</p>
              <a href={agendar} className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#D2A63C] px-6 font-semibold text-black hover:bg-[#E9C46A]">
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

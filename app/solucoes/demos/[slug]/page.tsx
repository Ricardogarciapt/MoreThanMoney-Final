import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { linkAgendar } from "@/lib/agenda/link"
import { demoPorSlug, demosPublicadas } from "@/lib/site-solucoes/demos-diarias"
import { DemoRoteiro } from "@/components/solucoes/demo-roteiro"
import { dicionario } from "@/lib/site-solucoes/i18n/dicionarios"
import { alternativas, idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { IdiomaSolucoes, SeletorIdioma } from "@/components/solucoes/idioma"

// As demos entram no site no dia delas, sem deploy (a página é dinâmica: o idioma vem do pedido).
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const d = demoPorSlug(slug)
  if (!d) return { title: "Demo | MoreThanMoney Soluções" }
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t } = tradutorServidor(idioma)
  return {
    title: `${t(d.titulo)} | Demo MoreThanMoney`,
    description: t(d.promessa),
    alternates: alternativas(`/solucoes/demos/${d.slug}`, idioma),
    openGraph: { title: t(d.titulo), description: t(d.promessa), images: ["/images/og/solucoes.jpg"] },
  }
}

export default async function DemoPage({ params, searchParams }: Props) {
  const { slug } = await params
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t, ligar } = tradutorServidor(idioma)
  const d = demoPorSlug(slug)
  if (!d) notFound()
  const agendar = linkAgendar("negocios")
  const outras = demosPublicadas().filter((x) => x.slug !== d.slug).slice(0, 3)

  return (
    <IdiomaSolucoes idioma={idioma} dic={dicionario(idioma)}>
    <main lang={idioma} className="min-h-[100dvh] bg-[#08090C] px-4 pb-24 pt-8 text-zinc-100 antialiased">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <Link href={ligar("/solucoes/demos")} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("Todas as demos")}
          </Link>
          <SeletorIdioma idioma={idioma} rotulo={t("Idioma")} />
        </div>

        <div className="mt-6 grid gap-12 md:grid-cols-2 md:items-start">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">Demo · {t(d.para)}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight [text-wrap:balance] md:text-5xl">{t(d.titulo)}</h1>
            <blockquote className="mt-6 border-l-2 border-[#D2A63C]/50 pl-4 text-zinc-400 italic">«{t(d.dor)}»</blockquote>
            <p className="mt-6 text-lg leading-relaxed text-zinc-200">{t(d.promessa)}</p>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">{t("O que fica feito sozinho")}</h2>
            <ul className="mt-3 space-y-2">
              {d.fica.map((f) => (
                <li key={f} className="flex gap-2 text-zinc-200">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(f)}
                </li>
              ))}
            </ul>

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-zinc-400">{t("Com quê")}</h2>
            <p className="mt-2 text-zinc-300">{d.pecas.map(t).join(" · ")}</p>

            <a
              href={`${agendar}${agendar.includes("?") ? "&" : "?"}demo=${d.slug}`}
              className="mt-10 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#D2A63C] px-6 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
            >
              {t("Quero isto no meu negócio")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="mt-3 text-xs text-zinc-500">{t("Diagnóstico de 15 minutos, sem compromisso. Demonstração ilustrativa, não é um caso de cliente.")}</p>
          </section>

          <section aria-label={t("Demonstração")}>
            <DemoRoteiro roteiro={d.roteiro} />
          </section>
        </div>

        {outras.length > 0 && (
          <section className="mt-20">
            <h2 className="text-xl font-semibold">{t("Mais demos")}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {outras.map((o) => (
                <Link key={o.slug} href={ligar(`/solucoes/demos/${o.slug}`)} className="rounded-2xl border border-white/10 p-5 transition hover:border-[#D2A63C]/50">
                  <p className="text-xs text-[#D2A63C]">{t(o.para)}</p>
                  <p className="mt-2 font-semibold">{t(o.titulo)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
    </IdiomaSolucoes>
  )
}

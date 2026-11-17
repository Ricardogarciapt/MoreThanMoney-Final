import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { demosPublicadas } from "@/lib/site-solucoes/demos-diarias"
import { LOCALE } from "@/lib/site-solucoes/i18n/base"
import { alternativas, idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { SeletorIdioma } from "@/components/solucoes/idioma"

type Props = { searchParams: Promise<{ lang?: string | string[] }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t } = tradutorServidor(idioma)
  return {
    title: t("Demos | MoreThanMoney Soluções"),
    description: t("Uma demonstração nova por dia: automações que devolvem horas a pequenos negócios."),
    alternates: alternativas("/solucoes/demos", idioma),
  }
}

export default async function DemosPage({ searchParams }: Props) {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t, ligar } = tradutorServidor(idioma)
  const fmt = (d: string) => new Intl.DateTimeFormat(LOCALE[idioma], { day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00Z`))
  const demos = demosPublicadas()
  const [hoje, ...antes] = demos

  return (
    <main lang={idioma} className="min-h-[100dvh] bg-[#08090C] px-4 pb-24 pt-8 text-zinc-100 antialiased">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <Link href={ligar("/solucoes")} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("Soluções")}
          </Link>
          <SeletorIdioma idioma={idioma} rotulo={t("Idioma")} />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight md:text-5xl">{t("Uma demo nova por dia")}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{t("Trabalho repetido que um agente faz por ti. Vê em 1 minuto como fica no ecrã.")}</p>

        {hoje && (
          <Link href={ligar(`/solucoes/demos/${hoje.slug}`)} className="group mt-10 block rounded-3xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#D2A63C]/10 to-transparent p-6 md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("Demo de hoje")} · {fmt(hoje.data)}</p>
            <p className="mt-3 text-2xl font-bold md:text-4xl">{t(hoje.titulo)}</p>
            <p className="mt-3 max-w-2xl text-zinc-300">{t(hoje.promessa)}</p>
            <span className="mt-6 inline-flex items-center gap-2 font-semibold text-[#E9C46A]">
              {t("Ver a demo")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </Link>
        )}

        {antes.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {antes.map((d) => (
              <Link key={d.slug} href={ligar(`/solucoes/demos/${d.slug}`)} className="rounded-2xl border border-white/10 p-5 transition hover:border-[#D2A63C]/50">
                <p className="text-xs text-zinc-500">{fmt(d.data)} · {t(d.para)}</p>
                <p className="mt-2 font-semibold">{t(d.titulo)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

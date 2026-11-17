import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { linkAgendar } from "@/lib/agenda/link"
import { demoPorSlug, demosPublicadas } from "@/lib/site-solucoes/demos-diarias"
import { DemoRoteiro } from "@/components/solucoes/demo-roteiro"

// As demos entram no site no dia delas, sem deploy: a página revalida-se de hora a hora.
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const d = demoPorSlug(slug)
  if (!d) return { title: "Demo | MoreThanMoney Soluções" }
  return {
    title: `${d.titulo} | Demo MoreThanMoney`,
    description: d.promessa,
    alternates: { canonical: `https://www.morethanmoney.pt/solucoes/demos/${d.slug}` },
    openGraph: { title: d.titulo, description: d.promessa, images: ["/images/og/solucoes.jpg"] },
  }
}

export default async function DemoPage({ params }: Props) {
  const { slug } = await params
  const d = demoPorSlug(slug)
  if (!d) notFound()
  const agendar = linkAgendar("negocios")
  const outras = demosPublicadas().filter((x) => x.slug !== d.slug).slice(0, 3)

  return (
    <main className="min-h-[100dvh] bg-[#08090C] px-4 pb-24 pt-8 text-zinc-100 antialiased">
      <div className="mx-auto max-w-6xl">
        <Link href="/solucoes/demos" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Todas as demos
        </Link>

        <div className="mt-6 grid gap-12 md:grid-cols-2 md:items-start">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">Demo · {d.para}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight [text-wrap:balance] md:text-5xl">{d.titulo}</h1>
            <blockquote className="mt-6 border-l-2 border-[#D2A63C]/50 pl-4 text-zinc-400 italic">«{d.dor}»</blockquote>
            <p className="mt-6 text-lg leading-relaxed text-zinc-200">{d.promessa}</p>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">O que fica feito sozinho</h2>
            <ul className="mt-3 space-y-2">
              {d.fica.map((f) => (
                <li key={f} className="flex gap-2 text-zinc-200">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {f}
                </li>
              ))}
            </ul>

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-zinc-400">Com quê</h2>
            <p className="mt-2 text-zinc-300">{d.pecas.join(" · ")}</p>

            <a
              href={`${agendar}${agendar.includes("?") ? "&" : "?"}demo=${d.slug}`}
              className="mt-10 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#D2A63C] px-6 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
            >
              Quero isto no meu negócio <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="mt-3 text-xs text-zinc-500">Diagnóstico de 15 minutos, sem compromisso. Demonstração ilustrativa, não é um caso de cliente.</p>
          </section>

          <section aria-label="Demonstração">
            <DemoRoteiro roteiro={d.roteiro} />
          </section>
        </div>

        {outras.length > 0 && (
          <section className="mt-20">
            <h2 className="text-xl font-semibold">Mais demos</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {outras.map((o) => (
                <Link key={o.slug} href={`/solucoes/demos/${o.slug}`} className="rounded-2xl border border-white/10 p-5 transition hover:border-[#D2A63C]/50">
                  <p className="text-xs text-[#D2A63C]">{o.para}</p>
                  <p className="mt-2 font-semibold">{o.titulo}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

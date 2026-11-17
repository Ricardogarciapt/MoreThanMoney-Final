import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { demosPublicadas } from "@/lib/site-solucoes/demos-diarias"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Demos | MoreThanMoney Soluções",
  description: "Uma demonstração nova por dia: automações que devolvem horas a pequenos negócios.",
  alternates: { canonical: "https://www.morethanmoney.pt/solucoes/demos" },
}

const fmt = (d: string) => new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00Z`))

export default function DemosPage() {
  const demos = demosPublicadas()
  const [hoje, ...antes] = demos

  return (
    <main className="min-h-[100dvh] bg-[#08090C] px-4 pb-24 pt-8 text-zinc-100 antialiased">
      <div className="mx-auto max-w-6xl">
        <Link href="/solucoes" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Soluções
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight md:text-5xl">Uma demo nova por dia</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">Trabalho repetido que um agente faz por ti. Vê em 1 minuto como fica no ecrã.</p>

        {hoje && (
          <Link href={`/solucoes/demos/${hoje.slug}`} className="group mt-10 block rounded-3xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#D2A63C]/10 to-transparent p-6 md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">Demo de hoje · {fmt(hoje.data)}</p>
            <p className="mt-3 text-2xl font-bold md:text-4xl">{hoje.titulo}</p>
            <p className="mt-3 max-w-2xl text-zinc-300">{hoje.promessa}</p>
            <span className="mt-6 inline-flex items-center gap-2 font-semibold text-[#E9C46A]">
              Ver a demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </Link>
        )}

        {antes.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {antes.map((d) => (
              <Link key={d.slug} href={`/solucoes/demos/${d.slug}`} className="rounded-2xl border border-white/10 p-5 transition hover:border-[#D2A63C]/50">
                <p className="text-xs text-zinc-500">{fmt(d.data)} · {d.para}</p>
                <p className="mt-2 font-semibold">{d.titulo}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

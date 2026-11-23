import type { Metadata } from 'next'
import Link from 'next/link'
import MedicaoConsentida from '@/components/funis/medicao-consentida'
import { PATAMARES } from '@/lib/escada-caminhos'
import { PRECO_MENTORIA } from '@/lib/escada-precos'
import { TIPO_FECHO_ALTO_VALOR } from '@/lib/vendas/regras-fecho'

export const metadata: Metadata = {
  title: 'Mentoria Privada MTM · MoreThanMoney',
  description: 'O Método MTM com acompanhamento pessoal do Ricardo Garcia, em privado. Começa por uma chamada para ver se faz sentido para ti.',
  alternates: { canonical: 'https://www.morethanmoney.pt/mentoria' },
}

/**
 * /mentoria — o degrau de cima da escada (23/11/2026): Mentoria Privada MTM, 2.000 €.
 * High-ticket: não há checkout. Quem fecha é o Ricardo, numa chamada de fecho de alto valor
 * (`regras-fecho.ts`), marcada no /agendar. Nada de números de desempenho nem promessas.
 */
const PASSOS = [
  { t: 'Marcas a chamada', d: '30 minutos, por vídeo. Contas-me de onde partes, o que já tentaste e o que queres construir.' },
  { t: 'Vemos se faz sentido', d: 'Se a mentoria não for o passo certo para ti agora, digo-to na chamada e indico-te o que é.' },
  { t: 'Trabalhamos em privado', d: 'O Método MTM completo, aplicado ao teu caso, com acompanhamento pessoal. O formato e o calendário combinam-se contigo.' },
]

export default function Mentoria() {
  const patamar = PATAMARES.find((p) => p.chave === 'mentoria')!
  const agendar = `/agendar?t=${TIPO_FECHO_ALTO_VALOR}`
  return (
    <main className="min-h-screen bg-[#0b0b0c] text-white">
      <MedicaoConsentida funil="mentoria" conteudo="pagina" />
      <section className="mx-auto max-w-4xl px-4 py-14 md:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#E9C46A]">O degrau de cima</p>
        <h1 className="mt-4 text-4xl font-black md:text-6xl">Mentoria Privada MTM</h1>
        <p className="mt-4 max-w-2xl text-lg text-white/65">
          Para quem quer o Método MTM aplicado ao seu caso, com acompanhamento pessoal e em privado. Poucas pessoas de cada vez, porque o acompanhamento é feito por mim.
        </p>

        <div className="mt-10 rounded-3xl border border-[#D2A63C]/40 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-2xl font-black text-[#E9C46A]">O que inclui</h2>
            <p className="text-3xl font-black">{PRECO_MENTORIA}</p>
          </div>
          <ul className="mt-6 space-y-3">
            {patamar.inclui.map((i) => (
              <li key={i} className="flex gap-3 text-white/80"><span className="text-[#D2A63C]">✓</span>{i}</li>
            ))}
          </ul>
          <Link href={agendar} className="mt-8 inline-block rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-6 py-3 text-sm font-bold text-black">
            Marcar a chamada
          </Link>
        </div>

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li key={p.t} className="rounded-3xl border border-white/10 p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D2A63C] text-sm font-bold text-black">{i + 1}</span>
              <p className="mt-4 font-semibold">{p.t}</p>
              <p className="mt-2 text-sm text-white/55">{p.d}</p>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-center text-white/60">
          Ainda não é o momento? Vê <Link href="/caminho" className="text-[#E9C46A] underline">o caminho completo</Link>, do grátis ao Bootcamp.
        </p>
        <p className="mt-10 text-xs text-white/40">Conteúdo educativo. Não constitui aconselhamento financeiro. Investir e negociar envolve risco de perda do capital. Não há resultados garantidos.</p>
      </section>
    </main>
  )
}

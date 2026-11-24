/**
 * /cursos/treino-ib — a sala do «Treino de IB MTM» (IB da PU Prime com a MoreThanMoney).
 * Acesso: admin, ou quem tem o Premium (o Treino de IB está dentro do Premium na escada).
 * Quem não tem Premium é mandado para o upgrade. Material: slides de cada aula + guia e caderno.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { ehAdminUi, podeAcederAoTier } from '@/lib/perfil-ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Treino de IB MTM · Sala do curso', robots: { index: false, follow: false } }

const AULAS = [
  'Ser IB da PU Prime',
  'Fundamentos e corretora',
  'Negócio, cliente e onboarding',
  'Compliance e prospeção',
  'Checklist de 10 passos',
  'Módulo extra · Backoffice e pipeline',
]

const AVISO = 'Conteúdo educativo. Não é aconselhamento financeiro. Operar nos mercados tem risco de perda, que pode ser total. Os resultados não são garantidos.'

export default async function SalaTreinoIB() {
  const sessao = await sessaoDoMembro()
  if (!sessao) redirect('/login?redirect=' + encodeURIComponent('/cursos/treino-ib'))
  const perfil = sessao.perfil
  if (!(ehAdminUi(perfil) || podeAcederAoTier(perfil, 'premium'))) redirect('/upgrade?plan=premium_monthly')

  return (
    <main className="min-h-screen bg-[#0a0806] text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-[#D2A63C]">Sala do curso · MoreThanMoney</p>
          <h1 className="mt-2 text-3xl font-bold text-[#E9C46A] sm:text-4xl">Treino de IB MTM</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Ser IB da PU Prime com a MoreThanMoney, com ética e sem promessas.</p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <a href="/skool/guias/treino-ib-guia.pdf" target="_blank" rel="noreferrer" className="rounded-2xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#1a1408] to-[#0f0c07] p-6 hover:border-[#E9C46A]">
            <h2 className="text-lg font-semibold text-[#E9C46A]">Guia do curso</h2>
            <p className="mt-1 text-sm text-zinc-400">Para quem é o treino, como o usar e o plano de 4 semanas.</p>
            <span className="mt-4 inline-block text-sm font-semibold text-[#D2A63C]">Abrir PDF →</span>
          </a>
          <a href="/skool/guias/treino-ib-caderno.pdf" target="_blank" rel="noreferrer" className="rounded-2xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#1a1408] to-[#0f0c07] p-6 hover:border-[#E9C46A]">
            <h2 className="text-lg font-semibold text-[#E9C46A]">Caderno do aluno</h2>
            <p className="mt-1 text-sm text-zinc-400">Exercícios, perguntas e linhas para escrever, por parte do curso.</p>
            <span className="mt-4 inline-block text-sm font-semibold text-[#D2A63C]">Abrir PDF →</span>
          </a>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-[#E9C46A]">Slides por aula</h2>
          <ol className="grid gap-3">
            {AULAS.map((titulo, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Aula {i + 1}</p>
                  <p className="text-sm font-medium text-zinc-100">{titulo}</p>
                </div>
                <a href={`/skool/slides/treino-ib-aula-${i + 1}.pdf`} target="_blank" rel="noreferrer" className="rounded-full border border-[#D2A63C]/50 px-3 py-1 text-xs font-semibold text-[#E9C46A] hover:bg-[#D2A63C] hover:text-black">Slides</a>
              </li>
            ))}
          </ol>
        </section>

        <p className="border-t border-white/10 pt-6 text-xs text-zinc-500">{AVISO}</p>
        <p className="mt-4 text-xs text-zinc-600"><Link href="/marketplace" className="underline">Voltar ao marketplace</Link></p>
      </div>
    </main>
  )
}

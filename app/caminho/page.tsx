import type { Metadata } from 'next'
import Link from 'next/link'
import MedicaoConsentida from '@/components/funis/medicao-consentida'
import { CAMINHO_DO_PERFIL, PATAMARES, porta, type PerfilLead } from '@/lib/escada-caminhos'

export const metadata: Metadata = {
  title: 'O teu caminho · MoreThanMoney',
  description: 'Três portas, uma para cada ponto de partida: aprender do zero, ferramentas para o teu trading, ou operar a sério com conta em teu nome.',
  alternates: { canonical: 'https://www.morethanmoney.pt/caminho' },
}

/**
 * /caminho — as três portas da escada, lidas de `lib/escada-caminhos.ts`.
 * Cada pessoa escolhe UMA porta pelo ponto onde está e vê só o seu caminho, degrau a degrau.
 * Nada de preços escritos aqui: vêm das portas, que os leem de `escada-precos.ts`.
 */
const PORTAS_DE_ENTRADA: { perfil: PerfilLead; pergunta: string; para: string }[] = [
  { perfil: 'aprender', pergunta: 'Começo do zero', para: 'Nunca investi, ou já perdi dinheiro e quero método antes de arriscar.' },
  { perfil: 'ferramentas', pergunta: 'Já opero', para: 'Quero ferramentas e regras para o meu próprio trading.' },
  { perfil: 'capital', pergunta: 'Quero operar a sério', para: 'Tenho o depósito mínimo e quero acompanhamento, com a conta em meu nome.' },
]

export default function Caminho() {
  return (
    <main className="min-h-screen bg-[#0b0b0c] text-white">
      <MedicaoConsentida funil="caminho" conteudo="portas" />
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#E9C46A]">Três portas, um caminho</p>
        <h1 className="mt-4 text-4xl font-black md:text-6xl">Onde estás hoje?</h1>
        <p className="mt-4 max-w-2xl text-lg text-white/65">
          Escolhe a porta pelo teu ponto de partida. Vês o caminho todo, degrau a degrau, e só dás o passo seguinte quando o anterior fizer sentido.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PORTAS_DE_ENTRADA.map(({ perfil, pergunta, para }) => {
            const degraus = CAMINHO_DO_PERFIL[perfil].map(porta)
            const primeiro = degraus[0]
            return (
              <article key={perfil} id={perfil} className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-2xl font-black text-[#E9C46A]">{pergunta}</h2>
                <p className="mt-2 text-sm text-white/60">{para}</p>
                <ol className="mt-6 flex-1 space-y-4">
                  {degraus.map((d, i) => (
                    <li key={d.chave} className="flex gap-3">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-[#D2A63C] text-black' : 'border border-white/20 text-white/60'}`}>{i + 1}</span>
                      <div>
                        <p className="font-semibold">{d.titulo}</p>
                        <p className="text-sm text-white/55">{d.texto}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <Link href={primeiro.href} className="mt-6 rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-5 py-3 text-center text-sm font-bold text-black">
                  Começar: {primeiro.titulo}
                </Link>
              </article>
            )
          })}
        </div>

        <h2 className="mt-20 text-3xl font-black md:text-4xl">O que cada patamar abre</h2>
        <p className="mt-3 max-w-2xl text-white/60">Acima do grátis, cada curso pertence a um patamar. Sobes quando o anterior já te deu o que precisavas.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {PATAMARES.map((p) => (
            <Link key={p.chave} href={p.href} className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-5 hover:border-[#D2A63C]/60">
              <p className="text-sm font-bold uppercase tracking-widest text-[#E9C46A]">{p.nome}</p>
              <p className="mt-2 text-2xl font-black">{p.preco}</p>
              <ul className="mt-4 space-y-2 text-sm text-white/65">
                {p.inclui.map((i) => <li key={i}>· {i}</li>)}
              </ul>
            </Link>
          ))}
        </div>

        <div className="mt-14 rounded-3xl border border-white/10 p-6 text-center">
          <p className="text-white/70">Não sabes qual é a tua porta?</p>
          <Link href="/agendar" className="mt-4 inline-block rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold">Falar 15 min com a equipa</Link>
        </div>
        <p className="mt-10 text-xs text-white/40">Conteúdo educativo. Não constitui aconselhamento financeiro. Investir e negociar envolve risco de perda. Não há resultados garantidos. O MTM Funded usa contas simuladas e não é uma prop firm.</p>
      </section>
    </main>
  )
}

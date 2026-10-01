import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Camera, Megaphone, Sparkles, UserRound } from 'lucide-react'

/**
 * CONTENT & BUSINESS — o pilar de conteúdo e negócio digital.
 *
 * Quatro áreas: Social Media, UGC, Faceless Marketing e mentalidade de empreendedor. É a porta de
 * entrada de quem quer construir um negócio em torno de conteúdo, e não de trading.
 *
 * NÃO HÁ NÚMEROS NESTA PÁGINA, e é de propósito. A tentação de uma landing deste tipo é escrever
 * «+340% em 90 dias» ou «1.200 alunos»; a prova desta casa mede-se em pips e tem origem declarada,
 * e nenhum número de conteúdo foi medido. Uma promessa que não se consegue mostrar é uma dívida
 * que alguém vai cobrar.
 */
export const metadata: Metadata = {
  title: 'Content & Business · MoreThanMoney',
  description:
    'Social Media, UGC, Faceless Marketing e mentalidade de empreendedor. Constrói um negócio digital em torno de conteúdo.',
}

const AREAS = [
  {
    icone: Megaphone,
    titulo: 'Social Media',
    texto:
      'Conteúdo com intenção, não publicações por publicar. O que dizer, a quem, e porque é que isso leva alguém a comprar.',
  },
  {
    icone: Camera,
    titulo: 'UGC',
    texto:
      'Conteúdo criado para marcas: o que é preciso para ser contratado, como se entrega, e como se cobra sem desvalorizar o trabalho.',
  },
  {
    icone: UserRound,
    titulo: 'Faceless Marketing',
    texto:
      'Construir e vender sem mostrar a cara. Marca, conteúdo e vendas para quem não quer — ou não pode — expor-se.',
  },
  {
    icone: Sparkles,
    titulo: 'Mentalidade de empreendedor',
    texto:
      'A parte que ninguém filma: decidir com pouca informação, continuar quando ninguém vê, e tratar o negócio como negócio.',
  },
]

export default function ContentBusinessPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0B] text-zinc-100">
      {/* O cabeçalho não ocupa o ecrã todo de propósito: quem chega quer ver o que há, e um herói
          de 100vh empurra o conteúdo para fora do primeiro olhar. */}
      <section className="border-b border-white/5 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#D2A63C]">
            Pilar MoreThanMoney
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] sm:text-5xl">
            Content <span className="text-[#D2A63C]">&</span> Business
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-[15px] leading-relaxed text-zinc-400">
            Construir um negócio digital em torno de conteúdo — com ou sem mostrar a cara. Quatro
            áreas que se atravessam: o que publicas, para quem, como o vendes, e o que te mantém a
            fazê-lo quando ainda ninguém está a ver.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-lg bg-[#D2A63C] px-5 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Ver os cursos <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/live-sessions"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-2.5 text-sm text-zinc-200 transition-colors hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
            >
              Academias e Lives
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {AREAS.map((a) => (
            <article
              key={a.titulo}
              className="rounded-xl border border-white/8 bg-white/[0.02] p-6 transition-colors hover:border-[#D2A63C]/30"
            >
              <a.icone className="h-5 w-5 text-[#D2A63C]" />
              <h2 className="mt-4 text-lg font-semibold text-white">{a.titulo}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{a.texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* A academia que existe hoje neste pilar. Quando houver outras, isto passa a lista — e é por
          isso que a secção se chama «academias» e não «a academia». */}
      <section className="border-t border-white/5 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Academias deste pilar
          </h2>
          <div className="mt-6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
            <div className="grid gap-0 sm:grid-cols-[1fr_1.3fr]">
              <div className="relative aspect-[16/10] sm:aspect-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/marketplace/sfa/capa.webp"
                  alt="She Is Faceless Academy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-white">She Is Faceless Academy</h3>
                <p className="mt-1 text-[13px] text-[#D2A63C]">
                  Faceless Marketing · Maria Mafalda Costa
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                  Curso completo de Faceless Marketing: mentalidade de negócio, oferta, infoprodutos,
                  cliente ideal, marca, conteúdo, redes sociais e vendas por mensagem — para construir
                  um negócio digital sem depender da exposição pessoal.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/marketplace/she-is-faceless-academy"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
                  >
                    Ver o curso <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/live-sessions"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-[#D2A63C]/60"
                  >
                    Canal da academia
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

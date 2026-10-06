import Link from 'next/link'
import { ArrowRight, ArrowUpRight, PlayCircle } from 'lucide-react'
import type { AreaMontada, Pilar } from '@/lib/pilares'
import { PERCURSO_ORGANIZADO } from '@/lib/pilares'
import QueroQueMeLiguem from '@/components/captacao/quero-que-me-liguem'

/**
 * A PÁGINA DE UM PILAR — o mesmo desenho para o MTM Markets e para o Content & Business.
 *
 * Um componente e não duas páginas copiadas: foi assim que o gating do /live acabou com quatro
 * cópias da mesma regra a discordarem entre si. Se os dois pilares têm de contar a mesma história,
 * têm de a contar com o mesmo código.
 *
 * ═══ DECISÕES DE DESENHO QUE NÃO SÃO GOSTO ═════════════════════════════════════════════════
 *
 * · **Ouro sobre carvão.** `#D2A63C` e `#E9C46A` sobre quase-preto. É a marca da casa e ganha a
 *   qualquer paleta que uma ferramenta de design proponha.
 * · **Nenhum número.** A tentação de uma página destas é «1.200 alunos» ou «+340%». A prova desta
 *   casa mede-se em pips e tem origem declarada; o que não foi medido não se escreve.
 * · **O cabeçalho não ocupa o ecrã todo.** Quem chega quer ver o que há, e um herói de 100vh
 *   empurra o conteúdo todo para fora do primeiro olhar.
 * · **Todas as áreas levam o mesmo cartão.** As que têm educador mostram-no; as outras dizem como
 *   se acompanham. Nenhuma diz o que lhe falta — ver `lib/pilares.ts`.
 */
export default function PilarPagina({
  pilar,
  areas,
  outroPilar,
}: {
  pilar: Pilar
  areas: AreaMontada[]
  outroPilar: Pilar
}) {
  return (
    <main className="min-h-screen bg-[#0A0A0B] text-zinc-100">
      <section className="border-b border-white/5 px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#D2A63C]">
            Pilar MoreThanMoney
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] sm:text-5xl">
            {pilar.nome}
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-[15px] leading-relaxed text-zinc-400">
            {pilar.definicao}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/live-sessions"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#D2A63C] px-5 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Academias e Lives <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 px-5 py-2.5 text-sm text-zinc-200 transition-colors hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
            >
              Ver os cursos
            </Link>
          </div>

          {/* O que o pilar tem além das aulas. São factos — produtos que existem —, não promessas. */}
          <ul className="mt-8 flex flex-wrap gap-2">
            {pilar.mais.map((m) => (
              <li
                key={m}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-zinc-400"
              >
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Áreas deste pilar
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {areas.map(({ area, educadores, comoSeAcompanha }) => (
              <article
                key={area.titulo}
                className="flex flex-col rounded-xl border border-white/8 bg-white/[0.02] p-6 transition-colors hover:border-[#D2A63C]/30"
              >
                <h3 className="text-lg font-semibold text-white">{area.titulo}</h3>
                {/* A primeira linha diz COMO se acompanha esta área. Nunca o que lhe falta. */}
                <p className="mt-1 text-[13px] text-[#D2A63C]">{comoSeAcompanha}</p>
                <p className="mt-3 flex-1 text-[14px] leading-relaxed text-zinc-400">{area.descricao}</p>

                {educadores.length > 0 && (
                  <ul className="mt-5 space-y-2 border-t border-white/5 pt-5">
                    {educadores.map(({ educador, salas, href }) => (
                      <li key={educador.id} className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={educador.avatar_url || '/placeholder-user.jpg'}
                          alt=""
                          aria-hidden="true"
                          className="h-10 w-10 shrink-0 rounded-full border border-[#D2A63C]/30 object-cover"
                          width={40}
                          height={40}
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-zinc-100">
                            {educador.display_name}
                          </p>
                          {educador.specialty && (
                            <p className="truncate text-[12px] text-zinc-500">{educador.specialty}</p>
                          )}
                        </div>
                        {/*
                          A ligação vai DIRECTA para a sala, e para a sala mais aberta que o
                          educador tem — a escolha está em `salaDeEntrada`. Mandar para o átrio
                          obrigava a procurar outra vez; mandar para uma sala VIP dava um cadeado
                          ao primeiro clique.
                        */}
                        {href && (
                          <Link
                            href={href}
                            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-[#D2A63C]/40 px-3 py-2 text-[13px] text-[#E9C46A] transition-colors hover:bg-[#D2A63C]/10"
                          >
                            <PlayCircle className="h-4 w-4" aria-hidden="true" />
                            <span>Ir para a sala</span>
                            {salas.length > 1 && (
                              <span className="sr-only">
                                {` de ${educador.display_name} — ${salas.length} salas nesta área`}
                              </span>
                            )}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {educadores.length === 0 && (
                  <p className="mt-5 border-t border-white/5 pt-5 text-[13px] text-zinc-500">
                    {PERCURSO_ORGANIZADO}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <QueroQueMeLiguem
        origem={`pilar:${pilar.id}`}
        interesseInicial="formacao"
        subtitulo={`Queres saber por onde começar no ${pilar.nome}? Deixa o teu número e uma pessoa da equipa fala contigo.`}
      />

      <section className="border-t border-white/5 px-6 py-14">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              O outro pilar
            </h2>
            <p className="mt-2 text-lg font-semibold text-white">{outroPilar.nome}</p>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-zinc-400">
              {outroPilar.definicao}
            </p>
          </div>
          <Link
            href={outroPilar.href}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 px-5 py-2.5 text-sm text-zinc-200 transition-colors hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
          >
            Ver {outroPilar.nome} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  )
}

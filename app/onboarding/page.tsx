import type { Metadata } from 'next'
import Link from 'next/link'
import CursoIntroducao from '@/components/intro/curso-introducao'

export const metadata: Metadata = {
  title: 'Onboarding · MoreThanMoney',
  description: 'Escolhe por onde queres começar: o ecossistema MoreThanMoney ou só o MTM Auto.',
}

/**
 * A bifurcação do onboarding — a primeira pergunta, e a única que muda tudo o resto.
 *
 * Vive AQUI, no site, e não dentro da app MTM Auto. Quem já abriu a app não tem de escolher nada:
 * escolheu ao instalá-la. Quem chega por um link, por uma conversa ou por um anúncio é que pode
 * querer duas coisas muito diferentes — a comunidade inteira, ou uma app que copia sinais — e
 * mandar essas duas pessoas pelo mesmo caminho é perder metade delas em cada um.
 */
const CAMINHOS = [
  {
    href: '/onboarding/mtm',
    titulo: 'O ecossistema MoreThanMoney',
    nota:
      'Sinais Premium, sessões ao vivo, formação, certificações e a comunidade. O MTM Auto vem incluído na adesão.',
    cta: 'Ver o guia completo',
    destaque: true,
  },
  {
    href: '/onboarding/mtm-auto',
    titulo: 'Só o MTM Auto',
    nota:
      'Copiar os sinais na tua conta, com o teu risco, sem mais nada para aprender. Quatro passos e está a trabalhar.',
    cta: 'Começar pela app',
    destaque: false,
  },
]

export default function Onboarding() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-16">
      <p className="text-[12px] uppercase tracking-[0.18em] text-[#8a8a95]">Onboarding</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Por onde queres começar?
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#b9b9c3]">
        Dois caminhos diferentes, e nenhum é melhor do que o outro — depende do que vieste buscar.
        Podes mudar de ideias a qualquer momento.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {CAMINHOS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col rounded-2xl border p-6 transition-colors"
            style={{
              borderColor: c.destaque ? 'rgba(210,166,60,0.45)' : '#23262F',
              background: c.destaque ? 'rgba(210,166,60,0.06)' : '#12141A',
            }}
          >
            <h2 className="text-lg font-semibold text-white">{c.titulo}</h2>
            <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[#b9b9c3]">{c.nota}</p>
            <span className="mt-5 text-[14px] font-semibold text-[#D2A63C]">{c.cta} →</span>
          </Link>
        ))}
      </div>

      {/*
        Antes de escolher, ver.

        A bifurcação obriga a decidir com informação que muitas pessoas ainda não têm — o que é o
        ecossistema, e o que a app faz sozinha. O curso de introdução responde a isso num leitor
        aqui mesmo, sem sair da página e sem perder a escolha de vista.
      */}
      <CursoIntroducao feitio="bloco" className="mt-10" />

      <p className="mt-10 text-[13px] leading-relaxed text-[#7a7a84]">
        Operar com produtos alavancados tem risco elevado de perda. Conteúdo educativo, não é
        aconselhamento financeiro.
      </p>
    </main>
  )
}

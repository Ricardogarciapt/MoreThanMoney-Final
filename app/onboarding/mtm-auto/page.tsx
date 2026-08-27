import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Começar no MTM Auto · MoreThanMoney',
  description: 'Quatro passos para ter os sinais da MTM a copiar na tua conta.',
}

/**
 * O caminho de quem só quer a app.
 *
 * Os mesmos quatro passos que a app mostra por dentro, ditos aqui antes de instalar — para que a
 * decisão de instalar seja tomada por alguém que já sabe o que vai acontecer a seguir.
 */
const PASSOS = [
  {
    n: 1,
    titulo: 'Desbloqueia o acesso',
    texto:
      'Quatro portas: abrir conta na corretora parceira pelo nosso link (e fica sem custo), a adesão MTM (que já o inclui), um cupão, ou a assinatura de 25 €/mês.',
  },
  {
    n: 2,
    titulo: 'Liga a tua conta MT5 ou MT4',
    texto:
      'O dinheiro fica na tua corretora. Nunca o guardamos nem o levantamos — a app só envia ordens.',
  },
  {
    n: 3,
    titulo: 'Escolhe a estratégia que queres seguir',
    texto: 'Cada uma mostra o histórico real dela dentro da app, medido nos sinais deste produto.',
  },
  {
    n: 4,
    titulo: 'Define o teu risco e liga a cópia',
    texto:
      'Risco por operação, máximo de posições, perda diária máxima, e um botão de emergência que fecha tudo. Desligas a cópia quando quiseres e continuas a receber os sinais para abrir à mão.',
  },
]

export default function OnboardingMtmAuto() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-16">
      <Link href="/onboarding" className="text-[13px] text-[#8a8a95]">← Onboarding</Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Começar no MTM Auto
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#b9b9c3]">
        Os sinais da MTM a copiar na tua conta, com o teu risco. Quatro passos, uma vez só.
      </p>

      <ol className="mt-10 space-y-5">
        {PASSOS.map((p) => (
          <li key={p.n} className="flex gap-4">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold"
              style={{ background: 'rgba(210,166,60,0.12)', color: '#D2A63C' }}
            >
              {p.n}
            </span>
            <div>
              <h2 className="text-[16px] font-semibold text-white">{p.titulo}</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-[#b9b9c3]">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
        <a
          href="/mtmautoapp"
          className="rounded-xl px-6 py-3 text-[15px] font-bold"
          style={{ background: '#D2A63C', color: '#111' }}
        >
          Abrir o MTM Auto →
        </a>
        <Link
          href="/mtmauto"
          className="rounded-xl border px-6 py-3 text-[15px] font-semibold text-white"
          style={{ borderColor: '#23262F' }}
        >
          Ver como funciona
        </Link>
      </div>

      <p className="mt-10 text-[13px] leading-relaxed text-[#7a7a84]">
        Operar com produtos alavancados tem risco elevado de perda. Resultados passados não
        garantem resultados futuros. Conteúdo educativo, não é aconselhamento financeiro.
      </p>
    </main>
  )
}

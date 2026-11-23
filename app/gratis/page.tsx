import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import MedicaoConsentida from '@/components/funis/medicao-consentida'
import { FREEBIES, PROXIMO_PASSO } from '@/lib/freebies'

export const metadata: Metadata = {
  title: 'Guias grátis · MoreThanMoney',
  description: 'Três guias grátis para começar com método: O Primeiro Passo, O Plano de 3 Passos e o Guia dos Scanners MTM com 30 dias do GoldKiller.',
  alternates: { canonical: 'https://www.morethanmoney.pt/gratis' },
}

export default function Gratis() {
  return (
    <main className="min-h-screen bg-[#0b0b0c] text-white">
      <MedicaoConsentida funil="freebie" conteudo="hub" />
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#E9C46A]">Grátis, sem cartão</p>
        <h1 className="mt-4 text-4xl font-black md:text-6xl">Começa pelo guia certo.</h1>
        <p className="mt-4 max-w-2xl text-lg text-white/65">Três guias da casa, em português, inglês e espanhol. Escolhe pelo ponto onde estás hoje. Sem promessas de lucro: método, risco à vista e um plano para seguir.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {FREEBIES.map((f, i) => (
            <Link key={f.slug} href={f.pagina} className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#D2A63C]/60">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">{['Nunca investi', 'Quero um plano', 'Quero ferramentas'][i]}</p>
              <Image src={f.capa} alt={f.titulo} width={240} height={300} className="mx-auto mt-4 h-56 w-auto transition group-hover:scale-[1.03]" />
              <h2 className="mt-5 text-xl font-bold">{f.titulo}</h2>
              <p className="mt-2 flex-1 text-sm text-white/60">{f.gancho}</p>
              <span className="mt-5 inline-block rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-5 py-2.5 text-center text-sm font-bold text-black">{f.slug === 'guia-dos-scanners' ? 'Quero o GoldKiller grátis' : 'Quero o guia grátis'}</span>
            </Link>
          ))}
        </div>
        <div className="mt-14 rounded-3xl border border-white/10 p-6 text-center">
          <p className="text-white/70">Queres ver a app por dentro?</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href={PROXIMO_PASSO.premiumGratis.href} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">{PROXIMO_PASSO.premiumGratis.texto}</Link>
            <Link href={PROXIMO_PASSO.agendar.href} className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold">{PROXIMO_PASSO.agendar.texto}</Link>
          </div>
        </div>
        <p className="mt-10 text-xs text-white/40">Conteúdo educativo. Não constitui aconselhamento financeiro. Investir e negociar envolve risco de perda. Não há resultados garantidos.</p>
      </section>
    </main>
  )
}

import type { Metadata } from 'next'
import Image from 'next/image'
import FormGoldKiller from '@/components/gratis/form-goldkiller'
import MedicaoConsentida from '@/components/funis/medicao-consentida'
import { DIAS_GOLDKILLER_GRATIS } from '@/lib/freebies'
import { ESTRATEGIAS_MTM } from '@/lib/estrategias-mtm'

export const metadata: Metadata = {
  title: 'Scanner GoldKiller 30 dias grátis · MoreThanMoney',
  description: 'O Scanner GoldKiller no teu TradingView durante 30 dias, com o Guia dos Scanners MTM e os vídeos do bootcamp. Grátis com o cupão FREEBIE.',
  alternates: { canonical: 'https://www.morethanmoney.pt/gratis/goldkiller' },
  openGraph: { images: ['/scanners/gold-killer/poster.jpg'] },
}

const gk = ESTRATEGIAS_MTM.find((e) => e.slug === 'goldkiller')!

const RECEBES = [
  { t: `${DIAS_GOLDKILLER_GRATIS} dias do Scanner GoldKiller`, d: 'Ativado pela equipa no teu TradingView em até 24 horas. Funciona com a conta grátis.' },
  { t: 'O «Guia dos Scanners MTM»', d: 'PDF em português, inglês e espanhol: ativar, ler cada sinal, do sinal à operação com risco controlado, e um plano de 30 dias em demo.' },
  { t: 'O bootcamp em vídeo', d: 'A playlist do GoldKiller e o mapa dos bootcamps de todas as ferramentas da casa.' },
]

export default function GoldKillerGratis() {
  return (
    <main className="min-h-screen bg-[#0b0b0c] text-white">
      <MedicaoConsentida funil="freebie" conteudo="goldkiller" />
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#E9C46A]">Oferta grátis · cupão FREEBIE</p>
          <h1 className="mt-4 text-4xl font-black leading-tight md:text-6xl">O Scanner GoldKiller,<br /><span className="text-[#D2A63C]">{DIAS_GOLDKILLER_GRATIS} dias grátis.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">O ouro com alvos claros: tendência, viragem BUY/SELL e níveis por percentil, no teu gráfico. Com o guia passo a passo e os vídeos do bootcamp, para saberes o que estás a ver antes de arriscar um euro.</p>
          <a href="#pedido" className="mt-6 inline-block rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-6 py-3 font-bold text-black md:hidden">Pedir o acesso grátis ↓</a>
          <div className="relative mt-8 aspect-video overflow-hidden rounded-2xl border border-white/10">
            <Image src="/scanners/gold-killer/render-1.jpg" alt="O Scanner GoldKiller num gráfico de ouro" fill className="object-cover" priority sizes="(min-width: 768px) 55vw, 100vw" />
          </div>
          <ul className="mt-8 space-y-4">
            {RECEBES.map((r) => (
              <li key={r.t} className="flex gap-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#D2A63C]" />
                <div><p className="font-bold">{r.t}</p><p className="text-sm text-white/60">{r.d}</p></div>
              </li>
            ))}
          </ul>
          {gk.playlist.pt && <a href={gk.playlist.pt} target="_blank" rel="noopener" className="mt-6 inline-block text-sm text-[#E9C46A] underline-offset-4 hover:underline">Ver já o bootcamp do GoldKiller no YouTube →</a>}
        </div>
        <div id="pedido" className="scroll-mt-20 md:sticky md:top-8 md:self-start">
          <div className="rounded-3xl border border-[#D2A63C]/30 bg-gradient-to-b from-[#16130b] to-[#0b0b0c] p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-4">
              <Image src="/marketplace/ebooks/guia-dos-scanners-3d.png" alt="Guia dos Scanners MTM" width={88} height={110} className="h-auto w-20" />
              <div><p className="font-bold">Pede o teu acesso</p><p className="text-sm text-white/55">Guia logo a seguir. Scanner em até 24 h.</p></div>
            </div>
            <FormGoldKiller />
          </div>
          <p className="mt-4 text-center text-xs text-white/45">Sem cartão. Nada se renova sozinho. Ao fim dos {DIAS_GOLDKILLER_GRATIS} dias decides com o teu diário.</p>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-2xl font-bold">Como funciona</h2>
        <ol className="mt-4 space-y-3 text-white/70">
          <li><b className="text-white">1.</b> Deixas o contacto e o teu utilizador do TradingView, com o cupão FREEBIE.</li>
          <li><b className="text-white">2.</b> Abres o guia e começas pelo capítulo 1, em conta demo.</li>
          <li><b className="text-white">3.</b> Recebes o email quando o GoldKiller estiver ativo: TradingView › Indicadores › Só por convite › MTM Gold Killer.</li>
          <li><b className="text-white">4.</b> Ao dia 30, revês o teu diário. Podes continuar como Membro MoreThanMoney, comprar o scanner ou parar.</li>
        </ol>
        <p className="mt-10 text-xs leading-relaxed text-white/40">Conteúdo educativo. Não constitui aconselhamento financeiro. Os scanners são ferramentas de análise e não garantem resultados. Negociar ouro, Forex e CFD com alavancagem envolve risco elevado de perda, incluindo a totalidade do capital. A maioria das contas de retalho perde dinheiro com CFD.</p>
      </section>
    </main>
  )
}

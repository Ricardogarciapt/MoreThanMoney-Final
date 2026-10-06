import type { Metadata } from 'next'
import QueroQueMeLiguem from '@/components/captacao/quero-que-me-liguem'

/**
 * /ligar — o link curto para a bio e para os posts.
 *
 * Os posts levam `?ag=AG-SOCIAL` (e, se quiserem, `&o=<id do post>`): ver `linkLigar()` em
 * `lib/pedido-contacto.ts`, que é quem escreve este link. O formulário lê os dois do URL.
 */
export const metadata: Metadata = {
  title: 'Quero que me liguem · MoreThanMoney',
  description: 'Deixa o teu número e escolhe como preferes ser contactado pela equipa MoreThanMoney.',
  robots: { index: true, follow: true },
}

export default function LigarPage() {
  return (
    <main className="min-h-[100dvh] bg-[#0A0A0B] text-zinc-100">
      <div className="px-4 pb-4 pt-16 sm:px-6 sm:pt-20">
        <p className="mx-auto max-w-5xl text-[13px] font-semibold text-[#D2A63C]">MoreThanMoney</p>
      </div>
      <QueroQueMeLiguem
        origem="pagina:/ligar"
        ag="AG-SOCIAL"
        titulo="Falamos contigo"
        subtitulo="Formação, sinais, MTM Funded ou a EA Sensei: diz-nos o que te interessa e quando dá jeito. Contactamos só pelos canais que marcares."
      />
    </main>
  )
}

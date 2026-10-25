import type { Metadata } from 'next'
import Link from 'next/link'
import CaminhoMtm from '@/components/onboarding/caminho-mtm'
import { BONUS_PUPRIME_PCT, MIN_DEPOSIT, PRECO_PREMIUM, PRECO_PREMIUM_1O_MES } from '@/lib/escada-precos'
import { LINK_AGENDAR_ONBOARDING } from '@/lib/agenda/link'

export const metadata: Metadata = {
  title: 'Começar na MoreThanMoney · Onboarding',
  description:
    'Cinco passos por ordem: conta com 3 dias de Premium grátis, a app, a conta na corretora, os sinais e as aulas.',
}

/**
 * O caminho do ecossistema. Era um HTML solto em public/onboarding-mtm.html; passou a página para
 * os números (preços, depósito, bónus, link da agenda) virem dos sítios onde estão decididos e não
 * de um ficheiro de 1,3 MB que ninguém se lembrava de actualizar. O ficheiro antigo continua em
 * public/ só para não partir links velhos que apontem directamente para ele.
 */

/** O vídeo de 2 minutos da abertura de conta (16:9; a versão 9:16 é para as redes). */
const VIDEO_ABRIR_CONTA: string | null = '/videos/abrir-conta-pu-prime.mp4'

export default function OnboardingMtm() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-16">
      <Link href="/onboarding" className="text-[13px] text-[#8a8a95]">
        ← Onboarding
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Começar na MoreThanMoney
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#b9b9c3]">
        Cinco passos, por esta ordem. Numa tarde fica tudo montado: a tua conta, a app, a corretora, os sinais
        e as aulas. Se já fizeste algum, marca-o e passa ao seguinte.
      </p>

      <CaminhoMtm
        dados={{
          premium1oMes: PRECO_PREMIUM_1O_MES,
          premiumMensal: PRECO_PREMIUM,
          depositoMinimoUsd: MIN_DEPOSIT,
          bonusPct: BONUS_PUPRIME_PCT,
          linkAgendarOnboarding: LINK_AGENDAR_ONBOARDING,
          videoAbrirConta: VIDEO_ABRIR_CONTA,
        }}
      />

      <p className="mt-10 text-[13px] leading-relaxed text-[#8a8a95]">
        Dúvidas pelo caminho? Escreve-nos no Instagram{' '}
        <a href="https://instagram.com/morethanmoney.pt" className="text-[#D2A63C]">
          @morethanmoney.pt
        </a>{' '}
        ou para{' '}
        <a href="mailto:morethanmoneypt@gmail.com" className="text-[#D2A63C]">
          morethanmoneypt@gmail.com
        </a>
        .
      </p>
      <p className="mt-6 text-[13px] leading-relaxed text-[#7a7a84]">
        Conteúdo educativo, não constitui consultoria financeira. Operar com produtos alavancados tem risco
        elevado de perda e os resultados passados não garantem resultados futuros. A automação executa ordens
        na tua conta segundo as regras que tu defines.
      </p>
    </main>
  )
}

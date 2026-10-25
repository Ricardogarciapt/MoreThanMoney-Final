import type { Metadata } from 'next'
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
 *
 * Cabeçalho, textos e aviso legal estão dentro do CaminhoMtm porque mudam com a língua escolhida.
 */

/** O vídeo de 2 minutos da abertura de conta (16:9; a versão 9:16 é para as redes). */
const VIDEO_ABRIR_CONTA: string | null = '/videos/abrir-conta-pu-prime.mp4'
/** A versão em inglês do mesmo vídeo (mesma voz, mesmo ritmo). Serve também FR, DE e IT. */
const VIDEO_ABRIR_CONTA_EN: string | null = '/videos/open-account-pu-prime-en.mp4'

export default function OnboardingMtm() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-5 sm:py-14">
      <CaminhoMtm
        dados={{
          premium1oMes: PRECO_PREMIUM_1O_MES,
          premiumMensal: PRECO_PREMIUM,
          depositoMinimoUsd: MIN_DEPOSIT,
          bonusPct: BONUS_PUPRIME_PCT,
          linkAgendarOnboarding: LINK_AGENDAR_ONBOARDING,
          videoAbrirConta: VIDEO_ABRIR_CONTA,
          videoAbrirContaEn: VIDEO_ABRIR_CONTA_EN,
        }}
      />
    </main>
  )
}

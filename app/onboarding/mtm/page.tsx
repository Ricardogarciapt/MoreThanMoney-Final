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

/**
 * Os vídeos por língua (16:9; as versões 9:16 são para as redes). Uma língua sem o seu vídeo mostra
 * o inglês, com uma nota. PT tem a voz do Ricardo; as outras línguas têm vozes nativas.
 */
const VIDEOS_ABRIR_CONTA = {
  pt: '/videos/abrir-conta-pu-prime.mp4',
  en: '/videos/open-account-pu-prime-en-nativo.mp4',
  es: '/videos/abrir-conta-pu-prime-es.mp4',
  fr: '/videos/abrir-conta-pu-prime-fr.mp4',
  de: '/videos/abrir-conta-pu-prime-de.mp4',
  it: '/videos/abrir-conta-pu-prime-it.mp4',
}
/** O vídeo curto (~1 min) com os cinco passos. */
const VIDEOS_PASSOS = {
  pt: '/videos/onboarding-5-passos-pt.mp4',
  en: '/videos/onboarding-5-passos-en.mp4',
  es: '/videos/onboarding-5-passos-es.mp4',
  fr: '/videos/onboarding-5-passos-fr.mp4',
  de: '/videos/onboarding-5-passos-de.mp4',
  it: '/videos/onboarding-5-passos-it.mp4',
}

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
          videosAbrirConta: VIDEOS_ABRIR_CONTA,
          videosPassos: VIDEOS_PASSOS,
        }}
      />
    </main>
  )
}

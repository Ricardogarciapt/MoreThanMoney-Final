import type { Metadata } from 'next'
import PainelSocial from './painel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'MTM Social — cria o teu conteúdo',
  description: 'Cartões, carrosséis e capas de reel com a tua marca. Publica no teu perfil.',
}

/**
 * MTM SOCIAL — o estúdio de cartões, mas de cada um.
 *
 * Corre solto em `/mtmsocial` e emoldurado dentro da app-mobile e das nativas. Por isso não
 * desenha cabeçalho nem navegação própria: quem a abre já está dentro de alguma coisa, e uma
 * segunda barra por cima da primeira é o que faz uma app dentro de outra parecer um erro.
 */
export default function PaginaMtmSocial() {
  return <PainelSocial />
}

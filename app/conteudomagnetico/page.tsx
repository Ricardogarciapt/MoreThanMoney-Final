import type { Metadata } from 'next'
import PainelConteudoMagnetico from './painel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'MTM Conteúdo Magnético',
  description: 'Guiões, carrosséis, publicações, stories e reels com IA, nas marcas Ricardo Garcia e More Than Money.',
  robots: { index: false, follow: false },
}

/**
 * MTM CONTEÚDO MAGNÉTICO — o «Magnetic.IA PRO MAX» da casa, dentro do site.
 *
 * Rota de membros (middleware + `lib/member-route-guard`). O guião escreve-se com IA grátis,
 * as imagens desenham-se aqui (next/og) e o vídeo dos reels vai para a fila do motor que corre
 * fora da Vercel (services/conteudo-magnetico-render).
 */
export default function PaginaConteudoMagnetico() {
  return <PainelConteudoMagnetico />
}

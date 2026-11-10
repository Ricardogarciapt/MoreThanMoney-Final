import type { Metadata, Viewport } from 'next'
import Estudio from './estudio'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'MTM Estúdio',
  description: 'Gravar no telemóvel a ler o guião (teleprompter). Só para a casa.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#0b0b0c', viewportFit: 'cover' }

/**
 * ESTÚDIO — o Ricardo abre isto no telemóvel, escolhe um guião (Conteúdo Magnético) ou cola um
 * texto, lê no teleprompter por cima da câmara frontal e grava em 9:16. Cada take sobe para o
 * bucket privado `estudio` e fica como «bruto» para a edição no Mac (skill video-edit).
 * Rota de membros (middleware); a API volta a exigir admin.
 */
export default function PaginaEstudio() {
  return <Estudio />
}

import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import EstudioCasa from './casa'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'MTM Estúdio',
  description: 'Criar guiões, carrosséis e reels com IA e gravá-los no teleprompter.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#0b0b0c', viewportFit: 'cover' }

/**
 * ESTÚDIO — o Ricardo abre isto no telemóvel, escolhe um guião (Conteúdo Magnético) ou cola um
 * texto, lê no teleprompter por cima da câmara frontal e grava em 9:16. Cada take sobe para o
 * bucket privado `estudio` e fica como «bruto» para a edição no Mac (skill video-edit).
 * Desde 10/11 também tem o separador «Criar» (o antigo /conteudomagnetico, que agora redirecciona
 * para aqui). Rota de membros (middleware); a gravação exige admin na API.
 */
export default function PaginaEstudio() {
  return (
    <Suspense>
      <EstudioCasa />
    </Suspense>
  )
}

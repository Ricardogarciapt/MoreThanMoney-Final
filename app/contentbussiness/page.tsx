import type { Metadata } from 'next'
import PilarPagina from '@/components/pilares/pilar-pagina'
import { PILARES } from '@/lib/pilares'
import { montarPilar } from '@/lib/pilares-servidor'

/**
 * MTM CONTENT & BUSINESS — construir audiência e construir negócio.
 *
 * Os educadores e as salas vêm da base (`montarPilar`), e não escritos aqui: era o pedido do dono
 * — um educador novo ligado a uma destas academias aparece sozinho, sem ninguém mexer no código.
 */
export const metadata: Metadata = {
  title: 'MTM Content & Business · MoreThanMoney',
  description: PILARES.content.definicao,
}

// A página lê a base a cada pedido: um educador que entre hoje aparece hoje.
export const dynamic = 'force-dynamic'

export default async function ContentBusinessPage() {
  const areas = await montarPilar('content')
  return <PilarPagina pilar={PILARES.content} areas={areas} outroPilar={PILARES.markets} />
}

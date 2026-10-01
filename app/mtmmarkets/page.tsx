import type { Metadata } from 'next'
import PilarPagina from '@/components/pilares/pilar-pagina'
import { PILARES } from '@/lib/pilares'
import { montarPilar } from '@/lib/pilares-servidor'

/**
 * MTM MARKETS — os mercados e o dinheiro.
 *
 * O mesmo desenho do Content & Business, com os mesmos dados vindos da base. Quando entrar um
 * educador de Ações e ETF ou de Imobiliário, aparece aqui sem ninguém escrever uma linha.
 */
export const metadata: Metadata = {
  title: 'MTM Markets · MoreThanMoney',
  description: PILARES.markets.definicao,
}

export const dynamic = 'force-dynamic'

export default async function MtmMarketsPage() {
  const areas = await montarPilar('markets')
  return <PilarPagina pilar={PILARES.markets} areas={areas} outroPilar={PILARES.content} />
}

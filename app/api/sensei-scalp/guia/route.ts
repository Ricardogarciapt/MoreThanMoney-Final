import { NextResponse } from 'next/server'
import { gerarGuiaScalp } from '@/lib/sensei-scalp-guia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O guia da Scalp Edition em PDF. Aberto, como o do Sensei EA: quem está a decidir precisa de o
 * ler antes de pagar, e nesta EA em particular há coisas que é melhor saber ANTES — que perde a
 * maior parte das trades por desenho, e que não leva stop loss fixo.
 *
 * Ao contrário do guia do AllInOne, este não traz números da conta provider: só se publicam
 * resultados de conta real, em pips e com origem declarada. Sem testes nem demo no texto — o
 * produto está validado e opera sem restrições.
 */
export async function GET() {
  try {
    const pdf = await gerarGuiaScalp()
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="MTM-Sensei-Scalp-Guia.pdf"',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('[SENSEI-SCALP] Falha a gerar o guia:', e)
    return NextResponse.json({ error: 'Não foi possível gerar o guia.' }, { status: 500 })
  }
}

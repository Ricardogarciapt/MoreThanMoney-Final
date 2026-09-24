import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { savePipsProof, blocoPips, notaViesPreco, publicavel } from '@/lib/pips-proof'

/**
 * CRON: recalcula a prova em pips a partir do histórico do broker da conta-espelho.
 *
 * Existe separado do bom-dia por duas razões: o bom-dia corre uma vez por dia e tem guarda de
 * duplicação (se falhar, ficava-se sem números até ao dia seguinte), e assim há forma de VER o
 * que vai ser publicado sem publicar nada.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dias = Math.min(Math.max(Number(request.nextUrl.searchParams.get('dias')) || 30, 1), 365)
  try {
    const p = await savePipsProof(dias)
    return NextResponse.json({
      success: true,
      publicavel: publicavel(p),
      previsualizacao: publicavel(p) ? blocoPips(p) : null,
      // Sai já dentro da pré-visualização; fica também à parte para se ver, de relance, se a
      // amostra ainda atravessa a correcção de preço de 24/09 — ou se já se calou sozinha.
      notaVies: notaViesPreco(p),
      prova: p,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'erro' },
      { status: 500 },
    )
  }
}

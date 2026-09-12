import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { reconstruirDesempenho, guardarReconstrucao } from '@/lib/mtmauto/reconstruir-desempenho'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

/**
 * Repõe o histórico de todas as fontes contra o preço real e guarda o resultado.
 *
 * Corre de MADRUGADA e uma vez por dia porque é caro: são centenas de pedidos de velas à MetaApi
 * e alguns minutos de reposição. Os ecrãs leem o que ficou guardado — recalcular a cada abertura
 * era impensável.
 *
 * Vai buscar 120 dias de cada vez, e não só o dia novo, de propósito: uma posição aberta há uma
 * semana só ganha resultado quando fecha, e uma reposição incremental deixava-a congelada no
 * estado em que estava na noite em que abriu.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await reconstruirDesempenho({ dias: 120 })
    await guardarReconstrucao(r)
    return NextResponse.json({
      success: true,
      trades: r.trades.length,
      fontes: r.porFonte.length,
      simbolosSemVelas: r.simbolosSemVelas,
      timestamp: r.asOf,
    })
  } catch (e) {
    console.error('[CRON reconstruir-desempenho] erro:', e)
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { actualizarSaldos } from '@/lib/admin-centro/servidor/contas'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Saldos das contas de corretora, de hora a hora, sem ninguém carregar no botão.
 *
 * É o mesmo «Actualizar saldos» do Centro (lib/admin-centro/servidor/contas.ts): só as contas com
 * leitura velha (>10 min), 25 por lote, 3 em paralelo, 1 pedido por conta física. Aqui repete-se o
 * lote até não restar nenhuma ou até 4 lotes — 100 contas por hora chega para a frota toda e não
 * é volume que incomode a quota da MetaApi. As listas (Centro, backoffice, /backoffice/ib) lêem
 * contas_saldo_lido; nunca a MetaApi por linha.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const inicio = Date.now()
  let lidas = 0
  let restantes = 0
  const falhas: { ref: string; erro: string }[] = []
  try {
    for (let lote = 0; lote < 4; lote++) {
      const r = await actualizarSaldos()
      lidas += r.lidas
      falhas.push(...r.falhas)
      restantes = r.restantes
      if (r.restantes === 0 || Date.now() - inicio > 200_000) break
    }
    console.log(`[CRON contas-saldos] ${lidas} lidas · ${falhas.length} falhas · ${restantes} restantes · ${Date.now() - inicio} ms`)
    return NextResponse.json({ ok: true, lidas, falhas: falhas.length, restantes, ms: Date.now() - inicio })
  } catch (e) {
    console.error('[CRON contas-saldos]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}

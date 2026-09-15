import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runT2TPriceMonitor } from '@/lib/mtmcopy/t2t-price-monitor'
import { emSegundoPlano } from '@/lib/mtmcopy/metaapi-quota'

/**
 * CRON: monitor de PREÇO das posições Tap to Trade dos seguidores — entry-hit → parciais → BE →
 * trailing → fecho, em tempo real e SEM depender de mensagens da fonte. É o que dá gestão completa
 * ao MTM Scanner (que só emite entradas). Switch t2t_price_monitor (default ON).
 * Correr a cada ~1s pelo loop do VPS (a cron Vercel é só a rede de segurança de 1 min).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await emSegundoPlano(() => runT2TPriceMonitor()) // leituras saltam com a quota estourada; ordens nunca
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}

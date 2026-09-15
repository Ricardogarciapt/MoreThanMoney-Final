import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runSignalTracker } from '@/lib/mtmcopy/signal-tracker'
import { emSegundoPlano } from '@/lib/mtmcopy/metaapi-quota'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Acompanha TODOS os sinais publicados nos canais do Tap to Trade, tenha alguém aceitado ou não.
 * Corre no mesmo loop do VPS que os outros monitores.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await emSegundoPlano(() => runSignalTracker()) // leituras saltam com a quota estourada; ordens nunca
    if (r.eventos.length) console.log('[CRON signal-tracker]', r.eventos.join(' · '))
    return NextResponse.json({ success: true, ...r, timestamp: new Date().toISOString() })
  } catch (e) {
    console.error('[CRON signal-tracker] erro:', e)
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runMtmcopySystemSync } from '@/lib/mtmcopy/system-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Reconciliador automático site↔MetaApi (MTM Copy + T2T).
 * Corre o system-sync GLOBAL sem `force` (não re-subscreve tudo às cegas): reconcilia
 * as flags copyfactory_subscribed vs subscrição real, aplica o guard de "pausado"
 * (nunca copia contas em pausa) e demove linhas cuja conta MetaApi já não existe.
 * As mutações por ação (ligar/ajustar/remover) já sincronizam em tempo real; este cron
 * é a rede de segurança contra drift.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runMtmcopySystemSync({ forceCopyFactory: false })
    console.log('[CRON mtmcopy-reconcile]', { ok: result.ok })
    return NextResponse.json({ success: result.ok, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[CRON mtmcopy-reconcile] erro:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'erro' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

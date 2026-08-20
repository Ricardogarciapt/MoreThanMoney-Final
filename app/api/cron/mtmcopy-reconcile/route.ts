import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runMtmcopySystemSync } from '@/lib/mtmcopy/system-sync'
import { scanOrphanPositions, orphanAlertText } from '@/lib/mtmcopy/orphan-positions'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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

    // POSIÇÕES ÓRFÃS: abertas na corretora com comentário nosso, mas sem registo no motor —
    // não levam parciais, break-even nem trailing, e ninguém dava por isso porque não há erro
    // nenhum. Se aparecerem, o admin é avisado no Telegram.
    let orfas: Awaited<ReturnType<typeof scanOrphanPositions>> | null = null
    try {
      orfas = await scanOrphanPositions()
      const aviso = orphanAlertText(orfas)
      if (aviso) {
        const { data } = await getSupabaseAdmin()
          .from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
        const chatId = typeof data?.value === 'string' ? data.value : (data?.value as { id?: string })?.id
        if (chatId) await sendTelegramChannelMessage(String(chatId), aviso).catch(() => {})
        console.warn('[CRON mtmcopy-reconcile] posições sem gestão:', orfas.orfas.length)
      }
    } catch (e) {
      console.warn('[CRON mtmcopy-reconcile] varrimento de órfãs falhou:', e instanceof Error ? e.message : e)
    }

    console.log('[CRON mtmcopy-reconcile]', { ok: result.ok, orfas: orfas?.orfas.length ?? null })
    return NextResponse.json({
      success: result.ok,
      ...result,
      orfas: orfas ? { total: orfas.orfas.length, contas: orfas.contas, ilegiveis: orfas.ilegiveis, geridas: orfas.geridas, lista: orfas.orfas } : null,
      timestamp: new Date().toISOString(),
    })
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

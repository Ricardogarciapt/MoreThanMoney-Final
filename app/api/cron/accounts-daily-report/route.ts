import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runDailyReport, reportSummary } from '@/lib/accounts-daily-report'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { correrExtratosMensais, mesAnterior } from '@/lib/mtmfunded/extrato-mensal-envio'

/**
 * CRON diário: relatório de crescimento das contas reais (equidade, P&L do dia/mês, win rate,
 * profit factor por conta). Grava em site_settings.accounts_daily_report e envia o resumo ao Ricardo
 * por Telegram. É a base do artefacto diário e das métricas do journaling.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const report = await runDailyReport()
    const summary = reportSummary(report)

    // Envia o resumo ao Ricardo (o detalhe fica no admin/artefacto).
    const token = getMtmcopyBotToken()
    let sent = false
    if (token && ADMIN_CHAT) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_CHAT, text: summary, disable_web_page_preview: true }),
      }).catch(() => null)
      sent = !!r?.ok
    }

    // Extrato mensal das contas MTM Funded: corre só no dia 1 (mês anterior), dentro deste cron
    // diário para não gastar uma entrada nova no vercel.json (tecto de 100). Idempotente por conta
    // e mês; sem MTM_STATEMENTS_ENVIO=1 fica em simulação.
    let extratos: unknown = null
    if (new Date().getUTCDate() === 1) {
      try {
        extratos = await correrExtratosMensais(mesAnterior(new Date()))
      } catch (err) {
        extratos = { erro: err instanceof Error ? err.message : 'erro' }
      }
    }

    return NextResponse.json({ success: true, date: report.date, totals: report.totals, accounts: report.accounts.length, telegram: sent, extratos })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}

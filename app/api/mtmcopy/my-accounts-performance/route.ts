import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getDailyReport } from '@/lib/accounts-daily-report'

/**
 * Desempenho das contas DO PRÓPRIO utilizador (equidade, P&L do dia/mês, win rate, profit factor).
 * Alimenta o painel de desempenho no journaling do trading plan e o terminal de métricas.
 * Lê o snapshot diário (site_settings.accounts_daily_report) e filtra pelas ligações do utilizador —
 * sem chamar a MetaApi no pedido do cliente (rápido e sem gastar quota).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdmin()
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }
  const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { data: conns } = await admin
    .from('mtmcopy_connections')
    .select('metaapi_account_id, account_label')
    .eq('user_id', user.id)
    .eq('is_active', true)
  const mine = new Set((conns ?? []).map((c) => (c as { metaapi_account_id?: string }).metaapi_account_id).filter(Boolean) as string[])
  if (!mine.size) return NextResponse.json({ ok: true, accounts: [], totals: null, date: null })

  const report = await getDailyReport()
  const accounts = (report?.accounts ?? []).filter((a) => mine.has(a.accountId))
  const live = accounts.filter((a) => a.ok)
  const totals = live.length
    ? {
        equity: Number(live.reduce((s, a) => s + (a.equity ?? 0), 0).toFixed(2)),
        pnlToday: Number(live.reduce((s, a) => s + a.pnlToday, 0).toFixed(2)),
        pnlMonth: Number(live.reduce((s, a) => s + a.pnlMonth, 0).toFixed(2)),
        trades: live.reduce((s, a) => s + (a.trades ?? 0), 0),
      }
    : null

  return NextResponse.json({ ok: true, date: report?.date ?? null, accounts, totals })
}

/**
 * RELATÓRIO DIÁRIO das contas reais (equidade, P&L do dia/mês, win rate, profit factor).
 * Fonte: MetaStats da MetaApi (REST — não precisa de sincronização RPC, funciona com contas ociosas
 * desde que tenham histórico). Corre no cron diário, grava em site_settings.accounts_daily_report e
 * envia o resumo ao Ricardo por Telegram.
 *
 * ⚠️ Sobre os números: `profit`/`gain` do MetaStats são ACUMULADOS DE VIDA e ficam distorcidos por
 * depósitos/levantamentos (ver proof-stats). Por isso o relatório usa o P&L do DIA e do MÊS (soma do
 * dailyGrowth, imune a essas operações) e trata gain%/drawdown como indicativos, não publicáveis.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const KEY = 'accounts_daily_report'
const REGIONS = ['london', 'new-york']

export interface AccountDay {
  label: string
  accountId: string
  balance: number | null
  equity: number | null
  pnlToday: number
  pnlMonth: number
  trades: number | null
  winRatePct: number | null
  profitFactor: number | null
  ok: boolean
  note?: string
}

export interface DailyReport {
  date: string
  accounts: AccountDay[]
  totals: { equity: number; pnlToday: number; pnlMonth: number; trades: number }
  generatedAt: string
}

async function metastats(accountId: string, token: string): Promise<Record<string, unknown> | null> {
  for (const r of REGIONS) {
    try {
      const res = await fetch(`https://metastats-api-v1.${r}.agiliumtrade.ai/users/current/accounts/${accountId}/metrics`, {
        headers: { 'auth-token': token },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) continue
      const j = (await res.json().catch(() => null)) as { metrics?: Record<string, unknown> } | null
      if (j?.metrics) return j.metrics
    } catch {
      /* tenta a região seguinte */
    }
  }
  return null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Constrói o relatório do dia a partir das ligações ativas com conta MetaApi. */
export async function buildDailyReport(): Promise<DailyReport> {
  const token = process.env.METAAPI_TOKEN?.trim() || ''
  const admin = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)

  const { data: conns } = await admin
    .from('mtmcopy_connections')
    .select('account_label, metaapi_account_id, is_active')
    .not('metaapi_account_id', 'is', null)
    .eq('is_active', true)
    // Contas marcadas como fora das métricas continuam a operar, mas não entram no relatório.
    .eq('metrics_excluded', false)
    .limit(30)

  const accounts: AccountDay[] = []
  for (const c of conns ?? []) {
    const label = (c as { account_label?: string | null }).account_label || 'Conta sem nome'
    const accountId = (c as { metaapi_account_id: string }).metaapi_account_id
    const m = token ? await metastats(accountId, token) : null
    if (!m) {
      accounts.push({ label, accountId, balance: null, equity: null, pnlToday: 0, pnlMonth: 0, trades: null, winRatePct: null, profitFactor: null, ok: false, note: 'sem métricas (conta ociosa)' })
      continue
    }
    const daily = Array.isArray(m.dailyGrowth) ? (m.dailyGrowth as Array<Record<string, unknown>>) : []
    const todayRow = daily.find((d) => String(d.date ?? '').slice(0, 10) === today)
    const pnlMonth = daily
      .filter((d) => String(d.date ?? '').slice(0, 7) === month)
      .reduce((a, d) => a + (num(d.profit) ?? 0), 0)
    accounts.push({
      label,
      accountId,
      balance: num(m.balance),
      equity: num(m.equity),
      pnlToday: Number((num(todayRow?.profit) ?? 0).toFixed(2)),
      pnlMonth: Number(pnlMonth.toFixed(2)),
      trades: num(m.trades),
      winRatePct: num(m.wonTradesPercent),
      profitFactor: num(m.profitFactor),
      ok: true,
    })
  }

  const live = accounts.filter((a) => a.ok)
  const totals = {
    equity: Number(live.reduce((a, x) => a + (x.equity ?? 0), 0).toFixed(2)),
    pnlToday: Number(live.reduce((a, x) => a + x.pnlToday, 0).toFixed(2)),
    pnlMonth: Number(live.reduce((a, x) => a + x.pnlMonth, 0).toFixed(2)),
    trades: live.reduce((a, x) => a + (x.trades ?? 0), 0),
  }
  return { date: today, accounts, totals, generatedAt: new Date().toISOString() }
}

/** Resumo curto p/ Telegram (o detalhe fica no artefacto/admin). */
export function reportSummary(r: DailyReport): string {
  const nf = (n: number) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const sign = (n: number) => (n >= 0 ? `+${nf(n)}` : nf(n))
  const live = r.accounts.filter((a) => a.ok).sort((a, b) => b.pnlToday - a.pnlToday)
  const linhas = live.map((a) => `• ${a.label}: ${sign(a.pnlToday)} hoje · equidade ${nf(a.equity ?? 0)}`)
  const best = live.reduce<AccountDay | null>((b, a) => (!b || (a.profitFactor ?? 0) > (b.profitFactor ?? 0) ? a : b), null)
  return [
    `📈 Contas — ${r.date}`,
    ``,
    `Equidade total: ${nf(r.totals.equity)}`,
    `P&L hoje: ${sign(r.totals.pnlToday)} · mês: ${sign(r.totals.pnlMonth)}`,
    ``,
    ...linhas,
    best?.profitFactor ? `\n🏆 Melhor edge: ${best.label} (PF ${best.profitFactor.toFixed(2)}, win ${Math.round(best.winRatePct ?? 0)}%)` : '',
  ].filter(Boolean).join('\n')
}

/** Corre, grava e devolve o relatório (usado pelo cron). */
export async function runDailyReport(): Promise<DailyReport> {
  const report = await buildDailyReport()
  await getSupabaseAdmin().from('site_settings').upsert(
    { key: KEY, value: report as unknown as Record<string, unknown>, description: 'Relatório diário das contas reais (MetaStats)', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return report
}

/** Último relatório gravado (para o admin / journaling / artefacto). */
export async function getDailyReport(): Promise<DailyReport | null> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY).maybeSingle()
    return (data?.value as unknown as DailyReport) ?? null
  } catch {
    return null
  }
}

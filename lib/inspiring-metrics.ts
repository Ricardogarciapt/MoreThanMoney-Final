/**
 * MÉTRICAS PARA PUBLICAÇÃO — escolhe, do desempenho REAL, os destaques que são simultaneamente
 * VERDADEIROS e POSITIVOS (pedido Ricardo: inspiradoras e positivas).
 *
 * Regra editorial: nunca inventar e nunca apresentar um número mau como bom. O que se faz é
 * SELECIONAR os indicadores genuinamente fortes (win rate, a conta com melhor edge, dias verdes,
 * volume de sinais entregues, comunidade) e omitir o resto — que é o normal em marketing honesto.
 * Se num dia não houver nada de positivo defensável, devolve null e o conteúdo cai na prova auditada
 * (nunca força um destaque).
 */
import { getDailyReport, type DailyReport } from '@/lib/accounts-daily-report'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export interface Highlight {
  /** Frase pronta a usar no post/email (curta, sem promessas). */
  line: string
  /** Tipo, p/ variar entre publicações e não repetir o mesmo ângulo. */
  kind: 'day' | 'best_account' | 'win_rate' | 'signals' | 'community'
  /** Números crus, se o gerador quiser compor à maneira dele. */
  value: number
}

const nf = (n: number, d = 2) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)

/**
 * Destaques positivos e verificáveis de hoje. Ordenados por força.
 * NÃO inclui o P&L agregado quando é negativo — só entra se for verde.
 */
export async function inspiringHighlights(): Promise<Highlight[]> {
  const out: Highlight[] = []
  const report: DailyReport | null = await getDailyReport()

  if (report) {
    const live = report.accounts.filter((a) => a.ok)

    // 1) Dia verde (só se FOR verde) — o mais concreto e atual.
    if (report.totals.pnlToday > 0) {
      out.push({
        kind: 'day',
        value: report.totals.pnlToday,
        line: `Dia fechado no verde nas contas reais: +${nf(report.totals.pnlToday)} hoje.`,
      })
    }

    // 2) A conta com melhor edge (profit factor > 1 e amostra mínima).
    const best = live
      .filter((a) => (a.profitFactor ?? 0) > 1.2 && (a.trades ?? 0) >= 20)
      .sort((a, b) => (b.profitFactor ?? 0) - (a.profitFactor ?? 0))[0]
    if (best) {
      out.push({
        kind: 'best_account',
        value: best.profitFactor ?? 0,
        line: `Conta real a compor: profit factor ${nf(best.profitFactor ?? 0)} com ${Math.round(best.winRatePct ?? 0)}% de acerto em ${best.trades} trades.`,
      })
    }

    // 3) Win rate — o indicador mais consistentemente forte do sistema.
    const withTrades = live.filter((a) => (a.trades ?? 0) >= 30 && a.winRatePct != null)
    if (withTrades.length) {
      const totalTrades = withTrades.reduce((a, x) => a + (x.trades ?? 0), 0)
      const wr = withTrades.reduce((a, x) => a + (x.winRatePct ?? 0) * (x.trades ?? 0), 0) / totalTrades
      if (wr >= 55) {
        out.push({
          kind: 'win_rate',
          value: Math.round(wr * 10) / 10,
          line: `${Math.round(wr)}% de acerto em ${new Intl.NumberFormat('pt-PT').format(totalTrades)} trades reais acompanhados.`,
        })
      }
    }
  }

  // 4) Volume entregue nos últimos 7 dias (esforço/consistência — sempre positivo de mostrar).
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { count } = await getSupabaseAdmin()
      .from('tradingview_signals')
      .select('id', { count: 'exact', head: true })
      .eq('signal_kind', 'entry')
      .gte('received_at', since)
      .not('trade_status', 'in', '("filtered","discarded")')
    if (count && count > 50) {
      out.push({
        kind: 'signals',
        value: count,
        line: `${new Intl.NumberFormat('pt-PT').format(count)} oportunidades analisadas e entregues na última semana.`,
      })
    }
  } catch {
    /* opcional */
  }

  return out
}

/** Uma linha só, para copy curto. Devolve null se não houver nada positivo defensável hoje. */
export async function inspiringLine(prefer?: Highlight['kind']): Promise<string | null> {
  const hs = await inspiringHighlights()
  if (!hs.length) return null
  const chosen = (prefer && hs.find((h) => h.kind === prefer)) || hs[0]
  return chosen.line
}

/**
 * NÚMEROS DA LANDING — fonte única e viva das métricas mostradas nas páginas públicas.
 *
 *   cron semanal (segunda 06:00) → computeLandingStats() → site_settings.landing_stats
 *                                → getLandingStats() no servidor
 *                                → GET /api/landing-stats no cliente
 *
 * Ao contrário de `proof-stats` (que está travado porque o profit do MetaStats vem distorcido por
 * depósitos e levantamentos), aqui NÃO se publica nenhum valor em euros. São contagens da nossa
 * própria base de dados — trades fechadas, sinais recebidos, ordens colocadas, certificados
 * emitidos — que não dependem de nenhuma leitura externa e por isso podem correr vivas.
 *
 * Semanal e não diário de propósito: os números mexem devagar e uma página cujos totais mudam todos
 * os dias convida o visitante a duvidar deles. Uma vez por semana chega, e a data fica à vista.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const KEY = 'landing_stats'

export interface LandingStats {
  /** Trades FECHADAS registadas no diário (trading_plan_trades). */
  trades: number
  /** % de trades fechadas com pnl > 0. Arredondada à unidade. */
  winRatePct: number
  /** Contas distintas que contribuíram para essas trades. */
  contas: number
  /** Sinais recebidos dos scanners no webhook do TradingView. */
  sinais: number
  /** Ordens efetivamente colocadas em conta pelo motor (executed + open + closed). */
  ordens: number
  /** Certificados oficiais emitidos (avaliações com aproveitamento). */
  certificados: number
  /** Data a que os números se referem (ISO, AAAA-MM-DD). */
  asOf: string
  /** 'live' = calculado pelo cron · 'snapshot' = último valor conhecido em código. */
  source: 'live' | 'snapshot'
}

/** Último valor conhecido — só serve se a BD não responder. Nunca inventa: foi medido a 28/09/2026. */
export const SNAPSHOT: LandingStats = {
  trades: 7329,
  winRatePct: 62,
  contas: 11,
  sinais: 26358,
  ordens: 3335,
  certificados: 56,
  asOf: '2026-09-28',
  source: 'snapshot',
}

/** Lê os números publicáveis. Nunca falha: cai no snapshot. */
export async function getLandingStats(): Promise<LandingStats> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY)
      // 4 s e cai no snapshot: estas páginas também se geram no build, e uma leitura lenta do
      // Supabase não pode prender o deploy (17/09 falhou por isso).
      .abortSignal(AbortSignal.timeout(4000))
      .maybeSingle()
    const v = data?.value as Partial<LandingStats> | null
    if (v && typeof v.trades === 'number' && v.trades > 0) {
      return {
        trades: v.trades,
        winRatePct: typeof v.winRatePct === 'number' ? v.winRatePct : SNAPSHOT.winRatePct,
        contas: typeof v.contas === 'number' ? v.contas : SNAPSHOT.contas,
        sinais: typeof v.sinais === 'number' ? v.sinais : SNAPSHOT.sinais,
        ordens: typeof v.ordens === 'number' ? v.ordens : SNAPSHOT.ordens,
        certificados: typeof v.certificados === 'number' ? v.certificados : SNAPSHOT.certificados,
        asOf: v.asOf || SNAPSHOT.asOf,
        source: 'live',
      }
    }
  } catch {
    /* cai no snapshot */
  }
  return { ...SNAPSHOT }
}

/** "atualizado a 20/08" — o rodapé de honestidade que acompanha os números. */
export function asOfLabel(s: LandingStats): string {
  const d = new Date(s.asOf)
  if (Number.isNaN(d.getTime())) return s.asOf
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function countOf(table: string, apply?: (q: any) => any): Promise<number | null> {
  try {
    let q = getSupabaseAdmin().from(table).select('id', { count: 'exact', head: true })
    if (apply) q = apply(q)
    const { count, error } = await q
    if (error) return null
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

/**
 * Recalcula e grava. Corre no cron semanal.
 *
 * Cada contagem falha de forma independente: se uma não puder ser lida, mantém-se o valor anterior
 * em vez de escrever um zero. Um número a cair para zero na página seria pior do que um número
 * ligeiramente velho.
 */
export async function computeLandingStats(): Promise<{ ok: boolean; stats: LandingStats; reason?: string }> {
  const prev = await getLandingStats()

  const [closed, wins, sinais, certificados] = await Promise.all([
    countOf('trading_plan_trades', (q) => q.eq('status', 'closed')),
    countOf('trading_plan_trades', (q) => q.eq('status', 'closed').gt('pnl', 0)),
    countOf('tradingview_signals'),
    countOf('assessment_attempts', (q) => q.eq('passed', true)),
  ])

  // Ordens que chegaram mesmo a existir em conta — 'received' e 'skipped' NÃO contam.
  const ordens = await countOf('mtmcopy_signal_log', (q) => q.in('status', ['executed', 'open', 'closed']))

  // Contas distintas por trás das trades fechadas: precisa das linhas, não de um count.
  let contas = prev.contas
  try {
    const { data } = await getSupabaseAdmin()
      .from('trading_plan_trades')
      .select('mtmcopy_connection_id')
      .eq('status', 'closed')
      .not('mtmcopy_connection_id', 'is', null)
    if (data) {
      const n = new Set(data.map((r: any) => r.mtmcopy_connection_id)).size
      if (n > 0) contas = n
    }
  } catch {
    /* mantém o anterior */
  }

  const trades = closed && closed > 0 ? closed : prev.trades
  const winRatePct =
    closed && closed > 0 && typeof wins === 'number' ? Math.round((wins / closed) * 100) : prev.winRatePct

  const stats: LandingStats = {
    trades,
    winRatePct,
    contas,
    sinais: sinais && sinais > 0 ? sinais : prev.sinais,
    ordens: ordens && ordens > 0 ? ordens : prev.ordens,
    certificados: certificados && certificados > 0 ? certificados : prev.certificados,
    asOf: new Date().toISOString().slice(0, 10),
    source: 'live',
  }

  try {
    await getSupabaseAdmin().from('site_settings').upsert(
      {
        key: KEY,
        value: stats,
        description: 'Números públicos da landing (contagens da BD) — recalculados semanalmente',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch (e) {
    return { ok: false, stats, reason: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true, stats }
}

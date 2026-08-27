/**
 * PROVA SOCIAL — fonte ÚNICA e VIVA dos números usados no funil (posts, emails, ManyChat, freebies,
 * cartões sociais). Antes cada ficheiro tinha os valores hardcoded ("675 trades · 63% · +7.060€"),
 * congelados na auditoria de 30/06 — daí ficarem sempre iguais. Agora:
 *
 *   cron diário  →  computeProofStats()  →  site_settings.proof_stats  →  getProofStats() no conteúdo
 *
 * Os números vêm das CONTAS MESTRE reais (MetaStats via getProviderStrategyMetrics) — a mesma classe
 * de prova da auditoria original (dinheiro real), NÃO os sinais crus dos scanners.
 * Se a leitura falhar, cai no snapshot AUDITADO congelado (nunca publica números inventados).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const KEY = 'proof_stats'

/** Snapshot AUDITADO (30/06/2026) — fallback quando não há leitura viva. */
export const AUDITED_FALLBACK = {
  trades: 675,
  winRatePct: 63,
  profit: 7060,
  currency: 'EUR' as const,
  members: 356,
  asOf: '2026-06-30',
  source: 'auditoria' as const,
}

export interface ProofStats {
  trades: number
  winRatePct: number
  profit: number
  currency: string
  members: number
  /** Data a que os números se referem (ISO). */
  asOf: string
  /** 'auditoria' = snapshot congelado · 'live' = contas mestre reais (MetaStats). */
  source: 'auditoria' | 'live'
}

/** Lê os números publicáveis. Nunca falha: cai no snapshot auditado. */
export async function getProofStats(): Promise<ProofStats> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = data?.value as Partial<ProofStats> | null
    if (v && typeof v.trades === 'number' && v.trades > 0 && typeof v.winRatePct === 'number') {
      return {
        trades: v.trades,
        winRatePct: v.winRatePct,
        profit: typeof v.profit === 'number' ? v.profit : AUDITED_FALLBACK.profit,
        currency: v.currency || AUDITED_FALLBACK.currency,
        members: typeof v.members === 'number' && v.members > 0 ? v.members : AUDITED_FALLBACK.members,
        asOf: v.asOf || new Date().toISOString().slice(0, 10),
        source: v.source === 'live' ? 'live' : 'auditoria',
      }
    }
  } catch {
    /* cai no fallback */
  }
  return { ...AUDITED_FALLBACK }
}

/**
 * @deprecated NÃO usar em conteúdo publicado (decisão 2026-08-26).
 *
 * A prova em euros foi retirada do funil: o mesmo sinal vale 8 $ a quem opera 0,01 lote e 800 $ a
 * quem opera 1, por isso um número em euros não descreve o que ninguém vai receber. O que se
 * publica agora são PIPS e PERCENTAGEM — ver `lib/pips-proof.ts` — com o dinheiro apresentado como
 * exemplo por tamanho de lote e sempre com a ressalva legal. Isto fica só para relatórios internos.
 */
export function proofLine(s: ProofStats, opts?: { withProfit?: boolean }): string {
  const nf = new Intl.NumberFormat('pt-PT')
  const sym = s.currency === 'EUR' ? '€' : s.currency === 'USD' ? '$' : ` ${s.currency}`
  const profit = s.currency === 'EUR' ? `+${nf.format(Math.round(s.profit))}${sym}` : `+${sym === '$' ? '$' : ''}${nf.format(Math.round(s.profit))}`
  const parts = [`${nf.format(s.trades)} trades`, `${Math.round(s.winRatePct)}% win rate`]
  if (opts?.withProfit !== false) parts.push(profit)
  return parts.join(' · ')
}

/** Data legível p/ rodapé de prova: "atualizado a 18/08". */
export function proofAsOfLabel(s: ProofStats): string {
  const d = new Date(s.asOf)
  if (Number.isNaN(d.getTime())) return s.asOf
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Recalcula a partir das CONTAS MESTRE reais e grava. Corre no cron diário.
 * Agrega: trades = soma; win rate = média PONDERADA pelo nº de trades; lucro = soma.
 * Só grava se houver dados suficientes (senão mantém o que está — nunca degrada a prova).
 */
export async function computeProofStats(): Promise<{ ok: boolean; stats?: ProofStats; reason?: string }> {
  // ⚠️ TRAVADO (2026-08-18): a 1.ª execução real deu profit=+52.412 USD — número DISTORCIDO. O
  // `profit` do MetaStats é acumulado de vida e é inflacionado por depósitos/levantamentos (as contas
  // mostram gain -100% e drawdown >100% pelo mesmo motivo). Publicar isso seria uma alegação FALSA.
  // Mantém-se o snapshot AUDITADO até haver um cálculo validado (ex.: só contas sem operações de
  // saldo, ou P&L por período com baseline). Põe PROOF_STATS_LIVE=true para reativar conscientemente.
  if (process.env.PROOF_STATS_LIVE !== 'true') {
    return { ok: false, reason: 'cálculo live travado (profit distorcido por depósitos/levantamentos) — usa o snapshot auditado' }
  }
  try {
    const { getProviderStrategyMetrics } = await import('@/lib/mtmcopy/provider-metrics')
    const payload = await getProviderStrategyMetrics()
    const rows = (payload?.providers ?? []) as Array<{
      trades: number | null
      winRatePct: number | null
      profit: number | null
      currency?: string | null
    }>
    let trades = 0
    let weighted = 0
    let profit = 0
    let currency = 'USD'
    for (const r of rows) {
      const t = typeof r.trades === 'number' && r.trades > 0 ? r.trades : 0
      if (!t) continue
      trades += t
      if (typeof r.winRatePct === 'number') weighted += r.winRatePct * t
      if (typeof r.profit === 'number') profit += r.profit
      if (r.currency) currency = r.currency
    }
    if (trades < 20) return { ok: false, reason: `poucos trades reais (${trades}) — mantém o snapshot atual` }

    // Membros ativos (prova de comunidade) — conta real da BD.
    let members = AUDITED_FALLBACK.members
    try {
      const { count } = await getSupabaseAdmin().from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true)
      if (count && count > 0) members = count
    } catch { /* mantém */ }

    const stats: ProofStats = {
      trades,
      winRatePct: Math.round((weighted / trades) * 10) / 10,
      profit: Math.round(profit),
      currency,
      members,
      asOf: new Date().toISOString().slice(0, 10),
      source: 'live',
    }
    await getSupabaseAdmin().from('site_settings').upsert(
      { key: KEY, value: stats, description: 'Prova social viva (contas mestre reais) — usada no funil', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    return { ok: true, stats }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

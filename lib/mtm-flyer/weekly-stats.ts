/**
 * Estatísticas semanais para o FLYER "Resultados da Semana".
 *
 * Uma única fonte de números para a imagem (/api/flyer/weekly) e para os crons que a distribuem
 * (Telegram + Instagram Stories + grupo de leads).
 *
 * ── 16/11/2026 (pedido do Ricardo): todas as estratégias em uso ─────────────────────────────────
 * Até aqui o flyer tinha quatro cartões fixos (Premium do canal Signal Master, MTM Scanner V3.4,
 * Sensei X e GoldKiller, lidos dos alertas do TradingView e do chat premium-ideas). Entretanto o
 * MTM Auto passou a correr Premium II, Trendshot, Aurum Flow, DEFY… e nenhuma delas aparecia; o
 * Premium antigo foi arquivado e continuava no cartão de cima.
 *
 * Agora o flyer mostra UM CARTÃO POR ESTRATÉGIA que esteve em uso na semana: não arquivada e com
 * trades fechadas na conta-mestre. Os números são os de `lib/mtmauto/semanas-estrategias.ts` — o
 * MESMO cálculo da regra das três semanas negativas, para o flyer e o arquivo nunca discordarem.
 * Pips pesados pelos parciais; índices e cripto em pontos, à parte e fora do total.
 *
 * As contas-mestre são do motor simulado da casa (é delas que os clientes copiam): o rodapé diz.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { medirSemanas, segundaDe } from '@/lib/mtmauto/semanas-estrategias'

export interface EstrategiaDaSemana {
  slug: string
  nome: string
  trades: number
  wins: number
  losses: number
  /** Pips (forex + metais). */
  pips: number
  /** Pontos (índices/cripto) — unidade diferente, nunca somada aos pips. */
  points: number
  bestPips: number
  bestSymbol: string | null
}

export interface WeeklyFlyerStats {
  /** Segunda-feira 00:00 UTC da semana reportada. */
  weekStart: string
  /** Sexta-feira (inclusive) — usado no rótulo do período. */
  weekEndLabel: string
  periodLabel: string
  /** O flyer sai SEMPRE em PT e EN (pedido Ricardo 2026-08-22) — rótulo EN pronto. */
  periodLabelEn: string
  /** As estratégias em uso na semana, da que mais pips fez para a que menos. */
  estrategias: EstrategiaDaSemana[]
  /** Soma de pips de todas as estratégias (sem os pontos). */
  totalPips: number
  /** Simulação a lote mínimo 0.01: ≈$0,10/pip (só forex/metais — os pontos não se convertem). */
  minLotUsd: number
}

/** Segunda-feira 00:00 UTC da semana que contém `ref` (num sábado/domingo, a semana que fechou). */
export function weekStartFor(ref: Date): Date {
  return segundaDe(ref)
}

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']
const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

function buildPeriodLabel(weekStart: Date, friday: Date, months: string[]): string {
  return weekStart.getUTCMonth() === friday.getUTCMonth()
    ? `${weekStart.getUTCDate()} – ${friday.getUTCDate()} ${months[friday.getUTCMonth()]} ${friday.getUTCFullYear()}`
    : `${weekStart.getUTCDate()} ${months[weekStart.getUTCMonth()]} – ${friday.getUTCDate()} ${months[friday.getUTCMonth()]} ${friday.getUTCFullYear()}`
}

/** Win rate 0-100 (sem BE no denominador); null sem trades decididas. */
export function winRatePct(wins: number, losses: number): number | null {
  return wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null
}

export async function getWeeklyFlyerStats(weekStartParam?: string | null): Promise<WeeklyFlyerStats> {
  const weekStart = weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
    ? segundaDe(new Date(`${weekStartParam}T00:00:00Z`))
    : weekStartFor(new Date())
  const friday = new Date(weekStart.getTime() + 4 * 86400_000)
  // Mede-se a semana pedida: o «agora» da medição é o fim dela (ou já, se ainda não acabou).
  const fimDaSemana = new Date(weekStart.getTime() + 7 * 86400_000 - 1)
  const agora = new Date(Math.min(Date.now(), fimDaSemana.getTime()))

  const retrato = await medirSemanas(getSupabaseAdmin(), agora, 1)
  const estrategias: EstrategiaDaSemana[] = retrato.estrategias
    .filter((e) => !e.arquivada)
    .map((e) => ({ e, w: e.semanas[e.semanas.length - 1]! }))
    .filter(({ w }) => w && w.trades > 0)
    .map(({ e, w }) => ({
      slug: e.slug,
      nome: e.nome,
      trades: w.trades,
      wins: w.ganhas,
      losses: w.perdas,
      pips: Math.round(w.pips),
      points: Math.round(w.pontos),
      bestPips: Math.round(w.melhorPips),
      bestSymbol: w.melhorSimbolo,
    }))
    .sort((a, b) => b.pips + b.points / 10 - (a.pips + a.points / 10))

  const totalPips = Math.round(estrategias.reduce((a, e) => a + e.pips, 0))
  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEndLabel: friday.toISOString().slice(0, 10),
    periodLabel: buildPeriodLabel(weekStart, friday, MESES),
    periodLabelEn: buildPeriodLabel(weekStart, friday, MONTHS_EN),
    estrategias,
    totalPips,
    minLotUsd: Math.round(0.1 * totalPips),
  }
}

/** Uma linha por estratégia para as legendas («Premium II +687 · Trendshot +2.584 …»). */
export function resumoEstrategias(stats: WeeklyFlyerStats, lang: FlyerLang = 'pt'): string {
  return stats.estrategias
    .map((e) => `${e.nome} ${e.pips !== 0 || e.points === 0 ? fmtSignedNum(e.pips, lang) : `${fmtSignedNum(e.points, lang)} pts`}`)
    .join(' · ')
}

export type FlyerLang = 'pt' | 'en'

/** 23900 → "23.900" (PT) / "23,900" (EN). */
export function fmtNum(n: number, lang: FlyerLang = 'pt'): string {
  const sign = n < 0 ? '-' : ''
  const sep = lang === 'en' ? ',' : '.'
  return sign + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

/** Pips com sinal: "+23.900" / "-120". */
export function fmtSignedNum(n: number, lang: FlyerLang = 'pt'): string {
  return (n >= 0 ? '+' : '') + fmtNum(n, lang)
}

/** Compat (PT) — usados pelo cron nas legendas Telegram. */
export const fmtPt = (n: number) => fmtNum(n, 'pt')
export const fmtSigned = (n: number) => fmtSignedNum(n, 'pt')

/**
 * Estatísticas semanais dos sinais para o FLYER "Resultados da Semana".
 *
 * Uma única fonte de números para a imagem (/api/flyer/weekly) e para o cron
 * que a distribui (Telegram + Instagram Stories). Replica a lógica canónica de
 * desfecho do /api/mtm-alerts (outcomeInfo): exit_N → preço do TP N · loss → SL ·
 * be → entrada · closed → último TP, com pip por classe (0.0001 forex · 0.01 JPY ·
 * 0.1 XAU · pontos em índices/cripto) e limite de sanidade |12%| por trade —
 * sem ele, um ticker mal classificado (ex.: BTC com pip forex) rebenta a soma.
 *
 * O Premium NÃO vem do TradingView: vem do canal GOLD DID (relay → chat
 * premium-ideas). Preferimos os resumos diários do próprio canal ("Total Net :
 * N PIPS WIN"); nos dias sem resumo (ex.: relay caiu antes do fecho) somamos os
 * marcos finais "HIT TP3 ✅ +N PIPS" e penalizamos cada "HIT SL" com −50 pips
 * (a zona típica dos setups é ~50 pips) — estimativa conservadora, sem runners.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export interface ScannerStat {
  signals: number
  wins: number
  losses: number
  /** Pips (forex + ouro). */
  pips: number
  /** Pontos (índices/cripto), separados porque a unidade é outra. */
  points: number
  bestPips: number
  bestSymbol: string | null
}

export interface PremiumStat {
  trades: number
  wins: number
  losses: number
  netPips: number
  bestPips: number
  /** Quantos dias da semana ficaram cobertos por resumo oficial do canal. */
  summaryDays: number
}

export interface WeeklyFlyerStats {
  /** Segunda-feira 00:00 UTC da semana reportada. */
  weekStart: string
  /** Sexta-feira (inclusive) — usado no rótulo do período. */
  weekEndLabel: string
  periodLabel: string
  /** O flyer sai SEMPRE em PT e EN (pedido Ricardo 2026-08-22) — rótulo EN pronto. */
  periodLabelEn: string
  premium: PremiumStat
  scanner: ScannerStat
  sensei: ScannerStat
  goldkiller: ScannerStat
  /** Soma de pips de todas as fontes (sem os pontos de índices). */
  totalPips: number
  /** Simulação a lote mínimo: ≈$0,10/pip (0.01) e ≈$0,10/ponto (0.1 índices). */
  minLotUsd: number
}

const TERMINAL = new Set(['exit_1', 'exit_2', 'exit_3', 'exit_4', 'loss', 'be', 'closed'])
const FX = new Set(['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD'])

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^[0-9]+\.?[0-9]*$/.test(v.trim())) return Number(v)
  return null
}

function pipInfo(ticker: string): { pip: number; isPoints: boolean } {
  const tk = ticker.toUpperCase()
  if (tk.includes('JPY')) return { pip: 0.01, isPoints: false }
  if (tk.startsWith('XAU')) return { pip: 0.1, isPoints: false }
  const letters = tk.replace(/[^A-Z]/g, '')
  if (letters.length === 6 && FX.has(letters.slice(0, 3)) && FX.has(letters.slice(3, 6))) {
    return { pip: 0.0001, isPoints: false }
  }
  return { pip: 1, isPoints: true }
}

function emptyScanner(): ScannerStat {
  return { signals: 0, wins: 0, losses: 0, pips: 0, points: 0, bestPips: 0, bestSymbol: null }
}

/** Segunda-feira 00:00 UTC da semana que contém `ref` (num sábado/domingo, a semana que fechou). */
export function weekStartFor(ref: Date): Date {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()))
  const dow = d.getUTCDay() // 0=Dom
  const back = dow === 0 ? 6 : dow - 1
  d.setUTCDate(d.getUTCDate() - back)
  return d
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
  const supabase = getSupabaseAdmin()

  const weekStart = weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
    ? new Date(`${weekStartParam}T00:00:00Z`)
    : weekStartFor(new Date())
  const weekEnd = new Date(weekStart.getTime() + 5 * 86400_000) // sábado 00:00 (Seg–Sex)
  const friday = new Date(weekStart.getTime() + 4 * 86400_000)

  const periodLabel = buildPeriodLabel(weekStart, friday, MESES)
  const periodLabelEn = buildPeriodLabel(weekStart, friday, MONTHS_EN)

  // ── Scanners (TradingView) ────────────────────────────────────────────────
  const { data: rows } = await supabase
    .from('tradingview_signals')
    .select('ticker, alert_name, action, trade_status, price, sl, tp, raw_payload')
    .gte('received_at', weekStart.toISOString())
    .lt('received_at', weekEnd.toISOString())
    .eq('signal_kind', 'entry')
    .in('trade_status', [...TERMINAL])

  const scanner = emptyScanner()
  const sensei = emptyScanner()
  const goldkiller = emptyScanner()

  for (const row of rows ?? []) {
    const act = String(row.action ?? '').toLowerCase()
    if (act !== 'buy' && act !== 'sell') continue
    const name = String(row.alert_name ?? '').toLowerCase()
    const bucket = name.includes('sensei')
      ? sensei
      : /gold\s*killer|goldkiller/.test(name)
        ? goldkiller
        : name.includes('scanner')
          ? scanner
          : null
    if (!bucket) continue // Aurum/Perps e desconhecidos ficam fora do flyer

    const raw = (row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {}) as Record<string, unknown>
    const entry = num(row.price) ?? num(raw.entry)
    const sl = num(row.sl) ?? num(raw.sl)
    const tps = [num(raw.tp1) ?? num(row.tp), num(raw.tp2), num(raw.tp3), num(raw.tp4)]
    const st = String(row.trade_status)
    let exit: number | null = null
    const m = st.match(/^exit_(\d)$/)
    if (m) exit = tps[Number(m[1]) - 1] ?? tps.filter((t) => t != null).pop() ?? null
    else if (st === 'loss') exit = sl
    else if (st === 'be') exit = entry
    else if (st === 'closed') exit = tps.filter((t) => t != null).pop() ?? null
    if (entry == null || entry <= 0 || exit == null || exit <= 0) continue

    const move = act === 'buy' ? exit - entry : entry - exit
    const pct = (move / entry) * 100
    if (Math.abs(pct) > 12) continue // sanidade — ver cabeçalho

    const ticker = String(row.ticker ?? '')
    const { pip, isPoints } = pipInfo(ticker)
    const pips = move / pip
    bucket.signals++
    if (move > 0) bucket.wins++
    else if (move < 0) bucket.losses++
    if (isPoints) bucket.points += pips
    else bucket.pips += pips
    if (!isPoints && pips > bucket.bestPips) {
      bucket.bestPips = pips
      bucket.bestSymbol = ticker
    }
  }

  // ── Premium (GOLD DID → chat premium-ideas) ───────────────────────────────
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('content, created_at')
    .eq('channel_slug', 'premium-ideas')
    .gte('created_at', weekStart.toISOString())
    .lt('created_at', new Date(weekEnd.getTime() + 86400_000).toISOString()) // resumo de sexta pode sair sábado
    .order('created_at', { ascending: true })

  const premium: PremiumStat = { trades: 0, wins: 0, losses: 0, netPips: 0, bestPips: 0, summaryDays: 0 }
  const summarizedDays = new Set<string>()

  for (const msg of msgs ?? []) {
    const c = String(msg.content ?? '')
    const netMatch = c.match(/Total\s+Net\s*:\s*(\d+)\s*PIPS\s*(WIN|LOSS)?/i)
    if (!netMatch) continue
    // O resumo refere o dia das trades — a data no corpo ("19 August 2026"); senão, o dia da msg.
    const dayMatch = c.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|\w+)\s+(\d{4})/i)
    const dayKey = dayMatch ? dayMatch[0] : String(msg.created_at).slice(0, 10)
    if (summarizedDays.has(dayKey)) continue
    summarizedDays.add(dayKey)
    premium.summaryDays++
    const net = Number(netMatch[1]) * (/LOSS/i.test(netMatch[2] ?? '') ? -1 : 1)
    premium.netPips += net
    for (const line of c.split('\n')) {
      if (/^\s*\d+\s*-/.test(line)) {
        premium.trades++
        const won = line.match(/(\d+)\s*PIPS/i)
        if (won) {
          premium.wins++
          premium.bestPips = Math.max(premium.bestPips, Number(won[1]))
        } else if (/HIT\s*SL/i.test(line)) {
          premium.losses++
        }
      }
    }
  }

  // Dias SEM resumo: marcos finais TP3 + penalização de SL (~zona de 50 pips).
  if (premium.summaryDays < 5) {
    for (const msg of msgs ?? []) {
      const c = String(msg.content ?? '')
      const day = String(msg.created_at).slice(0, 10)
      const dayCovered = [...summarizedDays].some((k) => k.includes(day.slice(8, 10)) || k === day)
      if (dayCovered) continue
      const tp3 = c.match(/HIT\s*TP3\s*✅?\s*\+(\d+)\s*PIPS/i)
      if (tp3) {
        const v = Number(tp3[1])
        premium.trades++
        premium.wins++
        premium.netPips += v
        premium.bestPips = Math.max(premium.bestPips, v)
      } else if (/^HIT\s*SL\s*$/i.test(c.trim())) {
        premium.trades++
        premium.losses++
        premium.netPips -= 50
      }
    }
  }

  const totalPips = Math.round(premium.netPips + scanner.pips + sensei.pips + goldkiller.pips)
  const minLotUsd = Math.round(0.1 * totalPips + 0.1 * (scanner.points + sensei.points + goldkiller.points))

  const r = (s: ScannerStat): ScannerStat => ({
    ...s,
    pips: Math.round(s.pips),
    points: Math.round(s.points),
    bestPips: Math.round(s.bestPips),
  })

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEndLabel: friday.toISOString().slice(0, 10),
    periodLabel,
    periodLabelEn,
    premium: { ...premium, netPips: Math.round(premium.netPips) },
    scanner: r(scanner),
    sensei: r(sensei),
    goldkiller: r(goldkiller),
    totalPips,
    minLotUsd,
  }
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

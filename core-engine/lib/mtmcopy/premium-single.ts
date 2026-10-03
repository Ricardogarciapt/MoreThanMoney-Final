/**
 * Premium — subscritores directos (método 1) e conta provider (método 2):
 * 1 posição por sinal + parciais em HIT TP1/2/3 (Telegram).
 */

import { normalizeExitPcts } from './copy-methods'
import { listOpenPositions, type MetaApiPosition } from './metaapi'
import { matchesPremiumLegComment } from './premium-exits'
import type { ParsedSignal } from './signal-parser'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Guard ATÓMICO anti-duplicação (à prova de corrida): a 1.ª chegada de um sinal "reclama" a chave;
 * chegadas concorrentes do mesmo sinal (fonte repete, forwarder externo, relay 2x) falham o INSERT
 * e são rejeitadas. TTL curto permite um sinal genuinamente novo mais tarde. Serializa via unique PK.
 */
export async function claimSignalOnce(key: string, ttlSec = 900): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    // Limpa reclamações expiradas desta chave (permite novo sinal após o TTL).
    await supabase
      .from('mtmcopy_signal_dedup')
      .delete()
      .eq('key', key)
      .lt('created_at', new Date(Date.now() - ttlSec * 1000).toISOString())
    const { data, error } = await supabase
      .from('mtmcopy_signal_dedup')
      .insert({ key })
      .select('key')
    if (error) {
      // 23505 = unique_violation → já reclamado por uma chegada anterior (duplicado).
      if ((error as { code?: string }).code === '23505') return false
      // Em erro inesperado, NÃO bloqueia a execução (fail-open) para não perder sinais legítimos.
      console.error('[dedup] claimSignalOnce erro (fail-open):', error.message)
      return true
    }
    return Boolean(data && data.length)
  } catch (e) {
    console.error('[dedup] claimSignalOnce exceção (fail-open):', e instanceof Error ? e.message : e)
    return true
  }
}

/**
 * Devolve a chave ao pote.
 *
 * Existe por causa de um caso que custou trades: uma chegada que NÃO abre nada (fica só pendente
 * à espera de reação na zona) ficava com a chave reclamada, e a chegada seguinte — a que abria
 * mesmo — era recusada como "duplicado". Quem não abriu não deve segurar a chave.
 */
export async function releaseSignalClaim(key: string): Promise<void> {
  try {
    await getSupabaseAdmin().from('mtmcopy_signal_dedup').delete().eq('key', key)
  } catch (e) {
    console.error('[dedup] releaseSignalClaim:', e instanceof Error ? e.message : e)
  }
}

export const PREMIUM_SINGLE_TAG = 'PREM'
export const SMALL_CAPITAL_THRESHOLD = 1000

export interface PremiumExitPcts {
  tp1: number
  tp2: number
  tp3: number
}

export interface PremiumSingleOrderPlan {
  lot: number
  comment: string
  exitPcts: PremiumExitPcts
  smallAccount: boolean
  /** TP na ordem = rede de segurança (último TP do sinal); o monitor gere parciais/BE por cima. null se o sinal não trouxer TP. */
  takeProfit: number | null
}

export interface ParsedPremiumSingleMeta {
  originalLot: number
  exitPcts: PremiumExitPcts
  smallAccount: boolean
  exitsDone: number
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

export function isSmallCapitalAccount(equityOrBalance: number | null | undefined): boolean {
  if (equityOrBalance == null || !Number.isFinite(equityOrBalance)) return false
  return equityOrBalance < SMALL_CAPITAL_THRESHOLD
}

/** Volume mínimo para fechar parcial (2× mínimo broker). */
export function canPartializeVolume(volume: number, pct: number): boolean {
  const partial = roundLot(volume * (pct / 100))
  return partial >= 0.01 && partial < volume
}

/** Nome curto/legível da estratégia no comentário da ordem (limite MT5 = 31 chars). */
export function shortStrategyTag(name?: string | null): string {
  const n = (name ?? '').trim()
  if (!n) return 'Premium'
  // usa o nome tal como é se couber; remove acentos/carateres exóticos
  return n.replace(/[^A-Za-z0-9 .]/g, '').slice(0, 16).trim() || 'Premium'
}

export function buildPremiumSingleOrderComment(
  originalLot: number,
  exitPcts: PremiumExitPcts,
  opts?: { smallAccount?: boolean; exitsDone?: number; manual?: boolean; strategyTag?: string },
): string {
  // Comentário LEGÍVEL: «<Estratégia>-<lote>-<saída parcial tp1/tp2/tp3>». MT5 = 31 chars.
  // Ex.: "Premium-0.01-75/15/10" · "Gold Did-0.01-75/15/10". O prefixo é o NOME da estratégia.
  const tag = shortStrategyTag(opts?.strategyTag)
  const sa = opts?.smallAccount ? '-sa' : ''
  const ex = opts?.exitsDone != null && opts.exitsDone > 0 ? `-ex${opts.exitsDone}` : ''
  const core = `${tag}-${roundLot(originalLot)}-${exitPcts.tp1}/${exitPcts.tp2}/${exitPcts.tp3}${sa}${ex}`
  if (opts?.manual) return `M ${core}`.slice(0, 31)
  return core.slice(0, 31)
}

export function parsePremiumSingleComment(comment: string | undefined): ParsedPremiumSingleMeta | null {
  const c = comment ?? ''

  // Formato legível: "<Estratégia>-<lote>-<tp1>/<tp2>/<tp3>[-sa][-exN]" (inclui o antigo "PREM-…").
  // O prefixo é o NOME da estratégia (Premium, Gold Did, …). Grupo 1 = nome; 2 = lote; 3-5 = saída.
  const newMatch = c.match(/^([A-Za-z][A-Za-z0-9 .]*?)-([\d.]+)-(\d+)\/(\d+)\/(\d+)(?:-sa)?(?:-ex(\d+))?/i)
  if (newMatch) {
    return {
      originalLot: parseFloat(newMatch[2]),
      exitPcts: {
        tp1: Number(newMatch[3]),
        tp2: Number(newMatch[4]),
        tp3: Number(newMatch[5]),
      },
      smallAccount: /-sa/i.test(c),
      exitsDone: newMatch[6] ? Number(newMatch[6]) : 0,
    }
  }

  // Legacy format: "mtmcopier-PREM · o2.00 · p33/33/34"
  if (!c.toLowerCase().includes(`mtmcopier-${PREMIUM_SINGLE_TAG.toLowerCase()}`)) return null

  const origMatch = c.match(/·\s*o([\d.]+)/i)
  const pctMatch = c.match(/·\s*p(\d+)\/(\d+)\/(\d+)/i)
  const exMatch = c.match(/·\s*ex(\d)/i)

  if (!origMatch || !pctMatch) return null

  return {
    originalLot: parseFloat(origMatch[1]),
    exitPcts: {
      tp1: Number(pctMatch[1]),
      tp2: Number(pctMatch[2]),
      tp3: Number(pctMatch[3]),
    },
    smallAccount: /·\s*sa1/i.test(c),
    exitsDone: exMatch ? Number(exMatch[1]) : 0,
  }
}

export function isPremiumSinglePosition(comment: string | undefined): boolean {
  return parsePremiumSingleComment(comment) != null
}

/** Plano: uma ordem market/limit com lote total — exits via gestão Telegram. */
export function buildPremiumSingleOrder(
  signal: ParsedSignal,
  totalLot: number,
  exitPcts?: { tp1?: number | null; tp2?: number | null; tp3?: number | null },
  equityOrBalance?: number | null,
  opts?: { manual?: boolean; strategyTag?: string },
): PremiumSingleOrderPlan | null {
  const tps = (signal.tp ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 3)
  if (!tps.length) return null

  const pcts = normalizeExitPcts(exitPcts?.tp1, exitPcts?.tp2, exitPcts?.tp3)
  const exit: PremiumExitPcts = { tp1: pcts.tp1, tp2: pcts.tp2, tp3: pcts.tp3 }
  const lot = roundLot(totalLot)
  const smallAccount = isSmallCapitalAccount(equityOrBalance)

  return {
    lot,
    comment: buildPremiumSingleOrderComment(lot, exit, { smallAccount, manual: opts?.manual, strategyTag: opts?.strategyTag }),
    exitPcts: exit,
    smallAccount,
    // TP SEMPRE na ordem = rede de segurança (se o monitor VPS falhar, o broker fecha no alvo final).
    // O monitor de preço vai gerindo TP/BE/parciais em tempo real por cima disto (pedido Ricardo).
    // Alvo = ÚLTIMO TP do sinal (não fecha cedo; os parciais anteriores são tirados pelo monitor).
    takeProfit: tps[tps.length - 1] ?? null,
  }
}

function symbolMatches(posSymbol: string, signalSymbol: string): boolean {
  const a = posSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const b = signalSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return a === b || a.includes(b) || b.includes(a)
}

export function isMtmcopierPosition(pos: MetaApiPosition): boolean {
  const c = (pos.comment ?? '').toLowerCase()
  // legado + novo formato legível (<Estratégia>-<lote>-<saída>) via o próprio parser
  return c.includes('mtmcopier') || c.startsWith('prem-') || c.startsWith('mtm-m-') ||
    parsePremiumSingleComment(pos.comment) != null
}

function directionMatches(pos: MetaApiPosition, direction: string): boolean {
  const isBuy = /buy|long/i.test(pos.type)
  const wantBuy = direction === 'buy'
  return isBuy === wantBuy
}

/** Posição Premium single activa no símbolo (mais recente). */
export function findPremiumSinglePosition(
  positions: MetaApiPosition[],
  symbol: string,
  /**
   * Entrada do sinal a que o follow-up pertence (zona ou preço). Sem isto escolhia-se a ÚLTIMA
   * posição do símbolo — e com dois setups de ouro abertos ao mesmo tempo, o "HIT TP1" de um
   * geria a posição do outro. Com a entrada, liga-se o follow-up à posição certa.
   */
  entryHint?: { entry?: number | null; zoneLow?: number | null; zoneHigh?: number | null } | null,
): MetaApiPosition | null {
  const matches = positions.filter(
    (p) =>
      isMtmcopierPosition(p) &&
      isPremiumSinglePosition(p.comment) &&
      symbolMatches(p.symbol, symbol),
  )
  if (!matches.length) return null
  if (matches.length === 1) return matches[0]!

  // Alvo de comparação: o preço de entrada do sinal, ou o meio da zona quando é uma zona.
  const alvo = (() => {
    if (entryHint?.entry != null && entryHint.entry > 0) return entryHint.entry
    const lo = entryHint?.zoneLow
    const hi = entryHint?.zoneHigh
    if (lo != null && hi != null && lo > 0 && hi > 0) return (lo + hi) / 2
    return null
  })()
  if (alvo == null) return matches[matches.length - 1]!

  // A posição cuja abertura está mais perto da entrada do sinal é a que este follow-up refere.
  let melhor = matches[0]!
  let menor = Math.abs((melhor.openPrice ?? 0) - alvo)
  for (const p of matches.slice(1)) {
    const d = Math.abs((p.openPrice ?? 0) - alvo)
    if (d < menor) { melhor = p; menor = d }
  }
  return melhor
}

/** Legacy: pernas TP2/TP3 ainda abertas — preferir gestão em vez de nova entrada. */
export function hasOpenPremiumRunnerLegs(
  positions: MetaApiPosition[],
  symbol: string,
  direction?: string,
): boolean {
  const filtered = positions.filter(
    (p) =>
      isMtmcopierPosition(p) &&
      symbolMatches(p.symbol, symbol) &&
      (!direction || directionMatches(p, direction)),
  )

  if (findPremiumSinglePosition(filtered, symbol)) return true

  return filtered.some(
    (p) =>
      matchesPremiumLegComment(p.comment, 2) || matchesPremiumLegComment(p.comment, 3),
  )
}

/** Posição já em BREAKEVEN (sem risco)? BUY: SL ≥ entrada; SELL: SL ≤ entrada. Sem SL = tem risco. */
export function isPositionAtBreakeven(pos: MetaApiPosition): boolean {
  const sl = pos.stopLoss
  const entry = pos.openPrice
  if (sl == null || !(sl > 0) || !(entry != null && entry > 0)) return false
  const isBuy = /buy|long/i.test(pos.type)
  const eps = entry * 0.0002 // pequena folga p/ arredondamentos do broker
  return isBuy ? sl >= entry - eps : sl <= entry + eps
}

/**
 * Exposição Premium: NÃO abrir nova entrada enquanto houver posição com RISCO VIVO no par
 * (SL ainda não movido para BE). Assim que o runner vai a BE (após TP1), empilhar é SEGURO
 * (o anterior não pode perder) → deixa entrar o sinal seguinte da sessão (modelo close+reentra
 * do canal Premium). Regra pedida pelo Ricardo 2026-08-07.
 */
export async function shouldSkipDuplicatePremiumEntry(
  accountId: string,
  symbol: string,
  direction: string,
): Promise<{ skip: boolean; reason?: string }> {
  const positions = await listOpenPositions(accountId)
  const mtm = positions.filter(isMtmcopierPosition)
  const openHere = mtm.filter((p) => symbolMatches(p.symbol, symbol))
  const risky = openHere.filter((p) => !isPositionAtBreakeven(p))

  if (risky.length > 0) {
    return {
      skip: true,
      reason:
        'Exposição Premium com RISCO VIVO (SL ainda não em BE) — preferir gestão da trade existente',
    }
  }

  // Não abrir nova enquanto a ANTERIOR ainda não tirou parcial (volume ≈ original) — mesmo já em BE.
  // Pedido Ricardo: só entra a próxima quando a anterior já bancou o 1.º parcial (ou fechou de todo).
  const noPartialYet = openHere.filter((p) => {
    const meta = parsePremiumSingleComment(p.comment)
    const orig = meta?.originalLot
    return orig && orig > 0 && p.volume != null ? p.volume >= orig * 0.98 : true
  })
  if (noPartialYet.length > 0) {
    return { skip: true, reason: 'Posição Premium anterior ainda SEM parcial tirado — gerir essa primeiro' }
  }

  // Sem posição, ou já em BE E com parcial tirado → a nova entrada da sessão pode abrir.
  return { skip: false }
}

/** Lote efectivo para parcial: % do volume original (fallback volume actual). */
export function partialVolumeForExit(
  pos: MetaApiPosition,
  exitLevel: 1 | 2 | 3,
  meta: ParsedPremiumSingleMeta | null,
): number {
  const current = pos.volume ?? 0
  if (current <= 0) return 0

  const pcts = meta?.exitPcts ?? { tp1: 75, tp2: 15, tp3: 10 }
  const pct = exitLevel === 1 ? pcts.tp1 : exitLevel === 2 ? pcts.tp2 : pcts.tp3
  const base = meta?.originalLot && meta.originalLot > 0 ? meta.originalLot : current
  let vol = roundLot(base * (pct / 100))

  if (exitLevel === 3) {
    vol = roundLot(current)
  } else if (vol >= current) {
    vol = roundLot(Math.max(0.01, current * (pct / 100)))
  }

  if (vol >= current) vol = roundLot(Math.max(0.01, current - 0.01))
  return vol >= 0.01 ? vol : 0
}

/** Reduz lote em contas com capital < 1000 (protecção margem). */
export function scaleLotForSmallCapital(totalLot: number, equityOrBalance: number | null): number {
  if (!isSmallCapitalAccount(equityOrBalance)) return totalLot
  const scale =
    equityOrBalance! < 300 ? 0.35 : equityOrBalance! < 600 ? 0.5 : 0.65
  return roundLot(Math.max(0.01, totalLot * scale))
}

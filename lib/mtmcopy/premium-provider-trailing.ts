/**
 * Trailing dinâmico para contas provider MTM Auto (método 2) — 3 pernas com TP no broker.
 * Subscritores via grupos Telegram (método 1) usam premium-single.ts (parciais por mensagem).
 */

import { resolveEntryForRisk } from './lot-sizing'
import {
  buildPremiumExitLegs,
  type PremiumExitLeg,
} from './premium-exits'
import {
  premiumTrailingWithActivation,
  type TrailingDistance,
} from './pip-points'
import {
  PREMIUM_INTELIGENT_RISK_MAX_PIPS,
  PREMIUM_STANDARD_RISK_PIPS,
} from './premium-trade-active'
import type { ParsedSignal } from './signal-parser'

const AI_TRAILING_TIMEOUT_MS = Number(process.env.MTMCOPY_AI_TRAILING_TIMEOUT_MS ?? '900')

function isGoldSymbol(symbol: string | null | undefined): boolean {
  return /XAU|GOLD/i.test(symbol ?? '')
}

/** Estima pips de risco (entrada → SL) para calibrar trailing. */
export function estimateRiskPipsFromSignal(
  signal: ParsedSignal,
  marketPrice?: number | null,
): number | null {
  const entry = resolveEntryForRisk(signal, marketPrice)
  if (entry == null || entry <= 0 || signal.sl == null || signal.sl <= 0) return null
  const dist = Math.abs(entry - signal.sl)
  if (dist <= 0) return null
  const pipSize = isGoldSymbol(signal.symbol) ? 0.1 : 0.0001
  return Math.max(1, Math.round(dist / pipSize))
}

function rewardPipsToTp(
  signal: ParsedSignal,
  marketPrice: number | null,
  tpIndex: number,
): number | null {
  const entry = resolveEntryForRisk(signal, marketPrice)
  const tp = signal.tp[tpIndex]
  if (entry == null || tp == null || tp <= 0) return null
  const dist = Math.abs(tp - entry)
  const pipSize = isGoldSymbol(signal.symbol) ? 0.1 : 0.0001
  return Math.max(1, Math.round(dist / pipSize))
}

/**
 * Trailing por perna na abertura (provider):
 * - TP1: threshold antes do TP — protege lucro parcial em movimento favorável
 * - TP2: null à abertura — BE + trail activam no HIT TP1 (position-management)
 * - TP3: runner com activação larga
 */
export function computeProviderLegTrailing(
  legIndex: 1 | 2 | 3,
  signal: ParsedSignal,
  marketPrice: number | null,
  riskPips: number | null,
): TrailingDistance | null {
  if (legIndex === 2) return null

  if (legIndex === 1) {
    const rewardPips = rewardPipsToTp(signal, marketPrice, 0)
    const activationPips = rewardPips
      ? Math.max(12, Math.min(50, Math.round(rewardPips * 0.35)))
      : 25
    const trailPips =
      riskPips != null && riskPips <= PREMIUM_INTELIGENT_RISK_MAX_PIPS
        ? 20
        : riskPips != null && riskPips >= PREMIUM_STANDARD_RISK_PIPS
          ? 45
          : 30
    return { mode: 'threshold_pips', activationPips, trailPips }
  }

  if (riskPips != null && riskPips <= PREMIUM_INTELIGENT_RISK_MAX_PIPS) {
    return { mode: 'threshold_pips', activationPips: 30, trailPips: 35 }
  }
  return premiumTrailingWithActivation()
}

export function applyTrailingToPremiumLeg(
  leg: PremiumExitLeg,
  signal: ParsedSignal,
  marketPrice: number | null,
  riskPips: number | null,
): PremiumExitLeg {
  const idx = leg.legIndex as 1 | 2 | 3
  return {
    ...leg,
    trailing: computeProviderLegTrailing(idx, signal, marketPrice, riskPips),
  }
}

type AiTrailingLeg = {
  legIndex?: number
  activationPips?: number
  trailPips?: number
  mode?: 'none' | 'threshold'
}

type AiTrailingJson = {
  legs?: AiTrailingLeg[]
  reason?: string
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function callAiTrailingAdvisor(
  legs: PremiumExitLeg[],
  signal: ParsedSignal,
  marketPrice: number | null,
  riskPips: number | null,
  strategyPrompt?: string | null,
): Promise<AiTrailingJson | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key || process.env.MTMCOPY_AI_TRAILING === 'false') return null

  const model =
    process.env.MTMCOPY_AI_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    'claude-3-5-haiku-20241022'

  const entry = resolveEntryForRisk(signal, marketPrice)
  const system = `És um gestor de risco MTM para XAUUSD (Premium provider — 3 pernas com TP no broker).
Responde APENAS JSON: {"legs":[{"legIndex":1,"activationPips":num,"trailPips":num,"mode":"threshold"|"none"},...],"reason":"..."}
Regras:
- legIndex 1 (TP1): threshold_pips apertado — activação ~30-40% do caminho até TP1, trail 15-40 pips
- legIndex 2: mode "none" à abertura (BE+trail no HIT TP1)
- legIndex 3: trail largo — activação 40-60 pips, distância 45-60 pips (runner)
- Ouro: 1 pip = $0.10
${strategyPrompt?.trim() ? `\nEstratégia:\n${strategyPrompt.trim()}` : ''}`

  const user = `Sinal: ${signal.direction} ${signal.symbol}
Entry ref: ${entry ?? 'market'}
SL: ${signal.sl}
TPs: ${signal.tp.slice(0, 3).join(', ')}
Market: ${marketPrice ?? 'n/d'}
Risk pips (SL): ${riskPips ?? 'n/d'}
Pernas planeadas: ${legs.map((l) => `TP${l.legIndex} lot=${l.lot} tp=${l.tpPrice}`).join('; ')}`

  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    },
    AI_TRAILING_TIMEOUT_MS,
  )

  if (!res?.ok) return null
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim()
  if (!text) return null
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as AiTrailingJson
  } catch {
    return null
  }
}

function mergeAiTrailing(legs: PremiumExitLeg[], ai: AiTrailingJson): PremiumExitLeg[] {
  const byIndex = new Map<number, AiTrailingLeg>()
  for (const row of ai.legs ?? []) {
    if (row.legIndex != null) byIndex.set(row.legIndex, row)
  }

  return legs.map((leg) => {
    const hint = byIndex.get(leg.legIndex)
    if (!hint || hint.mode === 'none') {
      if (leg.legIndex === 2) return { ...leg, trailing: null }
      return leg
    }
    const activationPips = Number(hint.activationPips)
    const trailPips = Number(hint.trailPips)
    if (
      !Number.isFinite(activationPips) ||
      activationPips <= 0 ||
      !Number.isFinite(trailPips) ||
      trailPips <= 0
    ) {
      return leg
    }
    return {
      ...leg,
      trailing: {
        mode: 'threshold_pips',
        activationPips: Math.max(10, Math.min(80, Math.round(activationPips))),
        trailPips: Math.max(10, Math.min(80, Math.round(trailPips))),
      },
    }
  })
}

/** Enriquece pernas com trailing IA (fallback silencioso para regras estáticas). */
export async function enrichProviderLegsWithAiTrailing(
  legs: PremiumExitLeg[],
  signal: ParsedSignal,
  marketPrice: number | null,
  strategyPrompt?: string | null,
): Promise<PremiumExitLeg[]> {
  if (!legs.length) return legs
  const riskPips = estimateRiskPipsFromSignal(signal, marketPrice)
  const ai = await callAiTrailingAdvisor(legs, signal, marketPrice, riskPips, strategyPrompt)
  if (!ai?.legs?.length) return legs
  return mergeAiTrailing(legs, ai)
}

/**
 * 3 pernas com TP no broker — contas provider MTM Auto (método 2 / CopyFactory).
 * Subscritores via grupos Telegram (método 1) usam buildPremiumSingleOrder.
 */
export function buildProviderPremiumExitLegs(
  signal: ParsedSignal,
  totalLot: number,
  exitPcts?: { tp1?: number | null; tp2?: number | null; tp3?: number | null },
  marketPrice?: number | null,
): PremiumExitLeg[] {
  const base = buildPremiumExitLegs(signal, totalLot, exitPcts)
  if (!base.length) return []
  const riskPips = estimateRiskPipsFromSignal(signal, marketPrice)
  return base.map((leg) =>
    applyTrailingToPremiumLeg(leg, signal, marketPrice ?? null, riskPips),
  )
}

/** Comment MT5 para perna provider (≤31 chars, reconhecido por position-management). */
export function premiumLegMtComment(leg: PremiumExitLeg): string {
  const pctMatch = leg.label.match(/(\d+)%/)
  const pct = pctMatch?.[1] ?? String(Math.round(leg.lotFraction * 100))
  return `mtmcopier-TP${leg.legIndex} · ${pct}%`
}

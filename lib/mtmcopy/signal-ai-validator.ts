import type { ParsedSignal } from './signal-parser'
import type { MtmcopyChannelKey } from './channel-context'
import { resolvePremiumAiStrategyPrompt } from './premium-ai-guideline'

export const MTMCOPY_AI_MIN_CONFIDENCE = Number(
  process.env.MTMCOPY_AI_MIN_CONFIDENCE ?? '0.35',
)

const AI_TIMEOUT_MS = Number(process.env.MTMCOPY_AI_TIMEOUT_MS ?? '1200')
const AI_ENABLED = process.env.MTMCOPY_AI_VALIDATION !== 'false'
const AI_FAST_PATH = process.env.MTMCOPY_AI_FAST_PATH !== 'false'

export interface ValidateSignalOptions {
  /** Quando true, só heurística local (perfil admin desactivou IA). */
  skipAi?: boolean
  minConfidence?: number
  /** Formato oficial MTM — nunca chamar IA (execução imediata). */
  forceFastPath?: boolean
  channel?: MtmcopyChannelKey
  /** Prompt de estratégia do provider (Premium Gold). */
  strategyPrompt?: string | null
}

/** Formatos oficiais MTM — parser fiável, não bloquear em IA (~1–2s). */
export function isOfficialMtmTelegramFormat(raw: string): boolean {
  if (/\bmoeda\s*:/i.test(raw) && /\ba[cç][aã]o\s*:/i.test(raw)) return true
  if (/\b(?:xauusd|gold)\s+(?:buy|sell)\b/i.test(raw)) return true
  if (/\b(?:buy|sell)\s+now\b/i.test(raw) && /\b(?:gold|xauusd)\b/i.test(raw)) return true
  if (/\bgold\s+(?:buy|sell)\s+zone\b/i.test(raw) && /\bsl\s*:/i.test(raw)) return true
  return false
}

function shouldSkipAiCall(
  raw: string,
  local: AiSignalValidation,
  minConfidence: number,
  skipAi?: boolean,
  forceFastPath?: boolean,
): boolean {
  if (forceFastPath && local.valid && local.localConfidence >= minConfidence) return true
  if (skipAi || !AI_ENABLED) return true
  if (!AI_FAST_PATH) return false
  if (local.localConfidence >= 0.92 && local.valid) return true
  if (isOfficialMtmTelegramFormat(raw) && local.localConfidence >= minConfidence && local.valid) {
    return true
  }
  return false
}

export interface AiSignalValidation {
  valid: boolean
  confidence: number
  symbol: string | null
  direction: 'buy' | 'sell' | null
  entry: number | null
  sl: number | null
  tp: number[]
  orderType: 'market' | 'limit'
  issues: string[]
  reasoning: string
  source: 'local' | 'ai' | 'hybrid'
  localConfidence: number
  aiConfidence: number | null
  latencyMs: number
}

type AiJson = {
  confidence?: number
  valid?: boolean
  symbol?: string | null
  direction?: string | null
  entry?: number | null
  sl?: number | null
  tp?: number[] | number | null
  order_type?: string | null
  issues?: string[]
  reason?: string
}

const aiCache = new Map<string, { at: number; result: AiSignalValidation }>()
const AI_CACHE_MS = 60_000

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function parseNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normalizeDirection(v: unknown): 'buy' | 'sell' | null {
  if (typeof v !== 'string') return null
  const t = v.toLowerCase()
  if (t.includes('buy') || t.includes('long') || t.includes('compra')) return 'buy'
  if (t.includes('sell') || t.includes('short') || t.includes('venda')) return 'sell'
  return null
}

/** Validação heurística local — microsegundos, sem rede. */
export function quickLocalValidate(
  parsed: ParsedSignal,
  raw: string,
  channel?: MtmcopyChannelKey,
): AiSignalValidation {
  const start = performance.now()
  const issues: string[] = []
  let score = 0

  if (parsed.symbol) score += 0.22
  else issues.push('Símbolo em falta')

  if (parsed.direction) score += 0.18
  else issues.push('Direcção em falta')

  if (parsed.sl != null && parsed.sl > 0) score += 0.18
  else if (!/\b(?:now|market|mercado|já)\b/i.test(raw)) issues.push('Stop Loss em falta')

  if (parsed.tp.length > 0) score += 0.12
  else issues.push('Take Profit em falta')

  const entry = parsed.entry
  const sl = parsed.sl
  const tp0 = parsed.tp[0] ?? null

  if (parsed.direction === 'buy') {
    if (sl != null && tp0 != null && sl < tp0) score += 0.2
    else if (sl != null && tp0 != null) issues.push('BUY: SL deve ficar abaixo do TP')
    else if (sl != null || tp0 != null) score += 0.1

    if (parsed.orderType === 'limit') {
      if (entry != null && sl != null && entry > sl) score += 0.05
      else if (entry != null && sl != null) issues.push('BUY LIMIT: entry deve ser > SL')
      if (entry != null) score += 0.05
      else issues.push('BUY LIMIT sem preço de entrada')
    } else {
      score += 0.1
    }
  } else if (parsed.direction === 'sell') {
    if (sl != null && tp0 != null && sl > tp0) score += 0.2
    else if (sl != null && tp0 != null) issues.push('SELL: SL deve ficar acima do TP')
    else if (sl != null || tp0 != null) score += 0.1

    if (parsed.orderType === 'limit') {
      if (entry != null && sl != null && entry < sl) score += 0.05
      else if (entry != null && sl != null) issues.push('SELL LIMIT: entry deve ser < SL')
      if (entry != null) score += 0.05
      else issues.push('SELL LIMIT sem preço de entrada')
    } else {
      score += 0.1
    }
  }

  if (/\bmoeda\s*:/i.test(raw) && /\ba[cç][aã]o\s*:/i.test(raw)) score += 0.05
  if (/\b(?:gold|btc|sell|buy)\s+zone\b/i.test(raw)) score += 0.05
  if (/\b(?:buy|sell)\s+now\b/i.test(raw)) score += 0.05

  if (channel === 'premium-signals') {
    if (/\bgold\s+(?:buy|sell)\s+zone\b/i.test(raw) && parsed.tp.length >= 1) score += 0.05
    if (/\b(?:buy|sell)\s+now\b/i.test(raw)) score += 0.04
    if (/\btrade\s+active\s+and\s+running\b/i.test(raw)) {
      return {
        valid: false,
        confidence: 0,
        symbol: parsed.symbol,
        direction: parsed.direction,
        entry: parsed.entry,
        sl: parsed.sl,
        tp: parsed.tp,
        orderType: parsed.orderType,
        issues: ['Mensagem de gestão Premium — não é entrada'],
        reasoning: 'Trade Active and Running (gestão, não abrir trade)',
        source: 'local',
        localConfidence: 0,
        aiConfidence: null,
        latencyMs: performance.now() - start,
      }
    }
  }

  const confidence = clamp01(score)

  return {
    valid: confidence >= MTMCOPY_AI_MIN_CONFIDENCE && issues.length <= 2,
    confidence,
    symbol: parsed.symbol,
    direction: parsed.direction,
    entry: parsed.entry,
    sl: parsed.sl,
    tp: parsed.tp,
    orderType: parsed.orderType,
    issues,
    reasoning: issues.length ? issues.join('; ') : 'Heurística local OK',
    source: 'local',
    localConfidence: confidence,
    aiConfidence: null,
    latencyMs: performance.now() - start,
  }
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

async function callHaikuValidator(
  raw: string,
  parsed: ParsedSignal,
  strategyPrompt?: string | null,
): Promise<AiJson | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null

  const model =
    process.env.MTMCOPY_AI_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    'claude-3-5-haiku-20241022'

  const system = `És um validador de sinais de trading MTM para copy trading MT5.
Analisa formato, zonas de entrada, SL e TP. Responde APENAS com JSON válido (sem markdown):
{"confidence":0.0-1.0,"valid":true|false,"symbol":"XAUUSD","direction":"buy"|"sell","entry":null|number,"sl":number|null,"tp":[numbers],"order_type":"market"|"limit","issues":["..."],"reason":"..."}
Regras: SELL → SL > TP; BUY → SL < TP. LIMIT precisa entry. confidence=probabilidade de ser sinal executável válido.
Mensagens «Trade Active and Running», HIT TP, cancel = gestão (valid:false, não é entrada).
Cada sinal de entrada Premium abre 1 posição (parciais nos HIT TP) — nunca tratar gestão como nova entrada.
${strategyPrompt?.trim() ? `\n--- Estratégia do provider ---\n${strategyPrompt.trim()}` : ''}`

  const user = `MENSAGEM TELEGRAM:
${raw}

PARSER (pode ter erros):
${JSON.stringify({
    symbol: parsed.symbol,
    direction: parsed.direction,
    entry: parsed.entry,
    sl: parsed.sl,
    tp: parsed.tp,
    orderType: parsed.orderType,
  })}`

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
        max_tokens: 280,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    },
    AI_TIMEOUT_MS,
  )

  if (!res?.ok) return null
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim()
  if (!text) return null

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as AiJson
  } catch {
    return null
  }
}

async function callOpenAiValidator(
  raw: string,
  parsed: ParsedSignal,
  strategyPrompt?: string | null,
): Promise<AiJson | null> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')

  const system = `Validador de sinais trading. Responde só JSON: {"confidence":0-1,"valid":bool,"symbol":str,"direction":"buy"|"sell","entry":num|null,"sl":num|null,"tp":[nums],"order_type":"market"|"limit","issues":[],"reason":str}
Trade Active / HIT TP / cancel = gestão, não entrada. Premium: 1 perna + parciais nos exits.
${strategyPrompt?.trim() ? strategyPrompt.trim() : ''}`

  const res = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 280,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Valida:\n${raw}\n\nParser: ${JSON.stringify(parsed)}`,
          },
        ],
      }),
    },
    AI_TIMEOUT_MS,
  )

  if (!res?.ok) return null
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) return null
  try {
    return JSON.parse(text) as AiJson
  } catch {
    return null
  }
}

function mergeAiIntoValidation(
  local: AiSignalValidation,
  ai: AiJson,
): AiSignalValidation {
  const aiConf = clamp01(Number(ai.confidence ?? 0))
  const tpRaw = ai.tp
  const tpArr = Array.isArray(tpRaw)
    ? tpRaw.map(parseNum).filter((n): n is number => n != null)
    : parseNum(tpRaw) != null
      ? [parseNum(tpRaw)!]
      : local.tp

  const direction = normalizeDirection(ai.direction) ?? local.direction
  const orderType =
    ai.order_type === 'limit' || ai.order_type === 'market'
      ? ai.order_type
      : local.orderType

  const issues = [...new Set([...(ai.issues ?? []), ...local.issues])]
  const hybridConfidence = clamp01(aiConf * 0.7 + local.localConfidence * 0.3)

  return {
    valid: (ai.valid ?? hybridConfidence >= MTMCOPY_AI_MIN_CONFIDENCE) && hybridConfidence >= MTMCOPY_AI_MIN_CONFIDENCE,
    confidence: hybridConfidence,
    symbol: (typeof ai.symbol === 'string' ? ai.symbol.toUpperCase() : null) ?? local.symbol,
    direction,
    entry: parseNum(ai.entry) ?? local.entry,
    sl: parseNum(ai.sl) ?? local.sl,
    tp: tpArr.length ? tpArr : local.tp,
    orderType,
    issues,
    reasoning: ai.reason?.trim() || local.reasoning,
    source: 'hybrid',
    localConfidence: local.localConfidence,
    aiConfidence: aiConf,
    latencyMs: local.latencyMs,
  }
}

/** Validação: heurística instantânea; IA só se necessário (formatos oficiais = fast path). */
export async function validateSignalWithAi(
  raw: string,
  parsed: ParsedSignal,
  options?: ValidateSignalOptions,
): Promise<AiSignalValidation> {
  const minConfidence = options?.minConfidence ?? MTMCOPY_AI_MIN_CONFIDENCE
  const channel = options?.channel
  const strategyPrompt =
    channel === 'premium-signals'
      ? resolvePremiumAiStrategyPrompt(options?.strategyPrompt)
      : options?.strategyPrompt?.trim() || null

  const cacheKey = `${options?.skipAi ? 's' : 'a'}:${channel ?? 'u'}:${raw.trim().slice(0, 500)}`
  const cached = aiCache.get(cacheKey)
  if (cached && Date.now() - cached.at < AI_CACHE_MS) {
    return cached.result
  }

  const start = performance.now()
  const local = quickLocalValidate(parsed, raw, channel)

  if (shouldSkipAiCall(raw, local, minConfidence, options?.skipAi, options?.forceFastPath)) {
    const result = {
      ...local,
      reasoning:
        options?.skipAi || !AI_ENABLED
          ? local.reasoning
          : `${local.reasoning} (fast path — formato MTM)`,
      latencyMs: performance.now() - start,
    }
    aiCache.set(cacheKey, { at: Date.now(), result })
    return result
  }

  let aiJson = await callHaikuValidator(raw, parsed, strategyPrompt)
  if (!aiJson) aiJson = await callOpenAiValidator(raw, parsed, strategyPrompt)

  let result: AiSignalValidation
  if (aiJson) {
    result = mergeAiIntoValidation(local, aiJson)
    result.latencyMs = performance.now() - start
  } else {
    result = {
      ...local,
      reasoning: `${local.reasoning} (IA indisponível — só heurística)`,
      latencyMs: performance.now() - start,
    }
  }

  aiCache.set(cacheKey, { at: Date.now(), result })
  return result
}

/** Aplica correcções da validação ao sinal antes da execução. */
export function applyValidationToSignal(
  parsed: ParsedSignal,
  validation: AiSignalValidation,
): ParsedSignal {
  return {
    ...parsed,
    symbol: validation.symbol ?? parsed.symbol,
    direction: validation.direction ?? parsed.direction,
    entry: validation.entry ?? parsed.entry,
    sl: validation.sl ?? parsed.sl,
    tp: validation.tp.length ? validation.tp : parsed.tp,
    orderType: validation.orderType ?? parsed.orderType,
  }
}

export function formatAiValidationDetail(validation: AiSignalValidation): string {
  const pct = Math.round(validation.confidence * 100)
  const localPct = Math.round(validation.localConfidence * 100)
  const aiPct = validation.aiConfidence != null ? Math.round(validation.aiConfidence * 100) : null
  const src =
    validation.source === 'hybrid'
      ? `IA ${aiPct}% + local ${localPct}%`
      : `local ${localPct}%`
  const issues = validation.issues.length ? ` · ${validation.issues.slice(0, 2).join('; ')}` : ''
  return `Validação ${src} → ${pct}%${issues}`
}

export function shouldExecuteSignal(validation: AiSignalValidation): boolean {
  return validation.confidence >= MTMCOPY_AI_MIN_CONFIDENCE
}

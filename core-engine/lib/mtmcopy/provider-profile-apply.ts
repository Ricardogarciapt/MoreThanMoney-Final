import { symbolMatchesCanonical } from './symbol-resolver'
import { MTMCOPY_AI_MIN_CONFIDENCE } from './signal-ai-validator'
import type { AiSignalValidation } from './signal-ai-validator'
import type { ParsedSignal } from './signal-parser'
import type { ProviderExecutionProfile } from './signal-sources-config'

export function getAiMinConfidence(profile: ProviderExecutionProfile): number {
  const v = profile.ai_min_confidence
  if (v != null && Number.isFinite(v) && v > 0 && v <= 1) return v
  return MTMCOPY_AI_MIN_CONFIDENCE
}

export function shouldExecuteForProfile(
  validation: AiSignalValidation,
  profile: ProviderExecutionProfile,
): boolean {
  if (profile.ai_validation_enabled === false) return true
  return validation.confidence >= getAiMinConfidence(profile)
}

export function applySymbolFromProfile(
  symbol: string,
  profile: ProviderExecutionProfile,
): string {
  const upper = symbol.toUpperCase()
  const mappings = profile.symbol_mappings ?? []
  const hit = mappings.find((m) => m.signal_symbol.toUpperCase() === upper)
  if (hit?.platform_symbol) return hit.platform_symbol.toUpperCase()

  if (profile.symbol_prefix_suffix_mode === 'manual') {
    const prefix = profile.symbol_prefix ?? ''
    const suffix = profile.symbol_suffix ?? ''
    return `${prefix}${upper}${suffix}`.toUpperCase()
  }
  return upper
}

export function shouldSkipSymbolForProfile(
  symbol: string,
  profile: ProviderExecutionProfile,
): string | null {
  const upper = symbol.toUpperCase()
  const avoid = (profile.symbols_avoid ?? []).map((s) => s.toUpperCase())
  if (avoid.some((s) => upper.includes(s) || s.includes(upper))) {
    return 'Símbolo na lista de evitar'
  }
  // Matching por FAMÍLIA de símbolo (tolera sufixos/prefixos de corretora: XAUUSD.S ↔ XAUUSD ↔ GOLD)
  const only = (profile.symbols_execute_only ?? []).map((s) => s.toUpperCase())
  if (only.length && !only.some((s) => symbolMatchesCanonical(upper, s))) {
    return 'Símbolo fora da lista permitida'
  }
  if (profile.symbols_whitelist?.length && !profile.symbols_whitelist.some((s) => symbolMatchesCanonical(upper, s))) {
    return 'Símbolo fora da whitelist'
  }
  return null
}

export function isWithinTradingSchedule(profile: ProviderExecutionProfile, symbol?: string | null): boolean {
  const sched = profile.trading_schedule
  if (!sched || sched.mode === 'always') return true
  // Símbolos isentos do horário (ex.: BTCUSD no Sensei) operam 24h.
  if (symbol && sched.exempt_symbols?.length) {
    const s = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (sched.exempt_symbols.map((e) => String(e).toUpperCase().replace(/[^A-Z0-9]/g, '')).includes(s)) return true
  }
  const now = new Date()
  let day: number
  let hour: number
  if (sched.timezone) {
    // Dia da semana + hora no fuso configurado (à prova de horário de verão).
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: sched.timezone, weekday: 'short', hour: '2-digit', hour12: false,
    }).formatToParts(now)
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    day = wdMap[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? now.getUTCDay()
    hour = Number(parts.find((p) => p.type === 'hour')?.value ?? now.getUTCHours()) % 24
  } else {
    day = now.getUTCDay()
    hour = now.getUTCHours()
  }
  if (sched.days?.length && !sched.days.includes(day)) return false
  const start = sched.start_hour ?? 0
  const end = sched.end_hour ?? 24
  if (start <= end) return hour >= start && hour < end
  return hour >= start || hour < end
}

export function resolveLotForSymbol(
  symbol: string,
  defaultLot: number,
  profile: ProviderExecutionProfile,
): number {
  const upper = symbol.toUpperCase()
  const ex = (profile.symbol_lot_exceptions ?? []).find(
    (e) => e.symbol.toUpperCase() === upper,
  )
  if (ex && Number(ex.lot) > 0) return Number(ex.lot)
  return defaultLot
}

export function resolveSlTpForSignal(
  signal: ParsedSignal,
  profile: ProviderExecutionProfile,
): { sl: number | null; tp: number | null; skipReason: string | null } {
  let sl: number | null = signal.sl ?? null
  let tp: number | null = signal.tp[0] ?? null

  if (profile.sl_option === 'none' || profile.copy_sl === false) {
    sl = null
  } else if (!sl && !profile.execute_if_no_sl) {
    return { sl: null, tp: null, skipReason: 'Sem Stop Loss no sinal' }
  }

  if (profile.tp_option === 'none' || profile.copy_tp === false) {
    tp = null
  } else if (!tp && !profile.execute_if_no_tp) {
    return { sl, tp: null, skipReason: 'Sem Take Profit no sinal' }
  }

  return { sl, tp, skipReason: null }
}

export function mtCommentForProfile(
  profile: ProviderExecutionProfile,
  fallback: string,
): string {
  const c = profile.mt_comment?.trim()
  return c || fallback
}

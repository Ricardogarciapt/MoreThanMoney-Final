import type { MtmcopyChannelKey } from './channel-context'
import { MTM_DEFAULT_RISK_PERCENT, MTM_PROVIDER_EXECUTION_PROFILE } from './provider-accounts'
import {
  getSignalSourcesConfig,
  type MtmcopyTelegramChannelKey,
  type ProviderExecutionProfile,
} from './signal-sources-config'
import type { MTMcopierConnection } from './types'

export type { ProviderExecutionProfile }

/** Perfil MTM Auto — Premium (XAUUSD, 1 perna + parciais Telegram). */
export const PREMIUM_PROVIDER_EXECUTION: ProviderExecutionProfile = {
  ...MTM_PROVIDER_EXECUTION_PROFILE,
  lot_mode: 'risk_percent',
  lot_value: MTM_DEFAULT_RISK_PERCENT,
  ai_validation_enabled: true,
  ai_min_confidence: 0.35,
  sl_option: 'from_room',
  execute_if_no_sl: true,
  tp_option: 'from_room',
  execute_if_no_tp: true,
  symbol_prefix_suffix_mode: 'auto',
  symbol_prefix: '',
  symbol_suffix: '',
  symbol_mappings: [],
  mt_comment: 'MTM-PREMIUM',
  // MTM Auto Premium NÃO opera na sessão da Ásia: só abre da abertura de Londres (08:00)
  // às 22:00 hora de Londres (à prova de horário de verão via timezone). 22:00→08:00 = Ásia.
  trading_schedule: { mode: 'custom', timezone: 'Europe/London', start_hour: 8, end_hour: 22 },
  copy_close_orders: true,
  copy_modify_orders: true,
  close_opposite_positions: false,
  symbols_execute_only: ['XAUUSD', 'GOLD'],
  symbols_avoid: null,
  symbol_lot_exceptions: [],
  // Runner maior (2026-07-27): banca 50% no TP1 (era 75%) e deixa 50% correr até TP2/TP3 com
  // BE+trailing pós-TP1 → acompanha melhor o price action / maximiza os movimentos grandes.
  exit_pct_tp1: 50,
  exit_pct_tp2: 25,
  exit_pct_tp3: 25,
  auto_trailing_stop: false,
  trailing_stop_points: 0,
}

/** Perfil MTM Auto — Trade Ideas (forex + trailing).
 *  Risco 0.3%/trade (reduzido de 0.5% — perdas grandes em cross voláteis, ver análise
 *  2026-07-02) e trailing stop ATIVO e mais apertado (15 pips) para proteger lucros. */
export const TRADE_IDEAS_PROVIDER_EXECUTION: ProviderExecutionProfile = {
  ...MTM_PROVIDER_EXECUTION_PROFILE,
  lot_mode: 'risk_percent',
  lot_value: 0.3,
  ai_validation_enabled: true,
  ai_min_confidence: 0.35,
  auto_trailing_stop: true,
  trailing_stop_points: 150,
  sl_option: 'from_room',
  execute_if_no_sl: true,
  tp_option: 'from_room',
  execute_if_no_tp: true,
  symbol_prefix_suffix_mode: 'auto',
  symbol_prefix: '',
  symbol_suffix: '',
  symbol_mappings: [],
  mt_comment: 'MTM-TI',
  trading_schedule: { mode: 'always' },
  copy_close_orders: true,
  copy_modify_orders: true,
  close_opposite_positions: false,
  symbols_execute_only: null,
  symbols_avoid: null,
  symbol_lot_exceptions: [],
  exit_pct_tp1: 75,
  exit_pct_tp2: 15,
  exit_pct_tp3: 10,
}

/** Perfil MTM Auto — Sensei Scanner (TradingView webhook + gestão programada).
 *  Mantém 0.5% e trailing OFF (não herda as mudanças do Trade Ideas — o Sensei está
 *  lucrativo a 0.5%). */
export const SENSEI_PROVIDER_EXECUTION: ProviderExecutionProfile = {
  ...TRADE_IDEAS_PROVIDER_EXECUTION,
  lot_value: MTM_DEFAULT_RISK_PERCENT,
  auto_trailing_stop: false,
  trailing_stop_points: 200,
  mt_comment: 'MTM-SENSEI',
}

export const DEFAULT_PROVIDER_EXECUTION: ProviderExecutionProfile = {
  ...PREMIUM_PROVIDER_EXECUTION,
  sl_option: 'from_room',
  execute_if_no_sl: true,
  tp_option: 'from_room',
  execute_if_no_tp: true,
  symbol_prefix_suffix_mode: 'auto',
  symbol_prefix: '',
  symbol_suffix: '',
  symbol_mappings: [],
  mt_comment: null,
  trading_schedule: { mode: 'always' },
  copy_close_orders: true,
  copy_modify_orders: true,
  close_opposite_positions: false,
  symbols_execute_only: null,
  symbols_avoid: null,
  symbol_lot_exceptions: [],
  exit_pct_tp1: 75,
  exit_pct_tp2: 15,
  exit_pct_tp3: 10,
}

export function executionProfileToConnectionFields(
  profile: ProviderExecutionProfile,
): Pick<
  MTMcopierConnection,
  | 'lot_mode'
  | 'lot_value'
  | 'max_risk_percent'
  | 'copy_sl'
  | 'copy_tp'
  | 'auto_trailing_stop'
  | 'trailing_stop_points'
  | 'reverse_signals'
  | 'symbols_whitelist'
> {
  return {
    lot_mode: profile.lot_mode,
    lot_value: Number(profile.lot_value) || 0.01,
    max_risk_percent: profile.max_risk_percent ?? null,
    copy_sl: profile.copy_sl !== false,
    copy_tp: profile.copy_tp !== false,
    auto_trailing_stop: Boolean(profile.auto_trailing_stop),
    trailing_stop_points: Number(profile.trailing_stop_points) || 200,
    reverse_signals: Boolean(profile.reverse_signals),
    symbols_whitelist: profile.symbols_whitelist?.length ? profile.symbols_whitelist : null,
  }
}

export function formatExecutionSummary(profile: ProviderExecutionProfile): string {
  switch (profile.lot_mode) {
    case 'risk_percent':
      return `${profile.lot_value}% risco por trade`
    case 'multiplier':
      return `multiplicador ×${profile.lot_value}`
    case 'fixed':
    default:
      return `${profile.lot_value} lotes fixos`
  }
}

export function normalizeProviderExecutionProfile(
  raw: Partial<ProviderExecutionProfile> | undefined,
): ProviderExecutionProfile {
  const base = DEFAULT_PROVIDER_EXECUTION
  if (!raw) return { ...base }
  return {
    lot_mode:
      raw.lot_mode === 'fixed' || raw.lot_mode === 'risk_percent' || raw.lot_mode === 'multiplier'
        ? raw.lot_mode
        : base.lot_mode,
    lot_value: Number(raw.lot_value) > 0 ? Number(raw.lot_value) : base.lot_value,
    max_risk_percent:
      raw.max_risk_percent != null && String(raw.max_risk_percent) !== ''
        ? Number(raw.max_risk_percent)
        : base.max_risk_percent,
    copy_sl: raw.copy_sl !== false,
    copy_tp: raw.copy_tp !== false,
    auto_trailing_stop: raw.auto_trailing_stop ?? base.auto_trailing_stop,
    trailing_stop_points: Number(raw.trailing_stop_points) || base.trailing_stop_points,
    reverse_signals: Boolean(raw.reverse_signals),
    symbols_whitelist: Array.isArray(raw.symbols_whitelist)
      ? raw.symbols_whitelist.map(String).filter(Boolean)
      : null,
    ai_validation_enabled: raw.ai_validation_enabled ?? base.ai_validation_enabled,
    ai_min_confidence:
      raw.ai_min_confidence != null && Number(raw.ai_min_confidence) > 0
        ? Number(raw.ai_min_confidence)
        : base.ai_min_confidence,
    sl_option: raw.sl_option === 'none' ? 'none' : 'from_room',
    execute_if_no_sl: raw.execute_if_no_sl ?? base.execute_if_no_sl,
    tp_option: raw.tp_option === 'none' ? 'none' : 'from_room',
    execute_if_no_tp: raw.execute_if_no_tp ?? base.execute_if_no_tp,
    symbol_prefix_suffix_mode:
      raw.symbol_prefix_suffix_mode === 'manual' ? 'manual' : 'auto',
    symbol_prefix: raw.symbol_prefix ?? base.symbol_prefix,
    symbol_suffix: raw.symbol_suffix ?? base.symbol_suffix,
    symbol_mappings: Array.isArray(raw.symbol_mappings)
      ? raw.symbol_mappings
          .filter((m) => m?.signal_symbol && m?.platform_symbol)
          .map((m) => ({
            signal_symbol: String(m.signal_symbol).trim(),
            platform_symbol: String(m.platform_symbol).trim(),
          }))
      : base.symbol_mappings,
    mt_comment: raw.mt_comment?.trim() || null,
    trading_schedule: raw.trading_schedule?.mode === 'custom'
      ? {
          mode: 'custom' as const,
          timezone: raw.trading_schedule.timezone,
          days: raw.trading_schedule.days,
          start_hour: raw.trading_schedule.start_hour ?? 0,
          end_hour: raw.trading_schedule.end_hour ?? 24,
          exempt_symbols: Array.isArray(raw.trading_schedule.exempt_symbols)
            ? raw.trading_schedule.exempt_symbols.map(String)
            : undefined,
        }
      : { mode: 'always' as const },
    copy_close_orders: raw.copy_close_orders ?? base.copy_close_orders,
    copy_modify_orders: raw.copy_modify_orders ?? base.copy_modify_orders,
    close_opposite_positions: Boolean(raw.close_opposite_positions),
    symbols_execute_only: Array.isArray(raw.symbols_execute_only)
      ? raw.symbols_execute_only.map(String).filter(Boolean)
      : null,
    symbols_avoid: Array.isArray(raw.symbols_avoid)
      ? raw.symbols_avoid.map(String).filter(Boolean)
      : null,
    symbol_lot_exceptions: Array.isArray(raw.symbol_lot_exceptions)
      ? raw.symbol_lot_exceptions
          .filter((e) => e?.symbol && Number(e.lot) > 0)
          .map((e) => ({ symbol: String(e.symbol).trim(), lot: Number(e.lot) }))
      : base.symbol_lot_exceptions,
    exit_pct_tp1:
      raw.exit_pct_tp1 != null && Number(raw.exit_pct_tp1) > 0
        ? Number(raw.exit_pct_tp1)
        : base.exit_pct_tp1,
    exit_pct_tp2:
      raw.exit_pct_tp2 != null && Number(raw.exit_pct_tp2) > 0
        ? Number(raw.exit_pct_tp2)
        : base.exit_pct_tp2,
    exit_pct_tp3:
      raw.exit_pct_tp3 != null && Number(raw.exit_pct_tp3) > 0
        ? Number(raw.exit_pct_tp3)
        : base.exit_pct_tp3,
    partial_exits: raw.partial_exits === true ? true : (base.partial_exits ?? false),
    price_monitor: raw.price_monitor === true ? true : (base.price_monitor ?? false),
  }
}

/** Perfil de execução MetaAPI para a conta provider de um canal Telegram. */
export async function getProviderExecutionProfile(
  channel: MtmcopyChannelKey,
  routeExecution?: ProviderExecutionProfile | null,
): Promise<ProviderExecutionProfile> {
  if (routeExecution) return normalizeProviderExecutionProfile(routeExecution)
  if (channel === 'unknown') return { ...DEFAULT_PROVIDER_EXECUTION }

  const config = await getSignalSourcesConfig()
  const key = channel as MtmcopyTelegramChannelKey
  const fromChannel = config.channel_providers?.[key]?.execution
  if (fromChannel) return normalizeProviderExecutionProfile(fromChannel)

  const fromProfiles = config.provider_execution_profiles?.[key]
  if (fromProfiles) return normalizeProviderExecutionProfile(fromProfiles)

  if (config.provider_execution) return normalizeProviderExecutionProfile(config.provider_execution)

  if (channel === 'premium-signals') return { ...PREMIUM_PROVIDER_EXECUTION }
  if (channel === 'trade-ideas') return { ...TRADE_IDEAS_PROVIDER_EXECUTION }
  return { ...DEFAULT_PROVIDER_EXECUTION }
}

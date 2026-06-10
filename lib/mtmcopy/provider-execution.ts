import type { MtmcopyChannelKey } from './channel-context'
import { MTM_PROVIDER_EXECUTION_PROFILE } from './provider-accounts'
import {
  getSignalSourcesConfig,
  type MtmcopyTelegramChannelKey,
  type ProviderExecutionProfile,
} from './signal-sources-config'
import type { MTMcopierConnection } from './types'

export type { ProviderExecutionProfile }

export const DEFAULT_PROVIDER_EXECUTION: ProviderExecutionProfile = {
  ...MTM_PROVIDER_EXECUTION_PROFILE,
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

function normalizeProfile(raw: Partial<ProviderExecutionProfile> | undefined): ProviderExecutionProfile {
  const base = DEFAULT_PROVIDER_EXECUTION
  if (!raw) return { ...base }
  return {
    lot_mode:
      raw.lot_mode === 'fixed' || raw.lot_mode === 'risk_percent' || raw.lot_mode === 'multiplier'
        ? raw.lot_mode
        : base.lot_mode,
    lot_value: Number(raw.lot_value) > 0 ? Number(raw.lot_value) : base.lot_value,
    max_risk_percent:
      raw.max_risk_percent != null && raw.max_risk_percent !== ''
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
  }
}

/** Perfil de execução MetaAPI para a conta provider de um canal Telegram. */
export async function getProviderExecutionProfile(
  channel: MtmcopyChannelKey,
  routeExecution?: ProviderExecutionProfile | null,
): Promise<ProviderExecutionProfile> {
  if (routeExecution) return normalizeProfile(routeExecution)
  if (channel === 'unknown') return { ...DEFAULT_PROVIDER_EXECUTION }

  const config = await getSignalSourcesConfig()
  const key = channel as MtmcopyTelegramChannelKey
  const fromChannel = config.channel_providers?.[key]?.execution
  if (fromChannel) return normalizeProfile(fromChannel)

  const fromProfiles = config.provider_execution_profiles?.[key]
  if (fromProfiles) return normalizeProfile(fromProfiles)

  if (config.provider_execution) return normalizeProfile(config.provider_execution)

  return { ...DEFAULT_PROVIDER_EXECUTION }
}

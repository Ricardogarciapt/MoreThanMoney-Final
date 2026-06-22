import type { MtmcopyCopyMethod, MtmcopyTelegramGroup } from './copy-methods'

export type MtmcopySenderMode = 'telegram' | 'master_account'
export type MtmcopyAccountRole = 'slave' | 'master'

export interface MTMcopierConnection {
  id: string
  user_id: string
  account_role?: MtmcopyAccountRole
  sender_mode?: MtmcopySenderMode
  copyfactory_strategy_id?: string | null
  telegram_channel: string | null
  telegram_status: 'pending' | 'connected' | 'error' | 'disconnected'
  mt5_login_last4: string | null
  mt5_login?: string | null
  mt5_platform?: 'mt4' | 'mt5' | null
  mt5_server: string | null
  copyfactory_subscribed?: boolean
  mt5_status: 'pending' | 'connected' | 'error' | 'disconnected'
  lot_mode: 'fixed' | 'risk_percent' | 'multiplier'
  lot_value: number
  max_risk_percent: number | null
  symbols_whitelist: string[] | null
  copy_sl: boolean
  copy_tp: boolean
  auto_trailing_stop: boolean
  trailing_stop_points: number
  reverse_signals: boolean
  is_active: boolean
  last_signal_at: string | null
  last_error: string | null
  metaapi_account_id?: string | null
  account_label?: string | null
  copy_method?: MtmcopyCopyMethod | null
  telegram_group?: MtmcopyTelegramGroup | null
  telegram_groups?: MtmcopyTelegramGroup[] | null
  exit_pct_tp1?: number | null
  exit_pct_tp2?: number | null
  exit_pct_tp3?: number | null
  copyfactory_strategy_pick?: string | null
  is_audited?: boolean
  audit_label?: string | null
  prop_firm_type?: 'ftmo' | 'fundednext' | null
  copy_as_manual?: boolean
  baseline_balance?: number | null
}

export type TradingTradeSource = 'manual' | 'copy' | 'audited'
export type TradingExecutionMode = 'executed' | 'analysis'

/** @deprecated usar resolveMtmcopyUserLimits() — VIP: 5, member: 4, admin: ilimitado */
export { MAX_MTMCOPY_ACCOUNTS_MEMBER as MAX_MTMCOPY_ACCOUNTS_TOTAL } from './account-limits'
export {
  MAX_MTMCOPY_ACCOUNTS_VIP,
  MAX_MTMCOPY_ACCOUNTS_MEMBER,
  MAX_MTMCOPY_SIGNAL_SLAVES,
  MAX_MTMCOPY_MASTERS,
  MAX_MTMCOPY_COPY_SLAVES,
} from './account-limits'

/** @deprecated usar MAX_MTMCOPY_SIGNAL_SLAVES */
export { MAX_MTMCOPY_SIGNAL_SLAVES as MAX_MTMCOPY_TELEGRAM_SLAVES } from './account-limits'

/** @deprecated usar MAX_MTMCOPY_ACCOUNTS_MEMBER */
export { MAX_MTMCOPY_ACCOUNTS_MEMBER as MAX_MTMCOPY_ACCOUNTS_PER_USER } from './account-limits'

export type SignalLogStatus = 'received' | 'executed' | 'skipped' | 'error'

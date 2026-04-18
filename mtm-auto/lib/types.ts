// User types
export interface User {
  id: string
  name: string
  email: string
  initials: string
  role: 'client' | 'admin'
  createdAt: string
}

// Account types
export interface MTAccount {
  id: string
  login: string
  broker: string
  server: string
  platform: 'MT4' | 'MT5'
  environment: 'live' | 'demo'
  balance: number
  equity: number
  role: 'master' | 'slave'
  status: 'connected' | 'disconnected' | 'error'
  strategyId?: string
  userId: string
}

// Strategy types
export interface Strategy {
  id: string
  name: string
  description: string
  icon: string
  groupId: string
  groupName: string
  masterAccountId: string
  priceMonthly: number
  minCapital: number
  minLot: number
  minCopyPercent: number
  minSafeGuard: number
  platforms: ('MT4' | 'MT5')[]
  environments: ('live' | 'demo')[]
  stats: {
    return90d: number
    winRate: number
    maxDrawdown: number
    profitFactor: number
    sharpe: number
    totalTrades: number
  }
  riskLevel: 'low' | 'medium' | 'high'
  subscribers: number
  status: 'active' | 'paused' | 'config'
  myfxbookUrl?: string
}

// Copy subscription types
export type RiskSettingType = 'balance_percent' | 'equity_percent' | 'lot_multiplier' | 'fixed_lot'
export type CopierMode = 'on' | 'manage_only' | 'off'
export type StopLimitMode = 'copy' | 'override' | 'none'

export interface CopySubscription {
  id: string
  userId: string
  userName: string
  strategyId: string
  strategyName: string
  slaveAccountId: string
  slaveAccountLogin: string
  broker: string
  server: string
  platform: 'MT4' | 'MT5'
  
  // Risk Settings
  riskSetting: RiskSettingType
  riskValue: number
  
  // Copier Mode
  copierMode: CopierMode
  
  // Stops & Limits
  copyStops: boolean
  copyLimits: boolean
  stopLimitMode: StopLimitMode
  overrideStopPips?: number
  overrideTakeProfitPips?: number
  
  // SafeGuard
  safeGuardDaily: number
  safeGuardTotal: number
  safeGuardAction: 'pause' | 'close_all' | 'notify'
  
  // Disabled Symbols
  disabledSymbols: string[]
  
  // Copy options
  copyPendingOrders: boolean
  copyTrailingStop: boolean
  reverseMode: boolean
  
  // Status
  status: 'pending' | 'active' | 'paused' | 'rejected'
  currentDailyLoss: number
  currentTotalLoss: number
  pnlToday: number
  pnlMonth: number
  
  createdAt: string
  approvedAt?: string
}

// Trade types
export interface Trade {
  id: string
  subscriptionId: string
  strategyName: string
  symbol: string
  type: 'buy' | 'sell'
  lot: number
  entryPrice: number
  exitPrice?: number
  stopLoss?: number
  takeProfit?: number
  pnl: number
  status: 'open' | 'closed'
  openedAt: string
  closedAt?: string
}

// Group types
export interface StrategyGroup {
  id: string
  name: string
  icon: string
  description: string
  visibility: 'public' | 'private' | 'hidden'
  strategies: number
  slaves: number
  status: 'active' | 'inactive'
}

// Broker types
export interface Broker {
  name: string
  servers: string[]
  env: string
  platform: 'MT4' | 'MT5'
  type: 'regulated' | 'propfirm'
  selected?: boolean
}

// Global Risk Settings
export interface GlobalRiskSettings {
  allowedRiskModes: RiskSettingType[]
  maxRiskPerTrade: number
  minLotGlobal: number
  maxLotGlobal: number
  defaultDailyLoss: number
  defaultTotalLoss: number
  resetTimeUTC: string
  autoPauseOnDailyLimit: boolean
  closePositionsOnTotalLimit: boolean
  notifyAt80Percent: boolean
  copyStopLoss: boolean
  copyPendingOrders: boolean
  copyTrailingStop: boolean
  reverseModeAvailable: boolean
  excludedSymbols: string[]
}

"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { 
  User, 
  MTAccount, 
  Strategy, 
  CopySubscription, 
  Trade, 
  StrategyGroup,
  Broker,
  GlobalRiskSettings 
} from './types'

// Demo data
const demoStrategies: Strategy[] = [
  {
    id: 's1',
    name: 'Alpha Scalper',
    description: 'Scalping de alta frequencia EUR/USD, GBP/USD, XAUUSD. Opera em sessao de Londres e Nova Iorque com stops apertados e alvos realistas.',
    icon: 'zap',
    groupId: 'g1',
    groupName: 'Scalping Elite',
    masterAccountId: 'm1',
    priceMonthly: 149,
    minCapital: 1000,
    minLot: 0.01,
    minCopyPercent: 5,
    minSafeGuard: 3,
    platforms: ['MT5'],
    environments: ['live', 'demo'],
    stats: { return90d: 34.2, winRate: 71, maxDrawdown: 4.1, profitFactor: 1.85, sharpe: 2.4, totalTrades: 843 },
    riskLevel: 'low',
    subscribers: 47,
    status: 'active'
  },
  {
    id: 's2',
    name: 'Trend Master FX',
    description: 'Swing trading multi-timeframe com analise macro em pares G10. Posicoes de medio prazo com gestao de risco conservadora.',
    icon: 'trending-up',
    groupId: 'g2',
    groupName: 'Swing Premium',
    masterAccountId: 'm2',
    priceMonthly: 99,
    minCapital: 2000,
    minLot: 0.05,
    minCopyPercent: 10,
    minSafeGuard: 2,
    platforms: ['MT4', 'MT5'],
    environments: ['live'],
    stats: { return90d: 28.7, winRate: 64, maxDrawdown: 6.8, profitFactor: 1.62, sharpe: 1.8, totalTrades: 156 },
    riskLevel: 'medium',
    subscribers: 31,
    status: 'active'
  },
  {
    id: 's3',
    name: 'Grid Bot Pro',
    description: 'Grid automatico para mercados laterais. Ideal para periodos de baixa volatilidade com gestao de capital agressiva.',
    icon: 'bot',
    groupId: 'g3',
    groupName: 'Grid Systems',
    masterAccountId: 'm3',
    priceMonthly: 199,
    minCapital: 5000,
    minLot: 0.01,
    minCopyPercent: 3,
    minSafeGuard: 5,
    platforms: ['MT5'],
    environments: ['demo'],
    stats: { return90d: 18.3, winRate: 78, maxDrawdown: 12.4, profitFactor: 1.45, sharpe: 1.2, totalTrades: 1250 },
    riskLevel: 'high',
    subscribers: 22,
    status: 'active'
  },
  {
    id: 's4',
    name: 'News Rider',
    description: 'Trading em eventos fundamentais, NFP, e anuncios de bancos centrais. Alta volatilidade com stops apertados.',
    icon: 'newspaper',
    groupId: 'g4',
    groupName: 'News Trading',
    masterAccountId: 'm4',
    priceMonthly: 249,
    minCapital: 3000,
    minLot: 0.02,
    minCopyPercent: 5,
    minSafeGuard: 4,
    platforms: ['MT4'],
    environments: ['live'],
    stats: { return90d: 42.1, winRate: 58, maxDrawdown: 8.2, profitFactor: 1.78, sharpe: 2.1, totalTrades: 89 },
    riskLevel: 'medium',
    subscribers: 8,
    status: 'active'
  }
]

const demoAccounts: MTAccount[] = [
  { id: 'a1', login: '10482', broker: 'ICMarkets', server: 'ICMarkets-MT5-1', platform: 'MT5', environment: 'live', balance: 12450, equity: 12679, role: 'slave', status: 'connected', userId: 'u1' },
  { id: 'a2', login: '20931', broker: 'XM', server: 'XM-MT4-3', platform: 'MT4', environment: 'live', balance: 5800, equity: 5887, role: 'slave', status: 'connected', userId: 'u1' },
  { id: 'a3', login: '44002', broker: 'Pepperstone', server: 'Pepperstone-MT5', platform: 'MT5', environment: 'demo', balance: 10000, equity: 10142, role: 'slave', status: 'connected', userId: 'u1' },
]

const demoSubscriptions: CopySubscription[] = [
  {
    id: 'sub1',
    userId: 'u1',
    userName: 'Joao Costa',
    strategyId: 's1',
    strategyName: 'Alpha Scalper',
    slaveAccountId: 'a1',
    slaveAccountLogin: '10482',
    broker: 'ICMarkets',
    server: 'ICMarkets-MT5-1',
    platform: 'MT5',
    riskSetting: 'balance_percent',
    riskValue: 5,
    copierMode: 'on',
    copyStops: true,
    copyLimits: true,
    stopLimitMode: 'copy',
    safeGuardDaily: 3,
    safeGuardTotal: 10,
    safeGuardAction: 'pause',
    disabledSymbols: [],
    copyPendingOrders: false,
    copyTrailingStop: true,
    reverseMode: false,
    status: 'active',
    currentDailyLoss: 1.2,
    currentTotalLoss: 2.5,
    pnlToday: 229,
    pnlMonth: 342,
    createdAt: '2026-01-15',
    approvedAt: '2026-01-15'
  },
  {
    id: 'sub2',
    userId: 'u1',
    userName: 'Joao Costa',
    strategyId: 's2',
    strategyName: 'Trend Master FX',
    slaveAccountId: 'a2',
    slaveAccountLogin: '20931',
    broker: 'XM',
    server: 'XM-MT4-3',
    platform: 'MT4',
    riskSetting: 'fixed_lot',
    riskValue: 0.10,
    copierMode: 'on',
    copyStops: true,
    copyLimits: true,
    stopLimitMode: 'copy',
    safeGuardDaily: 2,
    safeGuardTotal: 8,
    safeGuardAction: 'pause',
    disabledSymbols: [],
    copyPendingOrders: false,
    copyTrailingStop: true,
    reverseMode: false,
    status: 'active',
    currentDailyLoss: 0.4,
    currentTotalLoss: 1.2,
    pnlToday: 87,
    pnlMonth: 550,
    createdAt: '2026-01-22',
    approvedAt: '2026-01-22'
  }
]

const demoTrades: Trade[] = [
  { id: 't1', subscriptionId: 'sub1', strategyName: 'Alpha Scalper', symbol: 'EURUSD', type: 'buy', lot: 0.05, entryPrice: 1.0842, exitPrice: undefined, pnl: 142, status: 'open', openedAt: '2026-03-25T08:30:00' },
  { id: 't2', subscriptionId: 'sub1', strategyName: 'Alpha Scalper', symbol: 'XAUUSD', type: 'buy', lot: 0.02, entryPrice: 2318.4, exitPrice: undefined, pnl: 87, status: 'open', openedAt: '2026-03-25T09:15:00' },
  { id: 't3', subscriptionId: 'sub2', strategyName: 'Trend Master FX', symbol: 'GBPJPY', type: 'sell', lot: 0.10, entryPrice: 191.82, exitPrice: undefined, pnl: -28, status: 'open', openedAt: '2026-03-25T10:00:00' },
  { id: 't4', subscriptionId: 'sub1', strategyName: 'Alpha Scalper', symbol: 'EURUSD', type: 'buy', lot: 0.05, entryPrice: 1.0842, exitPrice: 1.0891, pnl: 24.5, status: 'closed', openedAt: '2026-03-25T06:00:00', closedAt: '2026-03-25T07:30:00' },
  { id: 't5', subscriptionId: 'sub1', strategyName: 'Alpha Scalper', symbol: 'XAUUSD', type: 'buy', lot: 0.02, entryPrice: 2318.4, exitPrice: 2334.2, pnl: 31.6, status: 'closed', openedAt: '2026-03-25T05:00:00', closedAt: '2026-03-25T06:00:00' },
]

const demoGroups: StrategyGroup[] = [
  { id: 'g1', name: 'Scalping Elite', icon: 'zap', description: 'Scalping de alta frequencia em pares majors e metais.', visibility: 'public', strategies: 3, slaves: 47, status: 'active' },
  { id: 'g2', name: 'Swing Premium', icon: 'trending-up', description: 'Swing trading de medio prazo com analise macro G10.', visibility: 'public', strategies: 2, slaves: 31, status: 'active' },
  { id: 'g3', name: 'Grid Systems', icon: 'bot', description: 'Sistemas de grid automatico para mercados laterais.', visibility: 'public', strategies: 1, slaves: 22, status: 'active' },
  { id: 'g4', name: 'News Trading', icon: 'newspaper', description: 'Trading em eventos fundamentais e noticias.', visibility: 'public', strategies: 1, slaves: 8, status: 'active' },
]

const demoPendingSubscriptions: CopySubscription[] = [
  {
    id: 'psub1',
    userId: 'u2',
    userName: 'Carlos Mendes',
    strategyId: 's1',
    strategyName: 'Alpha Scalper',
    slaveAccountId: 'pa1',
    slaveAccountLogin: '55012',
    broker: 'ICMarkets',
    server: 'ICMarkets-MT5-1',
    platform: 'MT5',
    riskSetting: 'balance_percent',
    riskValue: 5,
    copierMode: 'on',
    copyStops: true,
    copyLimits: true,
    stopLimitMode: 'copy',
    safeGuardDaily: 3,
    safeGuardTotal: 10,
    safeGuardAction: 'pause',
    disabledSymbols: [],
    copyPendingOrders: false,
    copyTrailingStop: true,
    reverseMode: false,
    status: 'pending',
    currentDailyLoss: 0,
    currentTotalLoss: 0,
    pnlToday: 0,
    pnlMonth: 0,
    createdAt: '2026-03-25T14:32:00'
  },
  {
    id: 'psub2',
    userId: 'u3',
    userName: 'Luisa Ferreira',
    strategyId: 's2',
    strategyName: 'Trend Master FX',
    slaveAccountId: 'pa2',
    slaveAccountLogin: '66021',
    broker: 'Pepperstone',
    server: 'Pepperstone-MT5',
    platform: 'MT5',
    riskSetting: 'fixed_lot',
    riskValue: 0.05,
    copierMode: 'on',
    copyStops: true,
    copyLimits: true,
    stopLimitMode: 'copy',
    safeGuardDaily: 2,
    safeGuardTotal: 8,
    safeGuardAction: 'pause',
    disabledSymbols: [],
    copyPendingOrders: false,
    copyTrailingStop: true,
    reverseMode: false,
    status: 'pending',
    currentDailyLoss: 0,
    currentTotalLoss: 0,
    pnlToday: 0,
    pnlMonth: 0,
    createdAt: '2026-03-25T11:15:00'
  }
]

const defaultRiskSettings: GlobalRiskSettings = {
  allowedRiskModes: ['balance_percent', 'fixed_lot', 'lot_multiplier'],
  maxRiskPerTrade: 10,
  minLotGlobal: 0.01,
  maxLotGlobal: 100,
  defaultDailyLoss: 5,
  defaultTotalLoss: 10,
  resetTimeUTC: '00:00',
  autoPauseOnDailyLimit: true,
  closePositionsOnTotalLimit: true,
  notifyAt80Percent: false,
  copyStopLoss: true,
  copyPendingOrders: false,
  copyTrailingStop: true,
  reverseModeAvailable: false,
  excludedSymbols: []
}

interface AppState {
  // Auth
  user: User | null
  isAuthenticated: boolean
  
  // Data
  strategies: Strategy[]
  accounts: MTAccount[]
  subscriptions: CopySubscription[]
  pendingSubscriptions: CopySubscription[]
  trades: Trade[]
  groups: StrategyGroup[]
  globalRiskSettings: GlobalRiskSettings
  
  // UI
  activePanel: string
  toastMessage: string | null
  
  // Actions
  login: (role: 'client' | 'admin') => void
  /** Sincroniza utilizador a partir da sessão do site (Supabase / AuthContext). */
  syncFromSiteUser: (u: User) => void
  logout: () => void
  setActivePanel: (panel: string) => void
  showToast: (message: string) => void
  hideToast: () => void
  
  // Account actions
  addAccount: (account: Omit<MTAccount, "id">) => void
  removeAccount: (id: string) => void
  
  // Subscription actions
  createSubscription: (sub: Omit<CopySubscription, 'id' | 'status' | 'currentDailyLoss' | 'currentTotalLoss' | 'pnlToday' | 'pnlMonth' | 'createdAt'>) => void
  approveSubscription: (id: string) => void
  rejectSubscription: (id: string) => void
  updateSubscription: (id: string, updates: Partial<CopySubscription>) => void
  pauseSubscription: (id: string) => void
  resumeSubscription: (id: string) => void
  
  // Strategy actions (admin)
  createStrategy: (strategy: Omit<Strategy, 'id' | 'subscribers'>) => void
  updateStrategy: (id: string, updates: Partial<Strategy>) => void
  
  // Group actions (admin)
  createGroup: (group: Omit<StrategyGroup, 'id' | 'strategies' | 'slaves'>) => void
  
  // Risk settings (admin)
  updateRiskSettings: (settings: Partial<GlobalRiskSettings>) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      strategies: demoStrategies,
      accounts: demoAccounts,
      subscriptions: demoSubscriptions,
      pendingSubscriptions: demoPendingSubscriptions,
      trades: demoTrades,
      groups: demoGroups,
      globalRiskSettings: defaultRiskSettings,
      activePanel: 'dashboard',
      toastMessage: null,
      
      // Auth actions
      login: (role) => {
        const users: Record<string, User> = {
          client: { id: 'u1', name: 'Joao Costa', email: 'joao@gmail.com', initials: 'JC', role: 'client', createdAt: '2026-01-15' },
          admin: { id: 'admin', name: 'Admin Central', email: 'admin@mtmauto.com', initials: 'AC', role: 'admin', createdAt: '2025-01-01' }
        }
        set({ 
          user: users[role], 
          isAuthenticated: true,
          activePanel: role === 'admin' ? 'admin-dashboard' : 'dashboard'
        })
      },

      syncFromSiteUser: (siteUser) => {
        set((state) => {
          const prevId = state.user?.id
          const isNewUser = Boolean(prevId && prevId !== siteUser.id)
          const panel =
            isNewUser
              ? siteUser.role === "admin"
                ? "admin-dashboard"
                : "dashboard"
              : state.activePanel
          return {
            user: siteUser,
            isAuthenticated: true,
            activePanel: panel,
          }
        })
      },
      
      logout: () => set({ user: null, isAuthenticated: false, activePanel: 'dashboard' }),
      
      setActivePanel: (panel) => set({ activePanel: panel }),
      
      showToast: (message) => {
        set({ toastMessage: message })
        setTimeout(() => get().hideToast(), 4000)
      },
      
      hideToast: () => set({ toastMessage: null }),
      
      // Account actions
      addAccount: (account) => {
        const newAccount: MTAccount = {
          ...account,
          id: `acc_${Date.now()}`,
        }
        set((state) => ({ accounts: [...state.accounts, newAccount] }))
        get().showToast("Conta adicionada com sucesso!")
      },
      
      removeAccount: (id) => {
        set((state) => ({ accounts: state.accounts.filter(a => a.id !== id) }))
      },
      
      // Subscription actions
      createSubscription: (sub) => {
        const newSub: CopySubscription = {
          ...sub,
          id: `sub_${Date.now()}`,
          status: 'pending',
          currentDailyLoss: 0,
          currentTotalLoss: 0,
          pnlToday: 0,
          pnlMonth: 0,
          createdAt: new Date().toISOString()
        }
        set((state) => ({ pendingSubscriptions: [...state.pendingSubscriptions, newSub] }))
        get().showToast('Pedido de subscricao enviado! Aguarda aprovacao.')
      },
      
      approveSubscription: (id) => {
        const pending = get().pendingSubscriptions.find(s => s.id === id)
        if (pending) {
          const approved: CopySubscription = {
            ...pending,
            status: 'active',
            approvedAt: new Date().toISOString()
          }
          set((state) => ({
            pendingSubscriptions: state.pendingSubscriptions.filter(s => s.id !== id),
            subscriptions: [...state.subscriptions, approved]
          }))
          get().showToast('Subscricao aprovada e ativada!')
        }
      },
      
      rejectSubscription: (id) => {
        set((state) => ({
          pendingSubscriptions: state.pendingSubscriptions.filter(s => s.id !== id)
        }))
        get().showToast('Subscricao rejeitada.')
      },
      
      updateSubscription: (id, updates) => {
        set((state) => ({
          subscriptions: state.subscriptions.map(s => 
            s.id === id ? { ...s, ...updates } : s
          )
        }))
      },
      
      pauseSubscription: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.map(s =>
            s.id === id ? { ...s, copierMode: 'off' as const } : s
          )
        }))
      },
      
      resumeSubscription: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.map(s =>
            s.id === id ? { ...s, copierMode: 'on' as const } : s
          )
        }))
      },
      
      // Strategy actions
      createStrategy: (strategy) => {
        const newStrategy: Strategy = {
          ...strategy,
          id: `strat_${Date.now()}`,
          subscribers: 0
        }
        set((state) => ({ strategies: [...state.strategies, newStrategy] }))
        get().showToast('Estrategia criada com sucesso!')
      },
      
      updateStrategy: (id, updates) => {
        set((state) => ({
          strategies: state.strategies.map(s =>
            s.id === id ? { ...s, ...updates } : s
          )
        }))
      },
      
      // Group actions
      createGroup: (group) => {
        const newGroup: StrategyGroup = {
          ...group,
          id: `group_${Date.now()}`,
          strategies: 0,
          slaves: 0
        }
        set((state) => ({ groups: [...state.groups, newGroup] }))
        get().showToast('Grupo criado com sucesso!')
      },
      
      // Risk settings
      updateRiskSettings: (settings) => {
        set((state) => ({
          globalRiskSettings: { ...state.globalRiskSettings, ...settings }
        }))
        get().showToast('Configuracoes de risco atualizadas!')
      }
    }),
    {
      name: 'mtm-auto-storage',
      partialize: (state) => ({
        // Sessão vem sempre do site (Supabase); não persistir user para não duplicar login.
        activePanel: state.activePanel,
        accounts: state.accounts,
        subscriptions: state.subscriptions,
        globalRiskSettings: state.globalRiskSettings,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AppState>
        const mergedRisk = {
          ...currentState.globalRiskSettings,
          ...(persisted.globalRiskSettings ?? {}),
          allowedRiskModes: Array.isArray(persisted.globalRiskSettings?.allowedRiskModes)
            ? persisted.globalRiskSettings.allowedRiskModes
            : currentState.globalRiskSettings.allowedRiskModes,
          excludedSymbols: Array.isArray(persisted.globalRiskSettings?.excludedSymbols)
            ? persisted.globalRiskSettings.excludedSymbols
            : currentState.globalRiskSettings.excludedSymbols,
        }
        return {
          ...currentState,
          ...persisted,
          activePanel:
            typeof persisted.activePanel === 'string' && persisted.activePanel.trim()
              ? persisted.activePanel
              : currentState.activePanel,
          accounts: Array.isArray(persisted.accounts) ? persisted.accounts : currentState.accounts,
          subscriptions: Array.isArray(persisted.subscriptions)
            ? persisted.subscriptions
            : currentState.subscriptions,
          pendingSubscriptions: Array.isArray(persisted.pendingSubscriptions)
            ? persisted.pendingSubscriptions
            : currentState.pendingSubscriptions,
          strategies: Array.isArray(persisted.strategies) ? persisted.strategies : currentState.strategies,
          trades: Array.isArray(persisted.trades) ? persisted.trades : currentState.trades,
          groups: Array.isArray(persisted.groups) ? persisted.groups : currentState.groups,
          globalRiskSettings: mergedRisk,
        }
      },
    }
  )
)

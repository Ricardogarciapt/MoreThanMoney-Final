import { hasMtmProviderConfigured } from './provider-accounts'

const COPYFACTORY_BASE =
  process.env.METAAPI_COPYFACTORY_URL ??
  'https://copyfactory-api-v1.new-york.agiliumtrade.ai'

export type CopyFactoryTradeSizeScaling =
  | { mode: 'fixedRisk'; riskFraction: number; forceTinyTrades?: boolean; maxRiskCoefficient?: number }
  | { mode: 'fixedVolume'; tradeVolume: number; forceTinyTrades?: boolean; maxRiskCoefficient?: number }
  | { mode: 'balance'; forceTinyTrades?: boolean; maxRiskCoefficient?: number }
  | { mode: 'none' }

export type CopyFactorySymbolMapping = { from: string; to: string }

/** Mapeamentos canónicos provider → brokers comuns (ex. VT Markets XAUUSD-STD). */
export const DEFAULT_COPYFACTORY_SYMBOL_MAPPINGS: CopyFactorySymbolMapping[] = [
  { from: 'XAUUSD', to: 'XAUUSD-STD' },
]

export interface SubscriberOptions {
  accountId: string
  name: string
  strategyId: string
  multiplier?: number
  tradeSizeScaling?: CopyFactoryTradeSizeScaling
  reverse?: boolean
  copySl?: boolean
  copyTp?: boolean
  /** false = copiar limit, stop e ordens pendentes (default copy trader) */
  skipPendingOrders?: boolean
  symbolWhitelist?: string[] | null
  symbolMapping?: CopyFactorySymbolMapping[] | null
  riskLimits?: Array<{
    type: string
    applyTo: string
    closePositions: boolean
    maxRelativeRisk: number
  }>
}

export interface ProviderStrategyOptions {
  strategyId: string
  accountId: string
  name: string
  description?: string
  skipPendingOrders?: boolean
  copyStopLoss?: boolean
  copyTakeProfit?: boolean
  tradeSizeScaling?: Extract<CopyFactoryTradeSizeScaling, { mode: 'balance' }>
  riskLimits?: Array<{
    type: string
    applyTo: string
    closePositions: boolean
    maxRelativeRisk: number
  }>
}

export async function subscribeToStrategies(
  opts: Omit<SubscriberOptions, 'strategyId'> & {
    strategyIds: string[]
    freshSubscribe?: boolean
  },
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const { ensureMetaApiAccountOnline } = await import('./metaapi')
  const online = await ensureMetaApiAccountOnline(opts.accountId)
  if (!online.ok) return { ok: false, error: online.error ?? 'Conta MetaAPI offline' }

  if (opts.freshSubscribe) {
    await unsubscribeFromStrategy(opts.accountId)
  }

  const ids = [...new Set(opts.strategyIds.filter(Boolean))]
  if (!ids.length) {
    const fallback = process.env.METAAPI_COPY_STRATEGY_ID
    if (!fallback) return { ok: false, error: 'Nenhuma estratégia configurada' }
    ids.push(fallback)
  }

  const buildSubscriptions = (includeMapping: boolean, scalingOnly: boolean) =>
    ids.map((strategyId) => {
      const subscription: Record<string, unknown> = {
        strategyId,
        skipPendingOrders: opts.skipPendingOrders ?? false,
        copyStopLoss: opts.copySl !== false,
        copyTakeProfit: opts.copyTp !== false,
        reverse: opts.reverse ?? false,
      }
      if (opts.tradeSizeScaling && opts.tradeSizeScaling.mode !== 'none') {
        if (!scalingOnly || opts.tradeSizeScaling.mode === 'fixedVolume' || opts.tradeSizeScaling.mode === 'fixedRisk') {
          subscription.tradeSizeScaling = opts.tradeSizeScaling
        } else {
          subscription.multiplier = opts.multiplier ?? 1
        }
      } else {
        subscription.multiplier = opts.multiplier ?? 1
      }
      if (opts.symbolWhitelist?.length) {
        subscription.symbolFilter = { included: opts.symbolWhitelist }
      }
      if (includeMapping && opts.symbolMapping?.length) {
        subscription.symbolMapping = opts.symbolMapping
      }
      return subscription
    })

  const putBody = (subscriptions: Record<string, unknown>[]) => {
    const body: Record<string, unknown> = { name: opts.name, subscriptions }
    if (opts.riskLimits?.length) body.riskLimits = opts.riskLimits
    return body
  }

  const attempts: Array<{ includeMapping: boolean; scalingOnly: boolean }> = [
    { includeMapping: true, scalingOnly: false },
    { includeMapping: false, scalingOnly: false },
    { includeMapping: false, scalingOnly: true },
  ]

  let lastError = 'CopyFactory falhou'

  for (const attempt of attempts) {
    const res = await fetch(
      `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${opts.accountId}`,
      {
        method: 'PUT',
        headers: {
          'auth-token': token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(putBody(buildSubscriptions(attempt.includeMapping, attempt.scalingOnly))),
      },
    )

    if (res.status === 204 || res.ok) return { ok: true }

    const data = await res.json().catch(() => ({}))
    lastError =
      (data as { message?: string }).message ??
      (data as { error?: string }).error ??
      `CopyFactory HTTP ${res.status}`

    if (!lastError.includes('Validation failed')) break
  }

  return { ok: false, error: lastError }
}

export async function subscribeToStrategy(
  opts: SubscriberOptions,
): Promise<{ ok: boolean; error?: string }> {
  const strategyId = opts.strategyId || process.env.METAAPI_COPY_STRATEGY_ID
  if (!strategyId) {
    return { ok: false, error: 'METAAPI_COPY_STRATEGY_ID não configurado' }
  }
  return subscribeToStrategies({ ...opts, strategyIds: [strategyId] })
}

export async function unsubscribeFromStrategy(
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const res = await fetch(
    `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${accountId}`,
    {
      method: 'PUT',
      headers: {
        'auth-token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ subscriptions: [] }),
    },
  )

  if (res.status === 204 || res.ok) return { ok: true }

  const data = await res.json().catch(() => ({}))
  const message =
    (data as { message?: string }).message ??
    (data as { error?: string }).error ??
    `CopyFactory HTTP ${res.status}`
  return { ok: false, error: message }
}

export function isCopyFactoryEnabled(): boolean {
  return Boolean(process.env.METAAPI_TOKEN?.trim())
}

export function isMtmTelegramStrategyConfigured(): boolean {
  if (hasMtmProviderConfigured()) return true
  return Boolean(process.env.METAAPI_COPY_STRATEGY_ID?.trim())
}

export async function generateStrategyId(): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const res = await fetch(`${COPYFACTORY_BASE}/users/current/configuration/unused-strategy-id`, {
    headers: { 'auth-token': token, Accept: 'application/json' },
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return {
      ok: false,
      error: (data as { message?: string }).message ?? `CopyFactory HTTP ${res.status}`,
    }
  }

  const data = (await res.json()) as { id?: string }
  if (!data.id) return { ok: false, error: 'MetaAPI não devolveu strategy id' }
  return { ok: true, id: data.id }
}

/** Garante limit/stop/pending na estratégia provider (conta mestre copy trader). */
export async function upsertProviderStrategy(
  opts: ProviderStrategyOptions,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const res = await fetch(
    `${COPYFACTORY_BASE}/users/current/configuration/strategies/${opts.strategyId}`,
    {
      method: 'PUT',
      headers: {
        'auth-token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: opts.name,
        description: opts.description ?? 'Estratégia copy trader MTMcopier',
        accountId: opts.accountId,
        skipPendingOrders: opts.skipPendingOrders ?? false,
        copyStopLoss: opts.copyStopLoss !== false,
        copyTakeProfit: opts.copyTakeProfit !== false,
        ...(opts.tradeSizeScaling ? { tradeSizeScaling: opts.tradeSizeScaling } : {}),
        ...(opts.riskLimits?.length ? { riskLimits: opts.riskLimits } : {}),
      }),
    },
  )

  if (res.status === 204 || res.ok) return { ok: true }

  const data = await res.json().catch(() => ({}))
  const message =
    (data as { message?: string }).message ??
    (data as { error?: string }).error ??
    `CopyFactory HTTP ${res.status}`
  return { ok: false, error: message }
}

export async function getProviderAccountId(
  channel?: 'trade-ideas' | 'premium-signals',
): Promise<string | null> {
  if (channel) {
    const { getMtmProviderAccountId } = await import('./provider-accounts')
    return getMtmProviderAccountId(channel)
  }
  try {
    const { getSignalSourcesConfig } = await import('./signal-sources-config')
    const cfg = await getSignalSourcesConfig()
    if (cfg.provider_account_id) return cfg.provider_account_id
  } catch {
    /* ignore */
  }
  return (
    process.env.METAAPI_PROVIDER_PREMIUM_ACCOUNT_ID?.trim() ||
    process.env.METAAPI_PROVIDER_ACCOUNT_ID?.trim() ||
    null
  )
}

export async function ensureCopyTraderStrategy(
  opts: ProviderStrategyOptions,
): Promise<{ ok: boolean; error?: string }> {
  return upsertProviderStrategy({
    ...opts,
    skipPendingOrders: false,
    copyStopLoss: true,
    copyTakeProfit: true,
  })
}

const MTM_PROVIDER_RISK_LIMITS: ProviderStrategyOptions['riskLimits'] = [
  {
    type: 'day',
    applyTo: 'balance-difference',
    closePositions: true,
    maxRelativeRisk: 0.2,
  },
]

/** Estratégias MTM provider: scaling por saldo + micro-lotes quando abaixo do mínimo do broker. */
export async function ensureMtmProviderStrategyScaling(
  opts: Pick<ProviderStrategyOptions, 'strategyId' | 'accountId' | 'name' | 'description'> & {
    copyTakeProfit?: boolean
  },
): Promise<{ ok: boolean; error?: string }> {
  return upsertProviderStrategy({
    strategyId: opts.strategyId,
    accountId: opts.accountId,
    name: opts.name,
    description: opts.description ?? 'Estratégia MTM · scaling por saldo',
    skipPendingOrders: false,
    copyStopLoss: true,
    copyTakeProfit: opts.copyTakeProfit !== false,
    tradeSizeScaling: { mode: 'balance', forceTinyTrades: true },
    riskLimits: MTM_PROVIDER_RISK_LIMITS,
  })
}

export async function getSubscriberConfiguration(
  accountId: string,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const res = await fetch(
    `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${accountId}`,
    {
      headers: { 'auth-token': token, Accept: 'application/json' },
    },
  )

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return {
      ok: false,
      error: (data as { message?: string }).message ?? `CopyFactory HTTP ${res.status}`,
    }
  }

  const data = (await res.json()) as Record<string, unknown>
  return { ok: true, data }
}

export async function getCopyStrategyId(): Promise<string | null> {
  try {
    const { getSignalSourcesConfig } = await import('./signal-sources-config')
    const cfg = await getSignalSourcesConfig()
    if (cfg.provider_strategy_id) return cfg.provider_strategy_id
  } catch {
    /* ignore */
  }
  return process.env.METAAPI_COPY_STRATEGY_ID?.trim() || null
}

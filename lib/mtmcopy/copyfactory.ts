import { hasMtmProviderConfigured } from './provider-accounts'

const COPYFACTORY_BASE =
  process.env.METAAPI_COPYFACTORY_URL ??
  'https://copyfactory-api-v1.new-york.agiliumtrade.ai'

export interface SubscriberOptions {
  accountId: string
  name: string
  strategyId: string
  multiplier?: number
  reverse?: boolean
  copySl?: boolean
  copyTp?: boolean
  symbolWhitelist?: string[] | null
}

export async function subscribeToStrategies(
  opts: Omit<SubscriberOptions, 'strategyId'> & { strategyIds: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const ids = [...new Set(opts.strategyIds.filter(Boolean))]
  if (!ids.length) {
    const fallback = process.env.METAAPI_COPY_STRATEGY_ID
    if (!fallback) return { ok: false, error: 'Nenhuma estratégia configurada' }
    ids.push(fallback)
  }

  const subscriptions = ids.map((strategyId) => {
    const subscription: Record<string, unknown> = {
      strategyId,
      multiplier: opts.multiplier ?? 1,
      skipPendingOrders: false,
      reverse: opts.reverse ?? false,
    }
    if (opts.symbolWhitelist?.length) {
      subscription.symbolFilter = { included: opts.symbolWhitelist }
    }
    return subscription
  })

  const body = {
    name: opts.name,
    subscriptions,
  }

  const res = await fetch(
    `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${opts.accountId}`,
    {
      method: 'PUT',
      headers: {
        'auth-token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
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

export async function upsertProviderStrategy(opts: {
  strategyId: string
  accountId: string
  name: string
  description?: string
}): Promise<{ ok: boolean; error?: string }> {
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

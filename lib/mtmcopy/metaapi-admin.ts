const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ??
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

const COPYFACTORY_BASE =
  process.env.METAAPI_COPYFACTORY_URL ??
  'https://copyfactory-api-v1.new-york.agiliumtrade.ai'

function token(): string | null {
  return process.env.METAAPI_TOKEN?.trim() || null
}

async function metaapiFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const t = token()
  if (!t) throw new Error('METAAPI_TOKEN em falta')

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'auth-token': t,
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 204) return {} as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string }).message ?? `MetaAPI HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export interface MetaApiAccountSummary {
  id: string
  name: string
  login: string
  server: string
  platform: string
  state: string
  connectionStatus: string
  copyFactoryRoles: string[]
  region: string
}

export interface MetaApiOverview {
  configured: boolean
  accounts: MetaApiAccountSummary[]
  provisioningProfiles: Array<{
    id: string
    name: string
    version: number
    status: string
    type: string
  }>
  strategies: Array<{
    id: string
    name: string
    accountId: string
    description?: string
  }>
  subscribers: Array<{
    id: string
    name: string
    subscriptions: Array<{ strategyId: string; multiplier?: number }>
  }>
  regions: string[]
}

export async function fetchMetaApiOverview(): Promise<MetaApiOverview> {
  if (!token()) {
    return {
      configured: false,
      accounts: [],
      provisioningProfiles: [],
      strategies: [],
      subscribers: [],
      regions: [],
    }
  }

  const [accountsRaw, profilesRaw, strategiesRaw, subscribersRaw, regionsRaw] = await Promise.all([
    metaapiFetch<{ items?: unknown[] } | unknown[]>(PROVISIONING_BASE, '/users/current/accounts?limit=1000').catch(() => []),
    metaapiFetch<{ items?: unknown[] } | unknown[]>(
      PROVISIONING_BASE,
      '/users/current/provisioning-profiles?limit=200&type=mtTerminal',
    ).catch(() => []),
    metaapiFetch<{ items?: unknown[] } | unknown[]>(
      COPYFACTORY_BASE,
      '/users/current/configuration/strategies?limit=200',
    ).catch(() => []),
    metaapiFetch<{ items?: unknown[] } | unknown[]>(
      COPYFACTORY_BASE,
      '/users/current/configuration/subscribers?limit=200',
    ).catch(() => []),
    metaapiFetch<string[]>(PROVISIONING_BASE, '/users/current/regions').catch(() => []),
  ])

  const accountItems = Array.isArray(accountsRaw) ? accountsRaw : accountsRaw.items ?? []
  const profileItems = Array.isArray(profilesRaw) ? profilesRaw : profilesRaw.items ?? []
  const strategyItems = Array.isArray(strategiesRaw) ? strategiesRaw : strategiesRaw.items ?? []
  const subscriberItems = Array.isArray(subscribersRaw) ? subscribersRaw : subscribersRaw.items ?? []

  const accounts: MetaApiAccountSummary[] = accountItems.map((a: Record<string, unknown>) => ({
    id: String(a._id ?? a.id ?? ''),
    name: String(a.name ?? ''),
    login: String(a.login ?? ''),
    server: String(a.server ?? ''),
    platform: String(a.platform ?? a.type ?? 'mt5'),
    state: String(a.state ?? ''),
    connectionStatus: String(a.connectionStatus ?? ''),
    copyFactoryRoles: (a.copyFactoryRoles as string[]) ?? [],
    region: String(a.region ?? ''),
  }))

  return {
    configured: true,
    accounts,
    provisioningProfiles: profileItems.map((p: Record<string, unknown>) => ({
      id: String(p._id ?? p.id ?? ''),
      name: String(p.name ?? ''),
      version: Number(p.version ?? 0),
      status: String(p.status ?? ''),
      type: String(p.type ?? ''),
    })),
    strategies: strategyItems.map((s: Record<string, unknown>) => ({
      id: String(s._id ?? s.id ?? ''),
      name: String(s.name ?? ''),
      accountId: String(s.accountId ?? ''),
      description: s.description ? String(s.description) : undefined,
    })),
    subscribers: subscriberItems.map((s: Record<string, unknown>) => ({
      id: String(s._id ?? s.id ?? ''),
      name: String(s.name ?? ''),
      subscriptions: ((s.subscriptions as Array<Record<string, unknown>>) ?? []).map((sub) => ({
        strategyId: String(sub.strategyId ?? ''),
        multiplier: sub.multiplier != null ? Number(sub.multiplier) : undefined,
      })),
    })),
    regions: Array.isArray(regionsRaw) ? regionsRaw : [],
  }
}

export interface BrokerServerGroup {
  broker: string
  servers: string[]
}

export async function searchKnownMtServers(
  platform: 'mt4' | 'mt5',
  query: string,
): Promise<BrokerServerGroup[]> {
  const version = platform === 'mt4' ? 4 : 5
  const q = query.trim() || 'demo'
  const data = await metaapiFetch<Record<string, string[]>>(
    PROVISIONING_BASE,
    `/known-mt-servers/${version}/search?query=${encodeURIComponent(q)}`,
  )

  return Object.entries(data).map(([broker, servers]) => ({
    broker,
    servers: servers ?? [],
  }))
}

const POPULAR_BROKER_QUERIES = [
  'ic markets',
  'xm',
  'pepperstone',
  'fxpro',
  'exness',
  'admiral',
  'tickmill',
  'fusion',
  'vt markets',
  'roboforex',
  'octa',
  'fp markets',
  'hotforex',
  'eightcap',
  'axi',
  'fxtm',
  'alpari',
  'darwinex',
  'vantage',
  'global prime',
]

/** Pesquisa alargada — várias queries em paralelo, até maxBrokers corretoras. */
export async function searchKnownMtServersEnhanced(
  platform: 'mt4' | 'mt5',
  query: string,
  maxBrokers = 40,
): Promise<BrokerServerGroup[]> {
  const q = query.trim().toLowerCase()
  const queries: string[] = []

  if (q.length >= 2) {
    queries.push(q)
    for (const p of POPULAR_BROKER_QUERIES) {
      if (p.includes(q) || q.includes(p.split(' ')[0]!)) queries.push(p)
    }
  } else {
    queries.push(...POPULAR_BROKER_QUERIES.slice(0, 14))
  }

  const uniqueQueries = [...new Set(queries)].slice(0, 8)
  const merged = new Map<string, Set<string>>()

  await Promise.all(
    uniqueQueries.map(async (term) => {
      try {
        const groups = await searchKnownMtServers(platform, term)
        for (const g of groups) {
          if (!merged.has(g.broker)) merged.set(g.broker, new Set())
          const set = merged.get(g.broker)!
          for (const s of g.servers) set.add(s)
        }
      } catch {
        /* ignora falhas parciais */
      }
    }),
  )

  return [...merged.entries()]
    .slice(0, maxBrokers)
    .map(([broker, servers]) => ({
      broker,
      servers: [...servers].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.broker.localeCompare(b.broker))
}

import {
  generateStrategyId,
  isMtmTelegramStrategyConfigured,
  subscribeToStrategies,
  subscribeToStrategy,
  upsertProviderStrategy,
} from './copyfactory'
import type { MtmcopySenderMode } from './types'

export interface ProvisionRequest {
  login: string
  password: string
  server: string
  platform: 'mt4' | 'mt5'
  userId: string
  userLabel: string
  lotMultiplier?: number
  reverse?: boolean
  symbolWhitelist?: string[] | null
  /** Estratégia da conta mestre do utilizador (modo copy trader) */
  strategyId?: string | null
  /** Uma ou mais estratégias MTM (grupos / estratégia directa) */
  strategyIds?: string[]
  senderMode?: MtmcopySenderMode
}

export interface ProvisionResult {
  success: boolean
  accountId?: string
  error?: string
  copyfactorySubscribed?: boolean
  strategyId?: string
}

async function getApi() {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null
  const MetaApi = (await import('metaapi.cloud-sdk')).default
  return new (MetaApi as any)(token)
}

function last4(login: string): string {
  const digits = login.replace(/\D/g, '')
  return digits.slice(-4) || digits
}

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ??
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

async function fetchAvailableRegions(): Promise<string[]> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return []

  try {
    const res = await fetch(`${PROVISIONING_BASE}/users/current/regions`, {
      headers: { Accept: 'application/json', 'auth-token': token },
    })
    if (!res.ok) return []
    const regions = (await res.json()) as string[]
    return Array.isArray(regions) ? regions : []
  } catch {
    return []
  }
}

async function resolveMetaApiRegion(): Promise<string> {
  const available = await fetchAvailableRegions()
  const fromEnv = process.env.METAAPI_REGION?.trim()

  if (fromEnv && available.length && available.includes(fromEnv)) return fromEnv
  if (fromEnv && !available.length) return fromEnv
  if (available.includes('london')) return 'london'
  if (available.length) return available[0]
  return 'london'
}

export async function findExistingAccount(login: string, server: string) {
  const api = await getApi()
  if (!api) return null

  const accounts = await api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination({
    query: login.replace(/\D/g, ''),
  })

  return (
    accounts?.find(
      (a: { login?: string; server?: string }) =>
        a.login === login.replace(/\D/g, '') &&
        a.server?.toLowerCase() === server.trim().toLowerCase(),
    ) ?? null
  )
}

async function enableCopyFactoryRole(
  accountId: string,
  roles: Array<'PROVIDER' | 'SUBSCRIBER'>,
  slots = 1,
) {
  const token = process.env.METAAPI_TOKEN
  if (!token) return

  await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}/enable-copy-factory-api`, {
    method: 'POST',
    headers: {
      'auth-token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      copyFactoryRoles: roles,
      copyFactoryResourceSlots: slots,
    }),
  })
}

async function deployAccount(account: {
  deploy?: () => Promise<void>
  waitDeployed?: (t?: number) => Promise<void>
  waitConnected?: (t?: number) => Promise<void>
}) {
  await account.deploy?.()
  await account.waitDeployed?.(120)
  await account.waitConnected?.(120)
}

export async function provisionMasterAccount(req: ProvisionRequest): Promise<ProvisionResult> {
  const api = await getApi()
  if (!api) return { success: false, error: 'METAAPI_TOKEN em falta' }

  const login = req.login.replace(/\D/g, '')
  if (!login || !req.password || !req.server?.trim()) {
    return { success: false, error: 'Login, password e servidor são obrigatórios' }
  }

  const region = await resolveMetaApiRegion()
  let account: {
    id: string
    copyFactoryRoles?: string[]
    deploy?: () => Promise<void>
    waitDeployed?: (t?: number) => Promise<void>
    waitConnected?: (t?: number) => Promise<void>
    update?: (p: Record<string, unknown>) => Promise<void>
  }

  try {
    const existing = await findExistingAccount(login, req.server)
    if (existing) {
      account = await api.metatraderAccountApi.getAccount(existing.id)
      await account.update?.({
        password: req.password,
        server: req.server.trim(),
        name: req.userLabel,
      })
      const roles = account.copyFactoryRoles ?? []
      if (!roles.includes('PROVIDER')) {
        await enableCopyFactoryRole(account.id, ['PROVIDER'], 1)
      }
    } else {
      account = await api.metatraderAccountApi.createAccount({
        login,
        password: req.password,
        server: req.server.trim(),
        name: req.userLabel,
        platform: req.platform,
        type: 'cloud-g2',
        magic: 0,
        region,
        baseCurrency: 'USD',
        copyFactoryRoles: ['PROVIDER'],
        copyFactoryResourceSlots: 1,
        reliability: 'high',
        metadata: { mtmUserId: req.userId, mtmRole: 'master' },
      })
    }

    const accountId = account.id ?? (account as { _id?: string })._id
    if (!accountId) return { success: false, error: 'MetaAPI não devolveu account ID' }

    await deployAccount(account)

    const gen = await generateStrategyId()
    if (!gen.ok || !gen.id) {
      return { success: false, accountId, error: gen.error ?? 'Falha ao gerar estratégia CopyFactory' }
    }

    const strategy = await upsertProviderStrategy({
      strategyId: gen.id,
      accountId,
      name: req.userLabel,
      description: `Copy trader MTMcopier · utilizador ${req.userId.slice(0, 8)}`,
    })

    if (!strategy.ok) {
      return {
        success: false,
        accountId,
        strategyId: gen.id,
        error: `Conta criada mas estratégia falhou: ${strategy.error}`,
      }
    }

    return { success: true, accountId, strategyId: gen.id, copyfactorySubscribed: false }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao provisionar conta mestre'
    return { success: false, error: message }
  }
}

export async function provisionSlaveAccount(req: ProvisionRequest): Promise<ProvisionResult> {
  const api = await getApi()
  if (!api) return { success: false, error: 'METAAPI_TOKEN em falta' }

  const login = req.login.replace(/\D/g, '')
  if (!login || !req.password || !req.server?.trim()) {
    return { success: false, error: 'Login, password e servidor são obrigatórios' }
  }

  const senderMode = req.senderMode ?? 'telegram'

  let resolvedStrategyIds: string[] = []
  if (req.strategyIds?.length) {
    resolvedStrategyIds = [...new Set(req.strategyIds.filter(Boolean))]
  } else if (senderMode === 'master_account' && req.strategyId) {
    resolvedStrategyIds = [req.strategyId]
  } else if (senderMode === 'telegram') {
    const fallback =
      (await (await import('./copyfactory')).getCopyStrategyId()) ??
      process.env.METAAPI_COPY_STRATEGY_ID ??
      ''
    if (fallback) resolvedStrategyIds = [fallback]
  }

  if (senderMode === 'master_account' && !resolvedStrategyIds.length) {
    return { success: false, error: 'Liga primeiro a conta mestre (estratégia em falta)' }
  }

  if (senderMode === 'telegram' && !isMtmTelegramStrategyConfigured() && !resolvedStrategyIds.length) {
    return { success: false, error: 'Estratégia MTM não configurada no servidor' }
  }

  const region = await resolveMetaApiRegion()
  let account: {
    id: string
    copyFactoryRoles?: string[]
    deploy?: () => Promise<void>
    waitDeployed?: (t?: number) => Promise<void>
    waitConnected?: (t?: number) => Promise<void>
    update?: (p: Record<string, unknown>) => Promise<void>
  }

  try {
    const existing = await findExistingAccount(login, req.server)
    if (existing) {
      account = await api.metatraderAccountApi.getAccount(existing.id)
      await account.update?.({
        password: req.password,
        server: req.server.trim(),
        name: req.userLabel,
      })
      const roles = account.copyFactoryRoles ?? []
      if (!roles.includes('SUBSCRIBER')) {
        await enableCopyFactoryRole(account.id, ['SUBSCRIBER'], 1)
      }
    } else {
      account = await api.metatraderAccountApi.createAccount({
        login,
        password: req.password,
        server: req.server.trim(),
        name: req.userLabel,
        platform: req.platform,
        type: 'cloud-g2',
        magic: 0,
        region,
        baseCurrency: 'USD',
        copyFactoryRoles: ['SUBSCRIBER'],
        copyFactoryResourceSlots: 1,
        reliability: 'high',
        metadata: { mtmUserId: req.userId, mtmRole: 'slave' },
      })
    }

    const accountId = account.id ?? (account as { _id?: string })._id
    if (!accountId) return { success: false, error: 'MetaAPI não devolveu account ID' }

    await deployAccount(account)

    const sub = await subscribeToStrategies({
      accountId,
      name: req.userLabel,
      strategyIds: resolvedStrategyIds,
      multiplier: req.lotMultiplier ?? 1,
      reverse: req.reverse ?? false,
      symbolWhitelist: req.symbolWhitelist,
    })

    if (!sub.ok) {
      return {
        success: false,
        accountId,
        error: `Conta criada mas CopyFactory falhou: ${sub.error}`,
      }
    }

    return { success: true, accountId, copyfactorySubscribed: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao provisionar conta MetaAPI'
    return { success: false, error: message }
  }
}

export { last4 }

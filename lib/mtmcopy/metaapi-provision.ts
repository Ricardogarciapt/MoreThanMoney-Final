import {
  generateStrategyId,
  isMtmTelegramStrategyConfigured,
  subscribeToStrategies,
  unsubscribeFromStrategy,
  upsertProviderStrategy,
} from './copyfactory'
import type { MtmcopyCopyMethod } from './copy-methods'
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
  copySl?: boolean
  copyTp?: boolean
  skipPendingOrders?: boolean
  /** Grupos / estratégia MTM: só MetaAPI directo, sem subscrição CopyFactory */
  copyMethod?: MtmcopyCopyMethod
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

/** Magic MT5 para ordens MTMcopier (MetaAPI exige magic > 0 excepto manualTrades). */
const MTM_COPIER_MAGIC = 826_431

type MetaApiErrDetails =
  | string
  | {
      code?: string
      recommendedResourceSlots?: number
      serversByBrokers?: Record<string, string[]>
    }

function extractBrokerKeywords(server: string): string[] {
  const trimmed = server.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/[-_\s]+/).filter((p) => p.length >= 2)
  const brokerish = trimmed.replace(/-(Demo|Live|Real|MT4|MT5)$/i, '').trim()
  return [...new Set([brokerish, ...parts])].slice(0, 5)
}

export function formatMetaApiProvisionError(err: unknown): string {
  const e = err as { message?: string; details?: MetaApiErrDetails }
  const details = e.details

  if (typeof details === 'string') {
    if (details === 'E_AUTH') {
      return 'Credenciais MT5 inválidas — confirma login, password e servidor.'
    }
    if (details === 'E_SERVER_TIMEZONE') {
      return 'MetaAPI não conseguiu detectar o broker — tenta novamente em 1–2 minutos.'
    }
    if (details === 'E_NO_SYMBOLS') {
      return 'Conta MT5 sem símbolos configurados — contacta o broker.'
    }
    if (details === 'ERR_OTP_REQUIRED') {
      return 'A conta exige OTP — desactiva no app MT5 ou usa outra conta.'
    }
    if (details === 'E_PASSWORD_CHANGE_REQUIRED') {
      return 'O broker exige alteração de password — muda no MT5 e tenta de novo.'
    }
    if (details === 'E_TRADING_ACCOUNT_DISABLED') {
      return 'Conta MT5 desactivada no broker.'
    }
  }

  if (details && typeof details === 'object') {
    if (details.code === 'E_RESOURCE_SLOTS') {
      const n = details.recommendedResourceSlots
      return n
        ? `Esta conta precisa de ${n} resource slots na MetaAPI — tenta novamente (ajuste automático).`
        : 'Resource slots insuficientes na MetaAPI para este broker.'
    }
    if (details.code === 'E_SRV_NOT_FOUND') {
      const suggestions = Object.values(details.serversByBrokers ?? {})
        .flat()
        .slice(0, 4)
      if (suggestions.length) {
        return `Servidor MT5 não encontrado. Sugestões: ${suggestions.join(', ')}`
      }
      return 'Servidor MT5 não encontrado — escolhe o nome exacto na lista de corretoras.'
    }
  }

  const msg = e.message ?? 'Erro ao criar conta MetaAPI'
  if (/validation failed/i.test(msg) && !details) {
    return `${msg} — verifica login, password, servidor MT5 e que a conta não exige OTP.`
  }
  return msg
}

function recommendedResourceSlots(err: unknown): number | null {
  const details = (err as { details?: MetaApiErrDetails })?.details
  if (details && typeof details === 'object' && details.code === 'E_RESOURCE_SLOTS') {
    const n = details.recommendedResourceSlots
    return typeof n === 'number' && n > 0 ? n : null
  }
  return null
}

type CreateAccountPayload = Record<string, unknown>

function buildSlaveCreatePayload(
  req: ProvisionRequest,
  region: string,
  directOnly: boolean,
  resourceSlots: number,
): CreateAccountPayload {
  const login = req.login.replace(/\D/g, '')
  const payload: CreateAccountPayload = {
    login,
    password: req.password,
    server: req.server.trim(),
    name: req.userLabel,
    platform: req.platform,
    type: 'cloud-g2',
    magic: MTM_COPIER_MAGIC,
    region,
    baseCurrency: 'USD',
    reliability: 'high',
    resourceSlots,
    keywords: extractBrokerKeywords(req.server),
    metadata: { mtmUserId: req.userId, mtmRole: 'slave' },
  }

  if (!directOnly) {
    payload.copyFactoryRoles = ['SUBSCRIBER']
    payload.copyFactoryResourceSlots = 1
  }

  return payload
}

function buildMasterCreatePayload(req: ProvisionRequest, region: string, resourceSlots: number): CreateAccountPayload {
  const login = req.login.replace(/\D/g, '')
  return {
    login,
    password: req.password,
    server: req.server.trim(),
    name: req.userLabel,
    platform: req.platform,
    type: 'cloud-g2',
    magic: MTM_COPIER_MAGIC,
    region,
    baseCurrency: 'USD',
    reliability: 'high',
    resourceSlots,
    keywords: extractBrokerKeywords(req.server),
    copyFactoryRoles: ['PROVIDER'],
    copyFactoryResourceSlots: 1,
    metadata: { mtmUserId: req.userId, mtmRole: 'master' },
  }
}

async function createAccountWithResourceRetry(
  api: Awaited<ReturnType<typeof getApi>>,
  payload: CreateAccountPayload,
): Promise<{ id: string; copyFactoryRoles?: string[]; deploy?: () => Promise<void>; waitDeployed?: (t?: number) => Promise<void>; waitConnected?: (t?: number) => Promise<void>; update?: (p: Record<string, unknown>) => Promise<void> }> {
  if (!api) throw new Error('MetaAPI indisponível')

  let resourceSlots = Number(payload.resourceSlots) || 1
  const maxAttempts = 4

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await api.metatraderAccountApi.createAccount({ ...payload, resourceSlots })
    } catch (err: unknown) {
      const recommended = recommendedResourceSlots(err)
      if (recommended && recommended > resourceSlots && attempt < maxAttempts - 1) {
        resourceSlots = recommended
        continue
      }
      throw err
    }
  }

  throw new Error('Falha ao criar conta MetaAPI após várias tentativas')
}

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
      account = await createAccountWithResourceRetry(
        api,
        buildMasterCreatePayload(req, region, 1),
      )
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
      skipPendingOrders: false,
      copyStopLoss: true,
      copyTakeProfit: true,
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
    return { success: false, error: formatMetaApiProvisionError(err) }
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
  const directOnly =
    req.copyMethod === 'telegram_group' || req.copyMethod === 'strategy'

  let resolvedStrategyIds: string[] = []
  if (req.strategyIds?.length) {
    resolvedStrategyIds = [...new Set(req.strategyIds.filter(Boolean))]
  } else if (senderMode === 'master_account' && req.strategyId) {
    resolvedStrategyIds = [req.strategyId]
  } else if (senderMode === 'telegram' && !directOnly) {
    const fallback =
      (await (await import('./copyfactory')).getCopyStrategyId()) ??
      process.env.METAAPI_COPY_STRATEGY_ID ??
      ''
    if (fallback) resolvedStrategyIds = [fallback]
  }

  if (senderMode === 'master_account' && !resolvedStrategyIds.length) {
    return { success: false, error: 'Liga primeiro a conta mestre (estratégia em falta)' }
  }

  if (
    !directOnly &&
    senderMode === 'telegram' &&
    !isMtmTelegramStrategyConfigured() &&
    !resolvedStrategyIds.length
  ) {
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
      if (!directOnly) {
        const roles = account.copyFactoryRoles ?? []
        if (!roles.includes('SUBSCRIBER')) {
          await enableCopyFactoryRole(account.id, ['SUBSCRIBER'], 1)
        }
      }
    } else {
      account = await createAccountWithResourceRetry(
        api,
        buildSlaveCreatePayload(req, region, directOnly, 1),
      )
    }

    const accountId = account.id ?? (account as { _id?: string })._id
    if (!accountId) return { success: false, error: 'MetaAPI não devolveu account ID' }

    await deployAccount(account)

    if (directOnly) {
      await unsubscribeFromStrategy(accountId).catch(() => undefined)
      return { success: true, accountId, copyfactorySubscribed: false }
    }

    const sub = await subscribeToStrategies({
      accountId,
      name: req.userLabel,
      strategyIds: resolvedStrategyIds,
      multiplier: req.lotMultiplier ?? 1,
      reverse: req.reverse ?? false,
      symbolWhitelist: req.symbolWhitelist,
      copySl: req.copySl,
      copyTp: req.copyTp,
      skipPendingOrders: req.skipPendingOrders ?? false,
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
    return { success: false, error: formatMetaApiProvisionError(err) }
  }
}

export { last4 }

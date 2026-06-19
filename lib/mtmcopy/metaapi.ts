import type { TrailingDistance } from './pip-points'
import { convertTrailingToRelativePoints } from './pip-points'
import { resolveBrokerSymbol } from './symbol-resolver'

export interface OrderRequest {
  accountId: string
  symbol: string
  direction: 'buy' | 'sell'
  volume: number
  orderType?: 'market' | 'limit'
  openPrice?: number | null
  stopLoss?: number | null
  takeProfit?: number | null
  comment?: string
  /** Trailing stop server-side (pips ou points conforme broker) */
  trailingStop?: TrailingDistance | null
  /** @deprecated usar trailingStop — distância em RELATIVE_POINTS */
  trailingStopPoints?: number | null
}

export interface OrderResult {
  success: boolean
  orderId?: string
  brokerSymbol?: string
  error?: string
}

type RpcConnection = {
  connect: () => Promise<void>
  waitSynchronized: () => Promise<void>
  getSymbols: () => Promise<string[]>
  getSymbolSpecification?: (symbol: string) => Promise<MetaApiSymbolSpecification>
  getAccountInformation: () => Promise<{ balance?: number; equity?: number }>
  getSymbolPrice?: (symbol: string) => Promise<{ bid?: number; ask?: number }>
  createMarketBuyOrder: (
    symbol: string,
    volume: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string; trailingStopLoss?: TrailingStopLossOptions },
  ) => Promise<{ orderId?: string; positionId?: string }>
  createMarketSellOrder: (
    symbol: string,
    volume: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string; trailingStopLoss?: TrailingStopLossOptions },
  ) => Promise<{ orderId?: string; positionId?: string }>
  createLimitBuyOrder: (
    symbol: string,
    volume: number,
    openPrice: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string },
  ) => Promise<{ orderId?: string; positionId?: string }>
  createLimitSellOrder: (
    symbol: string,
    volume: number,
    openPrice: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string },
  ) => Promise<{ orderId?: string; positionId?: string }>
  getPositions: () => Promise<MetaApiPosition[]>
  getOrders?: () => Promise<MetaApiPendingOrder[]>
  cancelOrder?: (orderId: string) => Promise<unknown>
  modifyPosition: (
    positionId: string,
    stopLoss?: number,
    takeProfit?: number,
    options?: { trailingStopLoss?: TrailingStopLossOptions },
  ) => Promise<unknown>
  closePosition: (positionId: string, options?: { volume?: number }) => Promise<unknown>
  closePositionsBySymbol: (symbol: string) => Promise<unknown>
  close: () => Promise<void>
}

type TrailingStopLossOptions = {
  distance?: { distance: number; units: 'RELATIVE_POINTS' | 'RELATIVE_PIPS' }
  threshold?: {
    thresholds: Array<{ threshold: number; stopLoss: number }>
    units: 'RELATIVE_POINTS' | 'RELATIVE_PIPS'
    stopPriceBase: 'CURRENT_PRICE' | 'OPEN_PRICE'
  }
}

export interface MetaApiSymbolSpecification {
  point: number
  pipSize?: number
  digits?: number
}

export interface MetaApiPosition {
  id: string
  symbol: string
  type: string
  openPrice: number
  volume?: number
  currentPrice?: number
  stopLoss?: number
  takeProfit?: number
  comment?: string
}

export interface MetaApiPendingOrder {
  id: string
  symbol: string
  type: string
  state?: string
  comment?: string
}

export function buildTrailingOptions(
  input: TrailingDistance | number | null | undefined,
): TrailingStopLossOptions | undefined {
  if (input == null) return undefined

  if (typeof input === 'number') {
    if (input <= 0) return undefined
    return { distance: { distance: Math.round(input), units: 'RELATIVE_POINTS' } }
  }

  if (input.mode === 'pips' && input.pips > 0) {
    return { distance: { distance: input.pips, units: 'RELATIVE_PIPS' } }
  }

  if (input.mode === 'points' && input.points > 0) {
    return { distance: { distance: Math.round(input.points), units: 'RELATIVE_POINTS' } }
  }

  if (input.mode === 'threshold_pips' && input.activationPips > 0 && input.trailPips > 0) {
    return {
      threshold: {
        thresholds: [{ threshold: input.activationPips, stopLoss: input.trailPips }],
        units: 'RELATIVE_PIPS',
        stopPriceBase: 'CURRENT_PRICE',
      },
    }
  }

  if (input.mode === 'threshold_points' && input.activationPoints > 0 && input.trailPoints > 0) {
    return {
      threshold: {
        thresholds: [{ threshold: input.activationPoints, stopLoss: input.trailPoints }],
        units: 'RELATIVE_POINTS',
        stopPriceBase: 'CURRENT_PRICE',
      },
    }
  }

  return undefined
}

async function resolveOrderTrailingForSymbol(
  req: OrderRequest,
  brokerSymbol: string,
  spec?: MetaApiSymbolSpecification | null,
): Promise<TrailingStopLossOptions | undefined> {
  const raw =
    req.trailingStop ??
    (req.trailingStopPoints != null && req.trailingStopPoints > 0
      ? { mode: 'points' as const, points: req.trailingStopPoints }
      : null)
  if (raw == null) return undefined

  let symbolSpec = spec
  if (!symbolSpec) {
    symbolSpec = await getSymbolSpecification(req.accountId, brokerSymbol)
  }

  const normalized =
    symbolSpec && typeof raw !== 'number' && (raw.mode === 'pips' || raw.mode === 'threshold_pips')
      ? convertTrailingToRelativePoints(raw, symbolSpec, req.symbol)
      : symbolSpec && typeof raw === 'number'
        ? convertTrailingToRelativePoints(raw, symbolSpec, req.symbol)
        : raw

  return buildTrailingOptions(normalized)
}

function buildOrderOptions(
  req: OrderRequest,
  trailingOpts?: TrailingStopLossOptions,
): { comment?: string; trailingStopLoss?: TrailingStopLossOptions } {
  const options: { comment?: string; trailingStopLoss?: TrailingStopLossOptions } = {
    comment: (req.comment ?? 'MTMcopier').slice(0, 31),
  }
  if (trailingOpts) options.trailingStopLoss = trailingOpts
  return options
}

const CONNECT_TIMEOUT_MS = 55_000
const CONNECT_MAX_ATTEMPTS = 3

function isRetryableMetaApiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('timeout') ||
    msg.includes('not connected') ||
    msg.includes('disconnected') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Tenta redeploy + waitConnected quando a conta MetaAPI está offline. */
export async function ensureMetaApiAccountOnline(accountId: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  try {
    const MetaApi = (await import('metaapi.cloud-sdk')).default
    const api = new (MetaApi as any)(token)
    const account = await api.metatraderAccountApi.getAccount(accountId)
    const state = String(account.state ?? '').toUpperCase()
    if (state && state !== 'DEPLOYED') {
      await account.deploy?.()
      await withTimeout(account.waitDeployed?.(120) ?? Promise.resolve(), 120_000, 'MetaApi waitDeployed')
    }
    await withTimeout(account.waitConnected?.(120) ?? account.waitConnected(), 120_000, 'MetaApi waitConnected')
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Conta MetaAPI offline'
    return { ok: false, error: message }
  }
}

async function placeOrderOnConnection(
  connection: RpcConnection,
  symbols: string[],
  specCache: Map<string, MetaApiSymbolSpecification | null>,
  req: OrderRequest,
): Promise<OrderResult> {
  try {
    const brokerSymbol = resolveBrokerSymbol(req.symbol, symbols)
    const sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    const tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined

    let spec = specCache.get(brokerSymbol)
    if (spec === undefined) {
      if (connection.getSymbolSpecification) {
        try {
          const raw = await connection.getSymbolSpecification(brokerSymbol)
          spec = raw?.point ? { point: raw.point, pipSize: raw.pipSize, digits: raw.digits } : null
        } catch {
          spec = null
        }
      } else {
        spec = null
      }
      specCache.set(brokerSymbol, spec)
    }

    const trailingOpts = await resolveOrderTrailingForSymbol(req, brokerSymbol, spec)
    const orderOptions = buildOrderOptions(req, trailingOpts)

    if (req.orderType === 'limit') {
      const openPrice = req.openPrice
      if (openPrice == null || openPrice <= 0) {
        return { success: false, error: 'Preço LIMIT em falta' }
      }
      const trade =
        req.direction === 'buy'
          ? await connection.createLimitBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
          : await connection.createLimitSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
      return {
        success: true,
        orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
        brokerSymbol,
      }
    }

    const trade =
      req.direction === 'buy'
        ? await connection.createMarketBuyOrder(brokerSymbol, req.volume, sl, tp, orderOptions)
        : await connection.createMarketSellOrder(brokerSymbol, req.volume, sl, tp, orderOptions)

    return {
      success: true,
      orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
      brokerSymbol,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao executar ordem no MT5'
    return { success: false, error: message }
  }
}

/** Uma ligação RPC — várias ordens em série (Premium 3 legs, evita 3× waitConnected). */
export async function placeOrdersSequential(accountId: string, requests: OrderRequest[]): Promise<OrderResult[]> {
  if (!requests.length) return []

  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const symbols = await connection.getSymbols()
    const specCache = new Map<string, MetaApiSymbolSpecification | null>()
    const results: OrderResult[] = []

    for (const req of requests) {
      results.push(await placeOrderOnConnection(connection, symbols, specCache, req))
    }

    return results
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao ligar MetaAPI'
    return requests.map(() => ({ success: false, error: message }))
  } finally {
    if (close) await close()
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

async function getRpcConnection(
  accountId: string,
  attempt = 0,
): Promise<{
  connection: RpcConnection
  close: () => Promise<void>
}> {
  const token = process.env.METAAPI_TOKEN
  if (!token) throw new Error('MetaApi não configurado (METAAPI_TOKEN em falta)')

  try {
    const MetaApi = (await import('metaapi.cloud-sdk')).default
    const api = new (MetaApi as any)(token)
    const account = await api.metatraderAccountApi.getAccount(accountId)

    await withTimeout(account.waitConnected(), CONNECT_TIMEOUT_MS, 'MetaApi waitConnected')

    const connection = account.getRPCConnection() as RpcConnection
    await withTimeout(connection.connect(), CONNECT_TIMEOUT_MS, 'MetaApi RPC connect')
    await withTimeout(connection.waitSynchronized(), CONNECT_TIMEOUT_MS, 'MetaApi RPC sync')

    return {
      connection,
      close: async () => {
        try {
          await connection.close()
        } catch {
          /* ignore */
        }
      },
    }
  } catch (err: unknown) {
    if (attempt < CONNECT_MAX_ATTEMPTS - 1 && isRetryableMetaApiError(err)) {
      console.warn(
        `[mtmcopy] MetaAPI retry ${attempt + 1}/${CONNECT_MAX_ATTEMPTS - 1} (${accountId.slice(0, 8)}…):`,
        err instanceof Error ? err.message : err,
      )
      await ensureMetaApiAccountOnline(accountId)
      await sleep(1500 * (attempt + 1))
      return getRpcConnection(accountId, attempt + 1)
    }
    throw err
  }
}

export interface AccountSnapshot {
  balance: number | null
  equity: number | null
}

export async function getAccountSnapshot(accountId: string): Promise<AccountSnapshot | null> {
  let close: (() => Promise<void>) | undefined
  try {
    const rpc = await getRpcConnection(accountId)
    close = rpc.close
    const info = await rpc.connection.getAccountInformation()
    const balance = info.balance ?? null
    const equity = info.equity ?? null
    if (balance == null && equity == null) return null
    return { balance, equity }
  } catch {
    return null
  } finally {
    if (close) await close()
  }
}

const balanceCache = new Map<string, { balance: number; at: number }>()
const BALANCE_CACHE_MS = 45_000
const BALANCE_FETCH_RETRIES = 4

export interface LotSizingMarketContext {
  balance: number | null
  marketPrice: number | null
}

function pickBalance(info: { balance?: number; equity?: number }): number | null {
  const balance = info.balance ?? info.equity ?? null
  return balance != null && balance > 0 ? balance : null
}

function cacheBalance(accountId: string, balance: number) {
  balanceCache.set(accountId, { balance, at: Date.now() })
}

export async function getAccountBalance(
  accountId: string,
  retries = BALANCE_FETCH_RETRIES,
  options?: { forceRefresh?: boolean },
): Promise<number | null> {
  const cached = balanceCache.get(accountId)
  if (!options?.forceRefresh && cached && Date.now() - cached.at < BALANCE_CACHE_MS) {
    return cached.balance
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const snap = await getAccountSnapshot(accountId)
    const balance = snap?.balance ?? snap?.equity ?? null
    if (balance != null && balance > 0) {
      cacheBalance(accountId, balance)
      return balance
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  return cached?.balance ?? null
}

/**
 * Uma ligação MetaAPI para saldo + preço de mercado (gestão de risco %).
 * Evita falhas por timeout em chamadas separadas antes de calcular o lote.
 */
export async function fetchLotSizingContext(
  accountId: string,
  symbol: string,
  direction: 'buy' | 'sell',
): Promise<LotSizingMarketContext> {
  let close: (() => Promise<void>) | undefined
  try {
    const rpc = await getRpcConnection(accountId)
    close = rpc.close

    let balance: number | null = null
    for (let attempt = 0; attempt <= BALANCE_FETCH_RETRIES; attempt++) {
      const info = await rpc.connection.getAccountInformation()
      balance = pickBalance(info)
      if (balance != null) {
        cacheBalance(accountId, balance)
        break
      }
      if (attempt < BALANCE_FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }

    let marketPrice: number | null = null
    if (symbol.trim() && rpc.connection.getSymbolPrice) {
      try {
        const symbols = await rpc.connection.getSymbols()
        const brokerSymbol = resolveBrokerSymbol(symbol, symbols)
        const tick = await rpc.connection.getSymbolPrice(brokerSymbol)
        const bid = tick?.bid
        const ask = tick?.ask
        if (direction === 'buy' && ask != null && ask > 0) marketPrice = ask
        else if (direction === 'sell' && bid != null && bid > 0) marketPrice = bid
        else marketPrice = bid ?? ask ?? null
      } catch {
        /* preço opcional — SL/TP do sinal podem bastar */
      }
    }

    return { balance, marketPrice }
  } catch (err) {
    console.warn('[mtmcopy] fetchLotSizingContext falhou:', err)
    const cached = balanceCache.get(accountId)
    return { balance: cached?.balance ?? null, marketPrice: null }
  } finally {
    if (close) await close()
  }
}

export async function placeMarketOrder(req: OrderRequest): Promise<OrderResult> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(req.accountId)
    close = closeFn

    const symbols = await connection.getSymbols()
    const brokerSymbol = resolveBrokerSymbol(req.symbol, symbols)

    const sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    const tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined

    const trailingOpts = await resolveOrderTrailingForSymbol(req, brokerSymbol)
    const orderOptions = buildOrderOptions(req, trailingOpts)

    const trade =
      req.direction === 'buy'
        ? await connection.createMarketBuyOrder(brokerSymbol, req.volume, sl, tp, orderOptions)
        : await connection.createMarketSellOrder(brokerSymbol, req.volume, sl, tp, orderOptions)

    return {
      success: true,
      orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
      brokerSymbol,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao executar ordem no MT5'
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

export async function placeLimitOrder(req: OrderRequest): Promise<OrderResult> {
  let close: (() => Promise<void>) | undefined
  try {
    const openPrice = req.openPrice
    if (openPrice == null || openPrice <= 0) {
      return { success: false, error: 'Preço LIMIT em falta' }
    }

    const { connection, close: closeFn } = await getRpcConnection(req.accountId)
    close = closeFn

    const symbols = await connection.getSymbols()
    const brokerSymbol = resolveBrokerSymbol(req.symbol, symbols)

    const sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    const tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined
    const orderOptions = { comment: req.comment ?? 'MTMcopier' }

    const trade =
      req.direction === 'buy'
        ? await connection.createLimitBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
        : await connection.createLimitSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)

    return {
      success: true,
      orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
      brokerSymbol,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao colocar ordem LIMIT no MT5'
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

export async function placeOrder(req: OrderRequest): Promise<OrderResult> {
  if (req.orderType === 'limit') return placeLimitOrder(req)
  return placeMarketOrder(req)
}

export async function checkAccountHealth(accountId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await getRpcConnection(accountId).then(async ({ close }) => close())
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Conta MT5 inacessível'
    return { ok: false, error: message }
  }
}

export function isMetaApiConfigured(): boolean {
  return Boolean(process.env.METAAPI_TOKEN?.trim())
}

export async function listOpenPositions(accountId: string): Promise<MetaApiPosition[]> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const positions = await connection.getPositions()
    return (positions ?? []) as MetaApiPosition[]
  } catch {
    return []
  } finally {
    if (close) await close()
  }
}

export async function getSymbolSpecification(
  accountId: string,
  canonicalSymbol: string,
): Promise<MetaApiSymbolSpecification | null> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    if (!connection.getSymbolSpecification) return null

    const symbols = await connection.getSymbols()
    const brokerSymbol = resolveBrokerSymbol(canonicalSymbol, symbols)
    const spec = await connection.getSymbolSpecification(brokerSymbol)
    if (!spec?.point) return null
    return {
      point: spec.point,
      pipSize: spec.pipSize,
      digits: spec.digits,
    }
  } catch {
    return null
  } finally {
    if (close) await close()
  }
}

export async function modifyPositionSlTp(
  accountId: string,
  positionId: string,
  stopLoss?: number | null,
  takeProfit?: number | null,
  trailing?: TrailingDistance | number | null,
  symbol?: string,
): Promise<{ success: boolean; error?: string }> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const sl = stopLoss != null && stopLoss > 0 ? stopLoss : undefined
    const tp = takeProfit != null && takeProfit > 0 ? takeProfit : undefined
    let trailingResolved: TrailingDistance | number | null | undefined = trailing
    if (trailing && symbol) {
      const spec = await getSymbolSpecification(accountId, symbol)
      if (spec && typeof trailing !== 'number' && (trailing.mode === 'pips' || trailing.mode === 'threshold_pips')) {
        trailingResolved = convertTrailingToRelativePoints(trailing, spec, symbol)
      }
    }
    const trailingOpts = buildTrailingOptions(trailingResolved)
    await connection.modifyPosition(positionId, sl, tp, trailingOpts ? { trailingStopLoss: trailingOpts } : undefined)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao modificar posição'
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

export async function closePositionById(
  accountId: string,
  positionId: string,
  volume?: number,
): Promise<{ success: boolean; error?: string }> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    if (volume != null && volume > 0) {
      await connection.closePosition(positionId, { volume })
    } else {
      await connection.closePosition(positionId)
    }
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao fechar posição'
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

export async function closePositionsForSymbol(
  accountId: string,
  brokerSymbol: string,
): Promise<{ success: boolean; error?: string }> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    await connection.closePositionsBySymbol(brokerSymbol)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao fechar posições'
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

export async function listPendingOrders(accountId: string): Promise<MetaApiPendingOrder[]> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    if (!connection.getOrders) return []
    const orders = await connection.getOrders()
    return (orders ?? []) as MetaApiPendingOrder[]
  } catch {
    return []
  } finally {
    if (close) await close()
  }
}

export async function cancelPendingOrdersForSymbol(
  accountId: string,
  signalSymbol: string,
): Promise<{ cancelled: number; errors: string[] }> {
  const result = { cancelled: 0, errors: [] as string[] }
  let closeConn: (() => Promise<void>) | undefined

  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    closeConn = closeFn
    if (!connection.getOrders || !connection.cancelOrder) {
      result.errors.push('MetaAPI getOrders/cancelOrder indisponível')
      return result
    }

    const symbols = await connection.getSymbols()
    const brokerSymbol = resolveBrokerSymbol(signalSymbol, symbols)
    const orders = (await connection.getOrders()) as MetaApiPendingOrder[]

    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const target = norm(brokerSymbol)

    for (const order of orders) {
      const orderSym = norm(order.symbol)
      if (orderSym !== target && !orderSym.includes(target) && !target.includes(orderSym)) continue

      try {
        await connection.cancelOrder(order.id)
        result.cancelled++
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro ao cancelar ordem'
        result.errors.push(message)
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar ordens pendentes'
    result.errors.push(message)
  } finally {
    if (closeConn) await closeConn()
  }

  return result
}

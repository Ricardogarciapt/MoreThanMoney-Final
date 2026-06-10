import type { TrailingDistance } from './pip-points'
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
  closePosition: (positionId: string) => Promise<unknown>
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

function resolveOrderTrailing(req: OrderRequest): TrailingStopLossOptions | undefined {
  if (req.trailingStop) return buildTrailingOptions(req.trailingStop)
  return buildTrailingOptions(req.trailingStopPoints)
}

function buildOrderOptions(req: OrderRequest): { comment?: string; trailingStopLoss?: TrailingStopLossOptions } {
  const options: { comment?: string; trailingStopLoss?: TrailingStopLossOptions } = {
    comment: req.comment ?? 'MTMcopier',
  }
  const trailing = resolveOrderTrailing(req)
  if (trailing) options.trailingStopLoss = trailing
  return options
}

const CONNECT_TIMEOUT_MS = 45_000

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

async function getRpcConnection(accountId: string): Promise<{
  connection: RpcConnection
  close: () => Promise<void>
}> {
  const token = process.env.METAAPI_TOKEN
  if (!token) throw new Error('MetaApi não configurado (METAAPI_TOKEN em falta)')

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

export async function getAccountBalance(accountId: string): Promise<number | null> {
  const snap = await getAccountSnapshot(accountId)
  return snap?.balance ?? snap?.equity ?? null
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

    const orderOptions = buildOrderOptions(req)

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
): Promise<{ success: boolean; error?: string }> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const sl = stopLoss != null && stopLoss > 0 ? stopLoss : undefined
    const tp = takeProfit != null && takeProfit > 0 ? takeProfit : undefined
    const trailingOpts = buildTrailingOptions(trailing)
    await connection.modifyPosition(positionId, sl, tp, trailingOpts ? { trailingStopLoss: trailingOpts } : undefined)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao modificar posição'
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

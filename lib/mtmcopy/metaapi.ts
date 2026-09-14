import type { TrailingDistance } from './pip-points'
import { convertTrailingToRelativePoints } from './pip-points'
import { resolveBrokerSymbol, rankedBrokerSymbols } from './symbol-resolver'
import { orderCommentFor } from '@/lib/mtmcopy/no-comment-accounts'
import { inicioDaContagem } from './metricas-desde'
import { simbolosDaContaCache, specDoSimboloCache, invalidarLeiturasDeSimbolos } from './metaapi-cache'

export interface OrderRequest {
  accountId: string
  symbol: string
  direction: 'buy' | 'sell'
  volume: number
  orderType?: 'market' | 'limit' | 'stop'
  openPrice?: number | null
  stopLoss?: number | null
  takeProfit?: number | null
  comment?: string
  /** Trailing stop server-side (pips ou points conforme broker) */
  trailingStop?: TrailingDistance | null
  /** @deprecated usar trailingStop — distância em RELATIVE_POINTS */
  trailingStopPoints?: number | null
  /**
   * Id atribuído por nós (MetaApi `clientId`), que volta na posição. Serve para saber, depois de um
   * crash entre «enviei» e «gravei», se a ordem chegou a abrir. A MetaApi guarda-o no campo do
   * comentário do MT5 — por isso só vai quando a conta aceita comentário (ver buildOrderOptions).
   */
  clientId?: string
}

export interface OrderResult {
  success: boolean
  orderId?: string
  /** Id da posição aberta (ordens a mercado), quando a MetaApi o devolve. */
  positionId?: string
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
  /** Adiciona o símbolo ao Market Watch (necessário antes de negociar pares não-selecionados
   *  numa conta recém-criada — caso contrário o terminal rejeita com "Unknown symbol"). */
  subscribeToMarketData?: (symbol: string) => Promise<unknown>
  getDealsByTimeRange?: (
    startTime: Date,
    endTime: Date,
    offset?: number,
    limit?: number,
  ) => Promise<{ deals?: unknown[] } | unknown[]>
  createMarketBuyOrder: (
    symbol: string,
    volume: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string; clientId?: string; trailingStopLoss?: TrailingStopLossOptions },
  ) => Promise<{ orderId?: string; positionId?: string }>
  createMarketSellOrder: (
    symbol: string,
    volume: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string; clientId?: string; trailingStopLoss?: TrailingStopLossOptions },
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
  createStopBuyOrder: (
    symbol: string,
    volume: number,
    openPrice: number,
    sl?: number,
    tp?: number,
    options?: { comment?: string },
  ) => Promise<{ orderId?: string; positionId?: string }>
  createStopSellOrder: (
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
  /** SYMBOL_TRADE_MODE_FULL | ..._LONGONLY | ..._SHORTONLY | ..._CLOSEONLY | ..._DISABLED */
  tradeMode?: string
  /** Distância mínima (em points) do preço para colocar SL/TP. Broker rejeita stops mais colados. */
  stopsLevel?: number
  /** Lote mínimo negociável (ex.: índices na VT = 0.1/1.0 → 0.01 dá "Invalid volume"). */
  minVolume?: number
  /** Lote máximo negociável. */
  maxVolume?: number
  /** Incremento de lote (o volume tem de ser múltiplo disto). */
  volumeStep?: number
}

/**
 * Normaliza o volume às regras do símbolo da corretora: sobe ao mínimo, arredonda ao step
 * e limita ao máximo. Resolve os "Invalid volume" (ex.: índices UK100/GER40/US30 com lote
 * mínimo > 0.01). Se o spec não trouxer limites, devolve o volume como está (best-effort).
 */
export function clampVolume(volume: number, spec: MetaApiSymbolSpecification | null | undefined): number {
  const min = spec?.minVolume && spec.minVolume > 0 ? spec.minVolume : null
  const step = spec?.volumeStep && spec.volumeStep > 0 ? spec.volumeStep : null
  const max = spec?.maxVolume && spec.maxVolume > 0 ? spec.maxVolume : null

  let v = Number.isFinite(volume) && volume > 0 ? volume : (min ?? 0.01)
  if (min != null && v < min) v = min
  if (step != null) {
    v = Math.round(v / step) * step
    if (min != null && v < min) v = min // após arredondar, nunca abaixo do mínimo
  }
  if (max != null && v > max) v = max

  const decimals = step
    ? Math.min(8, (String(step).split('.')[1] || '').length)
    : 2
  v = Number(v.toFixed(decimals))
  return v > 0 ? v : (min ?? 0.01)
}

/**
 * Afasta SL/TP colados ao preço até à distância mínima do broker (stopsLevel) — resolve os
 * "invalid stops" quando o scanner envia um SL/TP a poucos pips do preço. PURA e fail-open:
 * sem refPrice/spec/stopsLevel devolve os valores como estão; só move o que está DENTRO do
 * mínimo, deixando intacto o que tem folga. Extraído de placeOrderOnConnection (Família A)
 * para reutilizar nos caminhos de ordem única (placeMarketOrder/Limit/Stop) e no modify.
 */
export function clampStopsToMinDistance(
  spec: { point?: number; stopsLevel?: number; digits?: number } | null | undefined,
  refPrice: number | null | undefined,
  direction: 'buy' | 'sell',
  sl: number | undefined,
  tp: number | undefined,
): { sl: number | undefined; tp: number | undefined } {
  if (!refPrice || refPrice <= 0) return { sl, tp }
  if (!spec?.point || spec.point <= 0 || typeof spec.stopsLevel !== 'number' || spec.stopsLevel <= 0) return { sl, tp }
  const minDist = spec.stopsLevel * spec.point * 1.15 // margem sobre o mínimo do broker
  const round = (v: number) => (spec?.digits != null ? Number(v.toFixed(spec.digits)) : v)
  let outSl = sl
  let outTp = tp
  if (sl != null) {
    if (direction === 'buy' && sl > refPrice - minDist) outSl = round(refPrice - minDist)
    else if (direction === 'sell' && sl < refPrice + minDist) outSl = round(refPrice + minDist)
  }
  if (tp != null) {
    if (direction === 'buy' && tp < refPrice + minDist) outTp = round(refPrice + minDist)
    else if (direction === 'sell' && tp > refPrice - minDist) outTp = round(refPrice - minDist)
  }
  return { sl: outSl, tp: outTp }
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
  /** O clientId enviado na ordem que abriu a posição (MetaApi). */
  clientId?: string
  /** Hora de abertura (ISO). Usado para não gerir uma posição mais recente que a mensagem. */
  time?: string
  /** P&L flutuante na moeda da conta — o MT5 devolve-o e o admin já o lia. */
  profit?: number
}

export interface MetaApiPendingOrder {
  id: string
  symbol: string
  type: string
  state?: string
  comment?: string
  openPrice?: number
  currentPrice?: number
  stopLoss?: number
  takeProfit?: number
  /** Hora de colocação da ordem (ISO). MetaApi expõe `time`/`brokerTime`. */
  time?: string
  brokerTime?: string
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

/** A MetaApi soma comentário + clientId no mesmo campo do MT5: juntos não passam disto. */
export const LIMITE_COMENTARIO_E_CLIENT_ID = 26

function buildOrderOptions(
  req: OrderRequest,
  trailingOpts?: TrailingStopLossOptions,
): { comment?: string; clientId?: string; trailingStopLoss?: TrailingStopLossOptions } {
  const options: { comment?: string; clientId?: string; trailingStopLoss?: TrailingStopLossOptions } = {}
  // Contas de trade manual (prop) vão sem comentário nenhum.
  const comment = orderCommentFor(req.accountId, req.comment)
  if (comment !== undefined) {
    // O clientId vive no campo do comentário: numa conta sem comentário também não pode ir —
    // era a mesma assinatura que a prop firm procura, só com outro nome.
    if (req.clientId) {
      const clientId = req.clientId.slice(0, LIMITE_COMENTARIO_E_CLIENT_ID)
      options.clientId = clientId
      const resto = LIMITE_COMENTARIO_E_CLIENT_ID - clientId.length
      if (resto >= 4) options.comment = comment.slice(0, resto)
    } else {
      options.comment = comment
    }
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

// ── Cache de ligações RPC ──────────────────────────────────────────────────────
// Reutiliza a ligação QUENTE por conta para evitar connect + waitSynchronized
// (lento) a cada sinal. Sem isto, cada sinal abre ~4 ligações novas (lot, snapshot,
// spec, ordem) → 30s–1m de atraso. Desativável com MTMCOPY_RPC_CACHE_DISABLED=true.
const RPC_CACHE_ENABLED = process.env.MTMCOPY_RPC_CACHE_DISABLED !== 'true'
const RPC_CACHE_TTL_MS = Number(process.env.MTMCOPY_RPC_CACHE_TTL_MS ?? 10 * 60_000)
const RPC_CACHE_MAX = Number(process.env.MTMCOPY_RPC_CACHE_MAX ?? 12)

type CachedRpc = { connection: RpcConnection; realClose: () => Promise<void>; createdAt: number; lastUsed: number }
const rpcCache = new Map<string, CachedRpc>()
const rpcInflight = new Map<string, Promise<{ connection: RpcConnection; realClose: () => Promise<void> }>>()

function rpcConnectionHealthy(conn: RpcConnection): boolean {
  const c = conn as unknown as { terminalState?: { connected?: boolean }; synchronized?: boolean }
  try {
    if (typeof c.terminalState?.connected === 'boolean') return c.terminalState.connected === true
    if (typeof c.synchronized === 'boolean') return c.synchronized === true
  } catch {
    /* ignore */
  }
  return true
}

export function invalidateRpcCache(accountId: string): void {
  const cached = rpcCache.get(accountId)
  if (cached) {
    rpcCache.delete(accountId)
    void cached.realClose()
  }
}

function evictRpcLruIfNeeded(): void {
  while (rpcCache.size > RPC_CACHE_MAX) {
    let oldestKey: string | null = null
    let oldest = Infinity
    for (const [k, v] of rpcCache) {
      if (v.lastUsed < oldest) { oldest = v.lastUsed; oldestKey = k }
    }
    if (!oldestKey) break
    const ev = rpcCache.get(oldestKey)
    rpcCache.delete(oldestKey)
    if (ev) void ev.realClose()
  }
}

/** Tenta redeploy + waitConnected quando a conta MetaAPI está offline (REST — funciona em Node/Vercel). */
export async function ensureMetaApiAccountOnline(accountId: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, error: 'METAAPI_TOKEN em falta' }

  const base =
    process.env.METAAPI_PROVISIONING_URL ??
    'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

  const headers: Record<string, string> = {
    'auth-token': token,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  async function fetchAccount(): Promise<{ state?: string; connectionStatus?: string }> {
    const res = await fetch(`${base}/users/current/accounts/${accountId}`, { headers })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        (data as { message?: string }).message ?? `MetaAPI HTTP ${res.status}`,
      )
    }
    return res.json() as Promise<{ state?: string; connectionStatus?: string }>
  }

  async function postAction(path: string): Promise<void> {
    const res = await fetch(`${base}/users/current/accounts/${accountId}${path}`, {
      method: 'POST',
      headers,
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        (data as { message?: string }).message ?? `MetaAPI HTTP ${res.status}`,
      )
    }
  }

  try {
    let account = await fetchAccount()
    const state = String(account.state ?? '').toUpperCase()

    if (state && state !== 'DEPLOYED') {
      await postAction('/deploy')
    }

    let conn = String(account.connectionStatus ?? '').toUpperCase()
    if (conn && conn !== 'CONNECTED') {
      try {
        await postAction('/reconnect')
      } catch {
        /* reconnect opcional */
      }
    }

    for (let i = 0; i < 60; i++) {
      account = await fetchAccount()
      conn = String(account.connectionStatus ?? '').toUpperCase()
      if (conn === 'CONNECTED') return { ok: true }
      await sleep(2000)
    }

    return { ok: false, error: 'MetaAPI conta não conectou a tempo' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Conta MetaAPI offline'
    return { ok: false, error: message }
  }
}

/** O tradeMode do MT5 permite ABRIR posição nesta direção? (DISABLED/CLOSEONLY não; LONG/SHORTONLY conforme). */
function tradeModeAllowsOpen(tradeMode: string | undefined, direction: 'buy' | 'sell'): boolean {
  if (!tradeMode) return true // desconhecido → não desqualifica
  const t = tradeMode.toUpperCase()
  if (t.includes('DISABLED') || t.includes('CLOSE')) return false
  if (t.includes('LONGONLY') || t.includes('LONG_ONLY')) return direction === 'buy'
  if (t.includes('SHORTONLY') || t.includes('SHORT_ONLY')) return direction === 'sell'
  return true // FULL (ou desconhecido tolerado)
}

/**
 * Lista de símbolos da conta pela cache de 1 hora (ver metaapi-cache.ts).
 *
 * O `getSymbols` custa ~500 créditos e era pedido em cada ordem; a lista é configuração da
 * corretora e quase não muda. Quando se passam símbolos canónicos, a lista guardada só é usada se
 * TODOS tiverem candidato nela — senão relê-se uma vez (símbolo acabado de acrescentar na corretora).
 */
function simbolosDaConta(accountId: string, connection: RpcConnection, canonicos: string[] = []): Promise<string[]> {
  const pedidos = canonicos.map((c) => c.trim()).filter(Boolean)
  return simbolosDaContaCache(
    accountId,
    () => connection.getSymbols(),
    pedidos.length ? (lista) => pedidos.every((c) => rankedBrokerSymbols(c, lista).length > 0) : undefined,
  )
}

/**
 * Especificação CRUA do símbolo pela cache de 1 hora. Os erros propagam-se como na chamada direta
 * (não ficam guardados). Uma spec sem `point` não se guarda e devolve null.
 */
async function specCruaDaConta(
  accountId: string,
  connection: RpcConnection,
  brokerSymbol: string,
): Promise<MetaApiSymbolSpecification | null> {
  if (!connection.getSymbolSpecification) return null
  const ler = connection.getSymbolSpecification.bind(connection)
  return specDoSimboloCache(accountId, brokerSymbol, () => ler(brokerSymbol))
}

async function fetchSpec(
  accountId: string,
  connection: RpcConnection,
  brokerSymbol: string,
  specCache?: Map<string, MetaApiSymbolSpecification | null>,
): Promise<MetaApiSymbolSpecification | null> {
  const cached = specCache?.get(brokerSymbol)
  if (cached !== undefined) return cached
  let spec: MetaApiSymbolSpecification | null = null
  if (connection.getSymbolSpecification) {
    // 1 retry: um fetch falhado (transiente) devolveria tradeMode indefinido e faria o
    // seletor aceitar um símbolo disabled por engano.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await specCruaDaConta(accountId, connection, brokerSymbol)
        spec = raw?.point
          ? {
              point: raw.point,
              pipSize: raw.pipSize,
              digits: raw.digits,
              tradeMode: raw.tradeMode,
              stopsLevel: raw.stopsLevel,
              minVolume: raw.minVolume,
              maxVolume: raw.maxVolume,
              volumeStep: raw.volumeStep,
            }
          : null
        break
      } catch {
        spec = null
        if (attempt === 0) await sleep(200)
      }
    }
  }
  specCache?.set(brokerSymbol, spec)
  return spec
}

/**
 * Resolve o símbolo da corretora escolhendo a 1ª variante NEGOCIÁVEL para a direção.
 * Corretoras como a VT Markets têm o símbolo "bare" (EURUSD) com trade DISABLED e a
 * variante nativa (EURUSD-STD) com trade FULL — o match exato devolveria o disabled.
 * Percorre os candidatos ranqueados (exato → sufixo nativo) e salta os não-negociáveis.
 */
async function resolveTradeableBrokerSymbol(
  accountId: string,
  connection: RpcConnection,
  symbols: string[],
  canonical: string,
  direction: 'buy' | 'sell',
  specCache?: Map<string, MetaApiSymbolSpecification | null>,
): Promise<{ brokerSymbol: string; spec: MetaApiSymbolSpecification | null }> {
  const ranked = rankedBrokerSymbols(canonical, symbols)
  if (!ranked.length) return { brokerSymbol: resolveBrokerSymbol(canonical, symbols), spec: null }
  // Duas passagens: preferir uma variante DEFINITIVAMENTE negociável (tradeMode FULL/
  // LONG/SHORT conforme). Só se nenhuma existir se cai numa de tradeMode desconhecido
  // (spec transiente) — nunca uma explicitamente DISABLED/CLOSEONLY.
  let unknownFallback: { brokerSymbol: string; spec: MetaApiSymbolSpecification | null } | null = null
  for (const cand of ranked.slice(0, 8)) {
    const spec = await fetchSpec(accountId, connection, cand, specCache)
    if (spec?.tradeMode) {
      if (tradeModeAllowsOpen(spec.tradeMode, direction)) return { brokerSymbol: cand, spec }
      continue // tradeMode conhecido mas não permite → salta (não é fallback)
    }
    if (!unknownFallback) unknownFallback = { brokerSymbol: cand, spec } // tradeMode desconhecido
  }
  return unknownFallback ?? { brokerSymbol: ranked[0], spec: null }
}

/**
 * Garante que o símbolo está selecionado no Market Watch antes de negociar.
 * Numa conta recém-criada, os pares não-default não estão selecionados e o terminal
 * rejeita a ordem com "Unknown symbol". subscribeToMarketData/getSymbolPrice forçam a
 * seleção. Idempotente e à prova de falhas (nunca lança).
 */
async function ensureSymbolReady(connection: RpcConnection, brokerSymbol: string): Promise<void> {
  try {
    if (connection.subscribeToMarketData) {
      await connection.subscribeToMarketData(brokerSymbol)
    } else if (connection.getSymbolPrice) {
      await connection.getSymbolPrice(brokerSymbol)
    }
  } catch {
    /* seleção best-effort — se falhar, a ordem seguinte reporta o erro real */
  }
}

/**
 * Uma ordem LIMIT tem de estar do LADO CERTO do mercado (BUY LIMIT abaixo do ask, SELL
 * LIMIT acima do bid) e além da freeze/stops distance — senão o MT5 rejeita com "Invalid
 * price in the request". Os sinais de scalp do scanner chegam com entry ≈ mercado e como
 * o webhook mapeia "há entry" → LIMIT, ficavam do lado errado e falhavam. Aqui decidimos
 * o tipo EFETIVO: se a LIMIT é válida mantém-se; se não, perto do mercado → MARKET,
 * claramente do lado do breakout → STOP. Best-effort: sem preço, mantém LIMIT.
 */
async function resolveEffectiveOrderType(
  connection: RpcConnection,
  brokerSymbol: string,
  direction: 'buy' | 'sell',
  openPrice: number,
  spec: MetaApiSymbolSpecification | null,
): Promise<'limit' | 'market' | 'stop'> {
  if (!connection.getSymbolPrice) return 'limit'
  try {
    const q = await connection.getSymbolPrice(brokerSymbol)
    const px = direction === 'buy' ? (q?.ask ?? q?.bid ?? null) : (q?.bid ?? q?.ask ?? null)
    if (px == null || px <= 0) return 'limit'
    const minDist =
      spec?.point && typeof spec.stopsLevel === 'number' && spec.stopsLevel > 0
        ? spec.stopsLevel * spec.point * 1.15
        : spec?.point && spec.point > 0
          ? spec.point * 10
          : px * 0.0002
    if (direction === 'buy') {
      if (openPrice <= px - minDist) return 'limit' // abaixo do mercado → BUY LIMIT válida
      return openPrice > px + minDist ? 'stop' : 'market' // acima → breakout (STOP) senão MARKET
    }
    if (openPrice >= px + minDist) return 'limit' // acima do mercado → SELL LIMIT válida
    return openPrice < px - minDist ? 'stop' : 'market' // abaixo → breakdown (STOP) senão MARKET
  } catch {
    return 'limit'
  }
}

async function placeOrderOnConnection(
  accountId: string,
  connection: RpcConnection,
  symbols: string[],
  specCache: Map<string, MetaApiSymbolSpecification | null>,
  req: OrderRequest,
): Promise<OrderResult> {
  try {
    const picked = await resolveTradeableBrokerSymbol(accountId, connection, symbols, req.symbol, req.direction, specCache)
    const brokerSymbol = picked.brokerSymbol
    let sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    let tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined

    let spec = specCache.get(brokerSymbol)
    if (spec === undefined) {
      if (connection.getSymbolSpecification) {
        try {
          const raw = await specCruaDaConta(accountId, connection, brokerSymbol)
          spec = raw?.point
            ? { point: raw.point, pipSize: raw.pipSize, digits: raw.digits, tradeMode: raw.tradeMode, stopsLevel: raw.stopsLevel, minVolume: raw.minVolume, maxVolume: raw.maxVolume, volumeStep: raw.volumeStep }
            : null
        } catch {
          spec = null
        }
      } else {
        spec = null
      }
      specCache.set(brokerSymbol, spec)
    }

    req.volume = clampVolume(req.volume, spec) // sobe ao lote mínimo do broker (índices)

    const trailingOpts = await resolveOrderTrailingForSymbol(req, brokerSymbol, spec)
    const orderOptions = buildOrderOptions(req, trailingOpts)

    await ensureSymbolReady(connection, brokerSymbol)

    // Afasta SL/TP colados ao preço até à distância mínima do broker (stopsLevel). O scanner
    // às vezes envia SL a ~1.8 pips → o MT5 rejeita com "invalid stops". Referência: openPrice
    // nas pendentes, preço de mercado nas imediatas. Só afasta o que está DENTRO do mínimo;
    // SL/TP com folga ficam intactos. Complementa o ajuste de LADO feito na rota do T2T.
    if ((sl != null || tp != null) && spec?.point && spec.point > 0 && typeof spec.stopsLevel === 'number' && spec.stopsLevel > 0) {
      let refPrice: number | null = req.orderType === 'market' ? null : (req.openPrice ?? null)
      if (refPrice == null && connection.getSymbolPrice) {
        try {
          const q = await connection.getSymbolPrice(brokerSymbol)
          refPrice = req.direction === 'buy' ? (q?.ask ?? q?.bid ?? null) : (q?.bid ?? q?.ask ?? null)
        } catch {
          /* sem preço → não afasta (a ordem reporta o erro real se houver) */
        }
      }
      if (refPrice && refPrice > 0) {
        const minDist = spec.stopsLevel * spec.point * 1.15 // margem sobre o mínimo do broker
        const round = (v: number) => (spec?.digits != null ? Number(v.toFixed(spec.digits)) : v)
        if (sl != null) {
          if (req.direction === 'buy' && sl > refPrice - minDist) sl = round(refPrice - minDist)
          else if (req.direction === 'sell' && sl < refPrice + minDist) sl = round(refPrice + minDist)
        }
        if (tp != null) {
          if (req.direction === 'buy' && tp < refPrice + minDist) tp = round(refPrice + minDist)
          else if (req.direction === 'sell' && tp > refPrice - minDist) tp = round(refPrice - minDist)
        }
      }
    }

    if (req.orderType === 'limit') {
      const openPrice = req.openPrice
      if (openPrice == null || openPrice <= 0) {
        return { success: false, error: 'Preço LIMIT em falta' }
      }
      // Evita "Invalid price": se a LIMIT ficaria do lado errado do mercado, cai para
      // MARKET (entry colada ao mercado, típico dos scalps do scanner) ou STOP (breakout).
      const effType = await resolveEffectiveOrderType(connection, brokerSymbol, req.direction, openPrice, spec ?? null)
      if (effType === 'limit') {
        const trade =
          req.direction === 'buy'
            ? await connection.createLimitBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
            : await connection.createLimitSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
        return { success: true, orderId: String(trade?.orderId ?? trade?.positionId ?? ''), brokerSymbol }
      }
      if (effType === 'stop') {
        const trade =
          req.direction === 'buy'
            ? await connection.createStopBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
            : await connection.createStopSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
        return { success: true, orderId: String(trade?.orderId ?? trade?.positionId ?? ''), brokerSymbol }
      }
      // effType === 'market' → cai para a execução a mercado abaixo
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

  const run = async (forceFresh: boolean): Promise<OrderResult[]> => {
    let close: (() => Promise<void>) | undefined
    try {
      const { connection, close: closeFn } = await getRpcConnection(accountId, 0, { forceFresh })
      close = closeFn
      const symbols = await simbolosDaConta(accountId, connection, requests.map((r) => r.symbol))
      const specCache = new Map<string, MetaApiSymbolSpecification | null>()
      const results: OrderResult[] = []
      for (const req of requests) {
        results.push(await placeOrderOnConnection(accountId, connection, symbols, specCache, req))
      }
      // Uma ordem recusada pode vir de configuração da corretora que mudou (lote mínimo, stops,
      // símbolo desativado): esquece-se o guardado para a próxima ler tudo fresco.
      if (results.some((r) => !r.success)) invalidarLeiturasDeSimbolos(accountId)
      return results
    } finally {
      if (close) await close()
    }
  }

  try {
    return await run(false)
  } catch (err: unknown) {
    // Ligação cacheada possivelmente morta → invalida e tenta UMA vez com ligação fresca.
    invalidateRpcCache(accountId)
    invalidarLeiturasDeSimbolos(accountId)
    if (isRetryableMetaApiError(err)) {
      try {
        return await run(true)
      } catch (err2: unknown) {
        const message = err2 instanceof Error ? err2.message : 'Erro ao ligar MetaAPI'
        return requests.map(() => ({ success: false, error: message }))
      }
    }
    const message = err instanceof Error ? err.message : 'Erro ao ligar MetaAPI'
    return requests.map(() => ({ success: false, error: message }))
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

/** Cria uma ligação RPC nova (connect + waitSynchronized). Com retries. */
async function createRpcConnection(
  accountId: string,
  attempt = 0,
): Promise<{ connection: RpcConnection; realClose: () => Promise<void> }> {
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
      realClose: async () => {
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
      return createRpcConnection(accountId, attempt + 1)
    }
    throw err
  }
}

/**
 * Devolve uma ligação RPC para a conta. Reutiliza a ligação cacheada (quente) se
 * saudável; senão cria uma nova e cacheia. `close()` é no-op para ligações cacheadas
 * (mantém-se quente); a invalidação real faz-se via invalidateRpcCache/forceFresh.
 */
async function getRpcConnection(
  accountId: string,
  _attempt = 0,
  opts?: { forceFresh?: boolean },
): Promise<{ connection: RpcConnection; close: () => Promise<void> }> {
  if (!RPC_CACHE_ENABLED) {
    const fresh = await createRpcConnection(accountId)
    return { connection: fresh.connection, close: fresh.realClose }
  }

  if (opts?.forceFresh) invalidateRpcCache(accountId)

  const cached = rpcCache.get(accountId)
  if (cached) {
    if (Date.now() - cached.createdAt < RPC_CACHE_TTL_MS && rpcConnectionHealthy(cached.connection)) {
      cached.lastUsed = Date.now()
      return { connection: cached.connection, close: async () => {} }
    }
    invalidateRpcCache(accountId)
  }

  // Dedupe de criações concorrentes (ex.: lot + snapshot + spec em paralelo).
  let inflight = rpcInflight.get(accountId)
  if (!inflight) {
    inflight = createRpcConnection(accountId).finally(() => rpcInflight.delete(accountId))
    rpcInflight.set(accountId, inflight)
  }
  const created = await inflight
  rpcCache.set(accountId, { ...created, createdAt: Date.now(), lastUsed: Date.now() })
  evictRpcLruIfNeeded()
  return { connection: created.connection, close: async () => {} }
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
    invalidateRpcCache(accountId)
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
        const symbols = await simbolosDaConta(accountId, rpc.connection, [symbol])
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
    invalidateRpcCache(accountId)
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

    const symbols = await simbolosDaConta(req.accountId, connection, [req.symbol])
    const { brokerSymbol, spec } = await resolveTradeableBrokerSymbol(req.accountId, connection, symbols, req.symbol, req.direction)
    req.volume = clampVolume(req.volume, spec) // sobe ao lote mínimo do broker (índices)

    let sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    let tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined

    const trailingOpts = await resolveOrderTrailingForSymbol(req, brokerSymbol)
    const orderOptions = buildOrderOptions(req, trailingOpts)

    await ensureSymbolReady(connection, brokerSymbol)

    // Afasta SL/TP colados ao preço de mercado até ao mínimo do broker (fail-open).
    if (sl != null || tp != null) {
      try {
        let refPrice: number | null = null
        if (connection.getSymbolPrice) {
          const q = await connection.getSymbolPrice(brokerSymbol)
          refPrice = req.direction === 'buy' ? (q?.ask ?? q?.bid ?? null) : (q?.bid ?? q?.ask ?? null)
        }
        const c = clampStopsToMinDistance(spec, refPrice, req.direction, sl, tp)
        sl = c.sl
        tp = c.tp
      } catch {
        /* fail-open: mantém sl/tp originais */
      }
    }

    const trade =
      req.direction === 'buy'
        ? await connection.createMarketBuyOrder(brokerSymbol, req.volume, sl, tp, orderOptions)
        : await connection.createMarketSellOrder(brokerSymbol, req.volume, sl, tp, orderOptions)

    return {
      success: true,
      orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
      positionId: trade?.positionId ? String(trade.positionId) : undefined,
      brokerSymbol,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao executar ordem no MT5'
    invalidarLeiturasDeSimbolos(req.accountId) // a próxima ordem relê símbolos/specs frescos
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

    const symbols = await simbolosDaConta(req.accountId, connection, [req.symbol])
    const { brokerSymbol, spec } = await resolveTradeableBrokerSymbol(req.accountId, connection, symbols, req.symbol, req.direction)
    req.volume = clampVolume(req.volume, spec) // sobe ao lote mínimo do broker (índices)

    let sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    let tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined
    const c = orderCommentFor(req.accountId, req.comment)
    const orderOptions = c === undefined ? {} : { comment: c }

    // Afasta SL/TP colados ao preço da pendente até ao mínimo do broker (fail-open).
    {
      const c = clampStopsToMinDistance(spec, openPrice, req.direction, sl, tp)
      sl = c.sl
      tp = c.tp
    }

    await ensureSymbolReady(connection, brokerSymbol)

    // Anti "Invalid price": LIMIT do lado errado do mercado → MARKET (perto) ou STOP (breakout).
    const effType = await resolveEffectiveOrderType(connection, brokerSymbol, req.direction, openPrice, spec)
    let trade
    if (effType === 'market') {
      trade =
        req.direction === 'buy'
          ? await connection.createMarketBuyOrder(brokerSymbol, req.volume, sl, tp, orderOptions)
          : await connection.createMarketSellOrder(brokerSymbol, req.volume, sl, tp, orderOptions)
    } else if (effType === 'stop') {
      trade =
        req.direction === 'buy'
          ? await connection.createStopBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
          : await connection.createStopSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
    } else {
      trade =
        req.direction === 'buy'
          ? await connection.createLimitBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
          : await connection.createLimitSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
    }

    return {
      success: true,
      orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
      brokerSymbol,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao colocar ordem LIMIT no MT5'
    invalidarLeiturasDeSimbolos(req.accountId) // a próxima ordem relê símbolos/specs frescos
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

export async function placeStopOrder(req: OrderRequest): Promise<OrderResult> {
  let close: (() => Promise<void>) | undefined
  try {
    const openPrice = req.openPrice
    if (openPrice == null || openPrice <= 0) {
      return { success: false, error: 'Preço STOP em falta' }
    }

    const { connection, close: closeFn } = await getRpcConnection(req.accountId)
    close = closeFn

    const symbols = await simbolosDaConta(req.accountId, connection, [req.symbol])
    const { brokerSymbol, spec } = await resolveTradeableBrokerSymbol(req.accountId, connection, symbols, req.symbol, req.direction)
    req.volume = clampVolume(req.volume, spec) // sobe ao lote mínimo do broker (índices)

    let sl = req.stopLoss != null && req.stopLoss > 0 ? req.stopLoss : undefined
    let tp = req.takeProfit != null && req.takeProfit > 0 ? req.takeProfit : undefined
    const c = orderCommentFor(req.accountId, req.comment)
    const orderOptions = c === undefined ? {} : { comment: c }

    // Afasta SL/TP colados ao preço da pendente até ao mínimo do broker (fail-open).
    {
      const c = clampStopsToMinDistance(spec, openPrice, req.direction, sl, tp)
      sl = c.sl
      tp = c.tp
    }

    await ensureSymbolReady(connection, brokerSymbol)

    const trade =
      req.direction === 'buy'
        ? await connection.createStopBuyOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)
        : await connection.createStopSellOrder(brokerSymbol, req.volume, openPrice, sl, tp, orderOptions)

    return {
      success: true,
      orderId: String(trade?.orderId ?? trade?.positionId ?? ''),
      brokerSymbol,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao colocar ordem STOP no MT5'
    invalidarLeiturasDeSimbolos(req.accountId) // a próxima ordem relê símbolos/specs frescos
    return { success: false, error: message }
  } finally {
    if (close) await close()
  }
}

/**
 * Tudo o que é preciso para DIMENSIONAR uma cópia, numa ligação: o símbolo negociável da corretora
 * (salta variantes DISABLED), a especificação de volume/stops, o preço e a equity. Só leituras.
 * Devolve null quando não conseguiu ler — quem chama não abre nada com números inventados.
 */
export async function lerContextoDeCopia(
  accountId: string,
  canonicalSymbol: string,
  direction: 'buy' | 'sell',
): Promise<{
  brokerSymbol: string
  spec: MetaApiSymbolSpecification | null
  bid: number | null
  ask: number | null
  balance: number | null
  equity: number | null
  tickSize: number | null
  tickValue: number | null
} | null> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const symbols = await simbolosDaConta(accountId, connection, [canonicalSymbol])
    const { brokerSymbol, spec } = await resolveTradeableBrokerSymbol(accountId, connection, symbols, canonicalSymbol, direction)
    const info = await connection.getAccountInformation()
    let bid: number | null = null
    let ask: number | null = null
    let tickValue: number | null = null
    if (connection.getSymbolPrice) {
      await ensureSymbolReady(connection, brokerSymbol)
      const q = (await connection.getSymbolPrice(brokerSymbol)) as { bid?: number; ask?: number; profitTickValue?: number; lossTickValue?: number } | null
      bid = q?.bid ?? null
      ask = q?.ask ?? null
      const tv = direction === 'sell' ? q?.lossTickValue ?? q?.profitTickValue : q?.profitTickValue ?? q?.lossTickValue
      tickValue = tv && tv > 0 ? tv : null
    }
    let tickSize: number | null = null
    if (connection.getSymbolSpecification) {
      // Spec pela cache; sem `point` não se guarda e lê-se direto como antes (o tickSize pode vir sozinho).
      const raw = ((await specCruaDaConta(accountId, connection, brokerSymbol).catch(() => null)) ??
        (await connection.getSymbolSpecification(brokerSymbol).catch(() => null))) as { tickSize?: number; point?: number } | null
      tickSize = raw?.tickSize && raw.tickSize > 0 ? raw.tickSize : raw?.point && raw.point > 0 ? raw.point : null
    }
    return { brokerSymbol, spec, bid, ask, balance: info.balance ?? null, equity: info.equity ?? null, tickSize, tickValue }
  } catch {
    invalidateRpcCache(accountId)
    return null
  } finally {
    if (close) await close()
  }
}

export async function placeOrder(req: OrderRequest): Promise<OrderResult> {
  if (req.orderType === 'stop') return placeStopOrder(req)
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

/**
 * Posições abertas com DISTINÇÃO entre "não há" e "não consegui ler".
 *
 * O `listOpenPositions` é fail-open: devolve [] quando a leitura falha. Isso é o correto para
 * decidir se se ABRE uma trade (uma falha de leitura não deve impedir a entrada), mas é perigoso
 * para GERIR: o monitor de preço via [] e concluía que a posição tinha fechado — marcava-a como
 * encerrada e deixava de a gerir, enquanto na corretora continuava aberta, sem parciais, sem
 * break-even e sem trailing. Dos 37 registos de ouro de uma semana, 21 morreram assim.
 *
 * Quem GERE posições usa esta função e não faz nada quando recebe `null`.
 */
export async function readOpenPositions(accountId: string): Promise<MetaApiPosition[] | null> {
  let close: (() => Promise<void>) | undefined
  try {
    return await withTimeout(
      (async () => {
        try {
          const { connection, close: closeFn } = await getRpcConnection(accountId)
          close = closeFn
          const positions = await connection.getPositions()
          return (positions ?? []) as MetaApiPosition[]
        } finally {
          if (close) await close()
        }
      })(),
      10_000,
      `readOpenPositions ${accountId}`,
    )
  } catch {
    invalidateRpcCache(accountId)
    return null // não consegui ler — NÃO é "não há posições"
  }
}

export async function listOpenPositions(accountId: string): Promise<MetaApiPosition[]> {
  // TETO TOTAL de 10s (fail-open): numa reconexão RPC lenta, o getRpcConnection/getPositions podia
  // pendurar até ~55s e MATAR a função (master-poll) antes de colocar a ordem — foi o que perdeu a
  // trade das 15:14. Ao estourar, devolve [] → a verificação de exposição não bloqueia e a trade ABRE.
  try {
    return await withTimeout(
      (async () => {
        let close: (() => Promise<void>) | undefined
        try {
          const { connection, close: closeFn } = await getRpcConnection(accountId)
          close = closeFn
          const positions = await connection.getPositions()
          return (positions ?? []) as MetaApiPosition[]
        } finally {
          if (close) await close()
        }
      })(),
      10_000,
      `listOpenPositions ${accountId}`,
    )
  } catch {
    invalidateRpcCache(accountId)
    return []
  }
}

export interface MetaApiDeal {
  id?: string
  positionId?: string
  orderId?: string
  symbol?: string
  type?: string // DEAL_TYPE_BUY | DEAL_TYPE_SELL | DEAL_TYPE_BALANCE …
  entryType?: string // DEAL_ENTRY_IN | DEAL_ENTRY_OUT | DEAL_ENTRY_INOUT
  volume?: number
  price?: number
  profit?: number
  commission?: number
  swap?: number
  time?: string | Date
  /** Comentário da ordem — é onde o nosso sistema escreve a estratégia ("T2T-premium"). */
  comment?: string
}

/** Região de cada conta, descoberta uma vez. A conta vive numa região e só responde nessa. */
const regiaoPorConta = new Map<string, string>()

async function regiaoDaConta(accountId: string, token: string): Promise<string | null> {
  const guardada = regiaoPorConta.get(accountId)
  if (guardada) return guardada
  try {
    const r = await fetch(
      `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${accountId}`,
      { headers: { 'auth-token': token } },
    )
    if (!r.ok) return null
    const j = (await r.json()) as { region?: string }
    const reg = (j.region ?? '').trim()
    if (!reg) return null
    regiaoPorConta.set(accountId, reg)
    return reg
  } catch {
    return null
  }
}

/**
 * Histórico de deals (execuções) de uma conta entre datas — base para reconstruir
 * os TRADES FECHADOS (entrada+saída por posição) e o P&L real.
 *
 * ── Porque é que isto passou a ser REST ───────────────────────────────────────────────────────
 * A versão anterior abria uma ligação RPC do SDK: `waitConnected` → `connect` → `waitSynchronized`
 * → `getDealsByTimeRange`. São três esperas de sincronização antes de se pedir o que quer que
 * seja, e num arranque a frio da Vercel raramente chegavam ao fim dentro do tempo. Como o `catch`
 * devolve `[]`, o falhanço não parecia um falhanço: parecia uma conta sem negócios. Foi assim que
 * a prova em pips passou semanas a dizer "0 trades" com 254 negócios na conta — a conta-espelho
 * tinha o histórico todo lá, e nós é que não conseguíamos lê-lo.
 *
 * O endpoint REST devolve exatamente os mesmos deals, num pedido só, sem sincronizar nada. A
 * única coisa que é preciso saber é a REGIÃO da conta: uma conta de Londres não responde no
 * endereço de Nova Iorque, e era esse outro meio-caminho para o mesmo array vazio.
 *
 * O SDK fica como plano B — se um dia o REST mudar, ainda há por onde ir — mas deixa de ser o
 * caminho normal. E quando ambos falham devolve-se null, NÃO uma lista vazia: quem chama tem de
 * poder distinguir "esta conta não negociou" de "não consegui ler a conta". Confundir as duas foi
 * o bug.
 */
export async function getHistoryDeals(
  accountId: string,
  fromTime: Date,
  toTime: Date = new Date(),
): Promise<MetaApiDeal[]> {
  return (await lerHistorico(accountId, fromTime, toTime)) ?? []
}

/** Igual, mas devolve null quando a LEITURA falhou (em vez de fingir uma conta parada). */
export async function lerHistorico(
  accountId: string,
  fromTime: Date,
  toTime: Date = new Date(),
): Promise<MetaApiDeal[] | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null

  /**
   * Contas com a contagem reiniciada não devolvem o que aconteceu antes do marco.
   *
   * É aqui e não em cada ecrã porque `getHistoryDeals` é a porta por onde TODO o histórico
   * entra no site — plano de trading, curvas, desempenho por estratégia. Filtrar num sítio e
   * esquecer outro dava dois números diferentes para a mesma conta, e o pior de dois números
   * diferentes é não se saber qual deles está errado.
   */
  const inicio = inicioDaContagem(accountId, fromTime)

  const regiao = await regiaoDaConta(accountId, token)
  if (regiao) {
    try {
      const de = encodeURIComponent(inicio.toISOString())
      const ate = encodeURIComponent(toTime.toISOString())
      const r = await fetch(
        `https://mt-client-api-v1.${regiao}.agiliumtrade.ai/users/current/accounts/${accountId}/history-deals/time/${de}/${ate}`,
        { headers: { 'auth-token': token }, signal: AbortSignal.timeout(25_000) },
      )
      if (r.ok) {
        const j = (await r.json()) as MetaApiDeal[] | { deals?: MetaApiDeal[] }
        const deals = Array.isArray(j) ? j : (j.deals ?? [])
        return deals
      }
      console.warn('[lerHistorico] REST', r.status, accountId)
    } catch (e) {
      console.warn('[lerHistorico] REST falhou:', e instanceof Error ? e.message : e)
    }
  }

  // Plano B: o caminho antigo pelo SDK. Lento e frágil em serverless, mas melhor do que nada.
  let connection: (RpcConnection & { close?: () => Promise<void> }) | undefined
  try {
    // webpackIgnore: o build NODE do SDK usa builtins (module/fs/...) que o webpack não
    // resolve no bundle do cliente. Esta função só corre no servidor → import nativo em
    // runtime (sem empacotar). Sem isto, o build do site falha (Can't resolve 'module').
    const mod = (await import(/* webpackIgnore: true */ 'metaapi.cloud-sdk/esm-node')) as { default?: unknown }
    const MetaApiNode = (mod.default ?? mod) as new (token: string) => {
      metatraderAccountApi: { getAccount: (id: string) => Promise<MetaApiAccountNode> }
    }
    const api = new MetaApiNode(token)
    const account = await api.metatraderAccountApi.getAccount(accountId)
    await withTimeout(account.waitConnected(), CONNECT_TIMEOUT_MS, 'history waitConnected')
    connection = account.getRPCConnection() as RpcConnection & { close?: () => Promise<void> }
    await withTimeout(connection.connect(), CONNECT_TIMEOUT_MS, 'history connect')
    await withTimeout(connection.waitSynchronized(), CONNECT_TIMEOUT_MS, 'history sync')
    if (typeof connection.getDealsByTimeRange !== 'function') return null
    // O mesmo marco no caminho de recurso: senão o fallback trazia o passado que o REST filtra.
    const raw = await connection.getDealsByTimeRange(inicio, toTime)
    const deals = (Array.isArray(raw) ? raw : (raw?.deals ?? [])) as MetaApiDeal[]
    return deals ?? []
  } catch (e) {
    console.warn('[lerHistorico] SDK erro:', e instanceof Error ? e.message : e)
    return null
  } finally {
    if (connection?.close) await connection.close().catch(() => {})
  }
}

type MetaApiAccountNode = {
  waitConnected: () => Promise<void>
  getRPCConnection: () => RpcConnection
}

export async function getAccountSymbols(accountId: string): Promise<string[]> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const symbols = await simbolosDaConta(accountId, connection)
    return Array.isArray(symbols) ? symbols : []
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

    const symbols = await simbolosDaConta(accountId, connection, [canonicalSymbol])
    const brokerSymbol = resolveBrokerSymbol(canonicalSymbol, symbols)
    const spec = await specCruaDaConta(accountId, connection, brokerSymbol)
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

/**
 * Contexto de TICK para dimensionamento por risco CURRENCY-AGNOSTIC.
 * tickValue = valor (na moeda da conta) de 1 tick para 1.0 lote (profitTickValue da MetaApi);
 * tickSize = tamanho do tick em preço. Assim, valor de N de distância ao SL para 1 lote =
 * (distancia/tickSize) * tickValue — correto p/ QUALQUER par (JPY, cruzados, USD-base, ouro, índices).
 * Devolve null se o broker não expuser estes campos (o chamador cai na heurística).
 */
export async function getRiskTickContext(
  accountId: string,
  canonicalSymbol: string,
  direction: 'buy' | 'sell' = 'buy',
): Promise<{ tickSize: number; tickValue: number } | null> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    const symbols = await simbolosDaConta(accountId, connection, [canonicalSymbol])
    const brokerSymbol = resolveBrokerSymbol(canonicalSymbol, symbols)
    // Spec pela cache; se a corretora devolver uma spec sem `point` (não se guarda), lê-se direto
    // como antes — o tickSize pode vir sozinho.
    const spec = connection.getSymbolSpecification
      ? ((await specCruaDaConta(accountId, connection, brokerSymbol)) ?? (await connection.getSymbolSpecification(brokerSymbol)))
      : null
    const s = spec as unknown as { tickSize?: number; point?: number } | null
    const tickSize = s?.tickSize && s.tickSize > 0 ? s.tickSize : s?.point && s.point > 0 ? s.point : null
    let tickValue: number | null = null
    if (connection.getSymbolPrice) {
      const p = (await connection.getSymbolPrice(brokerSymbol)) as unknown as {
        profitTickValue?: number
        lossTickValue?: number
      } | null
      const tv = direction === 'sell' ? p?.lossTickValue ?? p?.profitTickValue : p?.profitTickValue ?? p?.lossTickValue
      if (tv && tv > 0) tickValue = tv
    }
    if (!tickSize || !tickValue) return null
    return { tickSize, tickValue }
  } catch {
    return null
  } finally {
    if (close) await close()
  }
}

/** Preço de mercado (mid) atual de um símbolo na conta — para sizing por risco de ordens a mercado. */
export async function getMarketPrice(accountId: string, canonicalSymbol: string): Promise<number | null> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    if (!connection.getSymbolPrice) return null
    const symbols = await simbolosDaConta(accountId, connection, [canonicalSymbol])
    const brokerSymbol = resolveBrokerSymbol(canonicalSymbol, symbols)
    // O preço continua sempre ao vivo — só a lista de símbolos vem da cache.
    const q = await connection.getSymbolPrice(brokerSymbol)
    const mid = q?.ask != null && q?.bid != null ? (q.ask + q.bid) / 2 : (q?.ask ?? q?.bid ?? null)
    return typeof mid === 'number' && mid > 0 ? mid : null
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

/** Ordens pendentes distinguindo "não há" de "não consegui ler" — ver readOpenPositions. */
export async function readPendingOrders(accountId: string): Promise<MetaApiPendingOrder[] | null> {
  let close: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    close = closeFn
    if (!connection.getOrders) return []
    const orders = await connection.getOrders()
    return (orders ?? []) as MetaApiPendingOrder[]
  } catch {
    invalidateRpcCache(accountId)
    return null
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

    const symbols = await simbolosDaConta(accountId, connection, [signalSymbol])
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

export interface SweepResult {
  scanned: number
  cancelled: number
  kept: number
  details: Array<{ id: string; symbol: string; reason: string }>
  errors: string[]
}

/**
 * Limpa ordens LIMIT/STOP pendentes "mortas" numa conta (ex.: MTM Auto Forex):
 *  - **idade** > `maxAgeMinutes` (o setup ficou obsoleto e nunca encheu), ou
 *  - o **preço já atingiu o TP** (o movimento aconteceu sem a entrada encher → oportunidade
 *    perdida), ou o **SL** (setup invalidado).
 * Cancela essas; mantém as que ainda podem encher. Idempotente e seguro a correr em cron.
 */
export async function sweepStalePendingOrders(
  accountId: string,
  opts: { maxAgeMinutes: number; nowMs: number; cancelOnTpHit?: boolean; cancelOnSlHit?: boolean },
): Promise<SweepResult> {
  const cancelOnTp = opts.cancelOnTpHit !== false
  const cancelOnSl = opts.cancelOnSlHit !== false
  const result: SweepResult = { scanned: 0, cancelled: 0, kept: 0, details: [], errors: [] }
  let closeConn: (() => Promise<void>) | undefined
  try {
    const { connection, close: closeFn } = await getRpcConnection(accountId)
    closeConn = closeFn
    if (!connection.getOrders || !connection.cancelOrder) {
      result.errors.push('MetaAPI getOrders/cancelOrder indisponível')
      return result
    }
    const orders = (await connection.getOrders()) as MetaApiPendingOrder[]
    result.scanned = orders.length

    for (const order of orders) {
      const isBuy = /buy/i.test(order.type)
      const isSell = /sell/i.test(order.type)
      const px = typeof order.currentPrice === 'number' && order.currentPrice > 0 ? order.currentPrice : null
      const tp = typeof order.takeProfit === 'number' && order.takeProfit > 0 ? order.takeProfit : null
      const sl = typeof order.stopLoss === 'number' && order.stopLoss > 0 ? order.stopLoss : null
      const openedMs = order.time || order.brokerTime ? Date.parse((order.time || order.brokerTime) as string) : NaN
      const ageMin = Number.isFinite(openedMs) ? (opts.nowMs - openedMs) / 60_000 : null

      let reason: string | null = null
      if (ageMin != null && ageMin > opts.maxAgeMinutes) {
        reason = `idade ${Math.round(ageMin)}min > ${opts.maxAgeMinutes}min`
      } else if (cancelOnTp && px != null && tp != null && ((isBuy && px >= tp) || (isSell && px <= tp))) {
        reason = 'preço já atingiu o TP (setup consumido)'
      } else if (cancelOnSl && px != null && sl != null && ((isBuy && px <= sl) || (isSell && px >= sl))) {
        reason = 'preço já atingiu o SL (setup invalidado)'
      }

      if (!reason) {
        result.kept++
        continue
      }
      try {
        await connection.cancelOrder(order.id)
        result.cancelled++
        result.details.push({ id: order.id, symbol: order.symbol, reason })
      } catch (err: unknown) {
        result.errors.push(`${order.symbol} ${order.id}: ${err instanceof Error ? err.message : 'cancel falhou'}`)
      }
    }
  } catch (err: unknown) {
    result.errors.push(err instanceof Error ? err.message : 'Erro no sweep de pendentes')
  } finally {
    if (closeConn) await closeConn()
  }
  return result
}

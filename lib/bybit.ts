// HMAC-SHA256 via Web Crypto → funciona em Edge Runtime (necessário para correr em fra1,
// já que a Bybit bloqueia IPs dos EUA e o serverless Node da Vercel corre em iad1).
async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Cliente Bybit v5 (linear perpetuals). Coloca ordens na conta-MESTRE do Copy Trading;
// a Bybit trata da cópia para os seguidores. Keys em env (nunca em código):
//   BYBIT_API_KEY / BYBIT_API_SECRET · BYBIT_TESTNET=true → api-testnet.bybit.com
// Doc: https://bybit-exchange.github.io/docs/v5/intro

const RECV_WINDOW = "5000"

function base(): string {
  return process.env.BYBIT_TESTNET === "true"
    ? "https://api-testnet.bybit.com"
    : "https://api.bybit.com"
}

export function bybitConfigured(): boolean {
  return !!(process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET)
}

/** Pedido assinado v5. GET → querystring; POST → JSON body. Assinatura HMAC-SHA256. */
async function signedRequest(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; retCode: number; retMsg: string; result: unknown }> {
  const key = process.env.BYBIT_API_KEY
  const secret = process.env.BYBIT_API_SECRET
  if (!key || !secret) return { ok: false, status: 0, retCode: -1, retMsg: "sem BYBIT_API_KEY/SECRET", result: null }

  const ts = String(Date.now())
  let url = `${base()}${path}`
  let body = ""
  let payloadForSign: string

  if (method === "GET") {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    ).toString()
    if (qs) url += `?${qs}`
    payloadForSign = ts + key + RECV_WINDOW + qs
  } else {
    body = JSON.stringify(params)
    payloadForSign = ts + key + RECV_WINDOW + body
  }

  const sign = await hmacHex(secret, payloadForSign)
  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": key,
    "X-BAPI-TIMESTAMP": ts,
    "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    "X-BAPI-SIGN": sign,
  }
  if (method === "POST") headers["Content-Type"] = "application/json"

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { method, headers, body: method === "POST" ? body : undefined, signal: ctrl.signal })
    const text = await res.text()
    let json: { retCode?: number; retMsg?: string; result?: unknown } = {}
    try { json = JSON.parse(text) } catch { /* resposta não-JSON */ }
    return {
      ok: res.ok && json.retCode === 0,
      status: res.status,
      retCode: json.retCode ?? -1,
      retMsg: json.retMsg ?? (text ? `[${res.status}] ${text.slice(0, 180)}` : `[${res.status}] vazio`),
      result: json.result ?? null,
    }
  } catch (e) {
    return { ok: false, status: 0, retCode: -1, retMsg: e instanceof Error ? e.message : String(e), result: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Saldo da conta unificada — usado no selftest (valida keys, sem colocar ordens). */
export function getBybitWalletBalance() {
  return signedRequest("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" })
}

/** Define a alavancagem do símbolo (idempotente; ignora "leverage not modified"). */
export async function setBybitLeverage(symbol: string, leverage: number) {
  const lev = String(Math.max(1, Math.round(leverage)))
  const r = await signedRequest("POST", "/v5/position/set-leverage", {
    category: "linear",
    symbol,
    buyLeverage: lev,
    sellLeverage: lev,
  })
  // 110043 = leverage not modified → não é erro
  if (!r.ok && r.retCode !== 110043) return r
  return { ...r, ok: true }
}

/** Equity total (USDT) da conta unificada. null se indisponível. */
export async function getBybitEquity(): Promise<number | null> {
  const r = await getBybitWalletBalance()
  const list = (r.result as { list?: { totalEquity?: string }[] } | null)?.list ?? []
  const eq = Number(list[0]?.totalEquity)
  return Number.isFinite(eq) && eq > 0 ? eq : null
}

export interface BybitInstrument {
  minOrderQty: number
  qtyStep: number
  tickSize: number
}

/** Regras de lote/preço do símbolo linear (público, sem assinatura). Para arredondar a qty. */
export async function getBybitInstrumentInfo(symbol: string): Promise<BybitInstrument | null> {
  try {
    const url = `${base()}/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`
    const res = await fetch(url)
    const j = (await res.json()) as {
      result?: { list?: { lotSizeFilter?: { minOrderQty?: string; qtyStep?: string }; priceFilter?: { tickSize?: string } }[] }
    }
    const it = j.result?.list?.[0]
    if (!it) return null
    return {
      minOrderQty: Number(it.lotSizeFilter?.minOrderQty ?? 0) || 0,
      qtyStep: Number(it.lotSizeFilter?.qtyStep ?? 0) || 0,
      tickSize: Number(it.priceFilter?.tickSize ?? 0) || 0,
    }
  } catch {
    return null
  }
}

/** Arredonda qty ao qtyStep (para baixo) e devolve string com os decimais do step. */
export function roundQtyToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty
  const rounded = Math.floor(qty / step) * step
  const decimals = (String(step).split(".")[1] || "").length
  return Number(rounded.toFixed(decimals))
}

/** Arredonda um PREÇO ao tickSize do símbolo (senão o MT5/Bybit rejeita SL/TP com preço inválido). */
export function roundToTick(price: number, tick: number): number {
  if (!(tick > 0)) return price
  const rounded = Math.round(price / tick) * tick
  const decimals = (String(tick).split(".")[1] || "").length
  return Number(rounded.toFixed(decimals))
}

export interface MasterSizingInput {
  equity: number
  entry: number
  sl: number | null
  leverage: number
  riskPct: number // fração da equity arriscada ao SL (ex.: 0.01 = 1%)
  costAbs: number // teto: margem máxima gasta por posição, em USDT (ex.: 10 = $10)
  instrument: BybitInstrument | null
}

export interface MasterSizingResult {
  qty: number
  reason: string
  belowMin: boolean
}

/**
 * Dimensiona a ordem-mestre: o MENOR entre (a) risco riskPct ao SL e (b) margem ≤ costAbs USDT.
 * Nunca arrisca mais que riskPct da equity nem gasta mais que costAbs de margem. Arredonda ao
 * qtyStep; marca belowMin se o mínimo do símbolo forçar uma qty maior que o teto.
 */
export function computeMasterQty(i: MasterSizingInput): MasterSizingResult {
  const stopDist = i.sl != null && i.sl > 0 ? Math.abs(i.entry - i.sl) : null
  const qtyByRisk = stopDist && stopDist > 0 ? (i.equity * i.riskPct) / stopDist : Infinity
  const notionalCap = i.costAbs * Math.max(1, i.leverage) // margem máx × alavancagem
  const qtyByCost = i.entry > 0 ? notionalCap / i.entry : Infinity
  let qty = Math.min(qtyByRisk, qtyByCost)
  const which = qtyByRisk <= qtyByCost ? `risco ${(i.riskPct * 100).toFixed(2)}%` : `custo $${i.costAbs}`
  const step = i.instrument?.qtyStep ?? 0
  qty = roundQtyToStep(qty, step)
  const min = i.instrument?.minOrderQty ?? 0
  let belowMin = false
  if (min > 0 && qty < min) {
    belowMin = true
    qty = min // caller decide se aceita o mínimo do símbolo (excede ligeiramente o teto)
  }
  return { qty, reason: `${which} → ${qty}${belowMin ? " (min do símbolo)" : ""}`, belowMin }
}

export interface BybitOrderInput {
  symbol: string // ex.: BTCUSDT (linear perp)
  side: "buy" | "sell"
  qty: number // em contratos/base (ex.: 0.001 BTC)
  orderType?: "market" | "limit"
  price?: number | null // obrigatório em limit
  stopLoss?: number | null
  takeProfit?: number | null
  leverage?: number | null
}

/** Coloca uma ordem na conta-mestre (category linear). Devolve o resultado v5. */
export async function placeBybitOrder(o: BybitOrderInput) {
  if (o.leverage && o.leverage > 0) {
    await setBybitLeverage(o.symbol, o.leverage) // best-effort
  }
  const body: Record<string, unknown> = {
    category: "linear",
    symbol: o.symbol,
    side: o.side === "buy" ? "Buy" : "Sell",
    orderType: o.orderType === "limit" ? "Limit" : "Market",
    qty: String(o.qty),
    timeInForce: o.orderType === "limit" ? "GTC" : "IOC",
    positionIdx: 0, // one-way mode
    tpslMode: "Full",
  }
  if (o.orderType === "limit" && o.price) body.price = String(o.price)
  if (o.stopLoss && o.stopLoss > 0) body.stopLoss = String(o.stopLoss)
  if (o.takeProfit && o.takeProfit > 0) body.takeProfit = String(o.takeProfit)
  return signedRequest("POST", "/v5/order/create", body)
}

export interface BybitPerpTradeInput {
  symbol: string
  side: "buy" | "sell"
  qty: number
  leverage?: number | null
  stopLoss?: number | null
  takeProfits?: number[] | null // [tp1, tp2, tp3] — saídas parciais + TP máximo
  partials?: number[] | null // frações por TP (ex.: [0.4,0.3,0.3]); a última corre até ao TP máximo
  instrument?: BybitInstrument | null
}

export interface BybitPerpTradeResult {
  ok: boolean
  orderId: string | null
  retCode: number
  retMsg: string
  tps: { price: number; qty: number; ok: boolean; retMsg: string }[]
  slSet: boolean
}

/** Normaliza as frações parciais para o nº de TPs (default 50/30/20 em 3 níveis; senão iguais). */
function normalizePartials(partials: number[] | null | undefined, n: number): number[] {
  if (partials && partials.length === n && partials.every((p) => p > 0)) {
    const sum = partials.reduce((a, b) => a + b, 0)
    return partials.map((p) => p / sum)
  }
  if (n === 3) return [0.5, 0.3, 0.2]
  return Array.from({ length: n }, () => 1 / n)
}

/**
 * Abre a posição-MESTRE a mercado com SL COMPLETO + TPs PARCIAIS (ordens reduce-only limit
 * em cada nível — TP1/TP2 fecham parte, o resto corre até ao TP máximo). Preços arredondados
 * ao tickSize e quantidades ao qtyStep (senão a Bybit rejeita SL/TP). O Copy Trading nativo
 * replica a posição, o SL e os fechos parciais para os seguidores.
 */
export async function placeBybitPerp(o: BybitPerpTradeInput): Promise<BybitPerpTradeResult> {
  if (o.leverage && o.leverage > 0) await setBybitLeverage(o.symbol, o.leverage) // best-effort

  const tick = o.instrument?.tickSize ?? 0
  const step = o.instrument?.qtyStep ?? 0
  const minQty = o.instrument?.minOrderQty ?? 0
  const rp = (p: number) => (tick > 0 ? roundToTick(p, tick) : p)
  const sl = o.stopLoss != null && o.stopLoss > 0 ? rp(o.stopLoss) : null

  // 1) Entrada a mercado com SL completo na posição (tpslMode Full → SL cobre toda a posição).
  const entry = await signedRequest("POST", "/v5/order/create", {
    category: "linear",
    symbol: o.symbol,
    side: o.side === "buy" ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(o.qty),
    timeInForce: "IOC",
    positionIdx: 0,
    tpslMode: "Full",
    ...(sl != null ? { stopLoss: String(sl) } : {}),
  })
  const orderId = (entry.result as { orderId?: string } | null)?.orderId ?? null
  if (!entry.ok) {
    return { ok: false, orderId, retCode: entry.retCode, retMsg: entry.retMsg, tps: [], slSet: false }
  }

  // 2) TPs parciais como ordens reduce-only LIMIT do lado oposto. Leg abaixo do mínimo do
  //    símbolo é saltada e a sua quota vai para o último nível (evita rejeições em contas pequenas).
  const tps: BybitPerpTradeResult["tps"] = []
  const levels = (o.takeProfits ?? []).filter((t) => t != null && t > 0)
  if (levels.length) {
    const parts = normalizePartials(o.partials, levels.length)
    const oppSide = o.side === "buy" ? "Sell" : "Buy"
    let allocated = 0
    for (let i = 0; i < levels.length; i++) {
      const isLast = i === levels.length - 1
      let legQty = isLast ? roundQtyToStep(o.qty - allocated, step) : roundQtyToStep(o.qty * parts[i], step)
      if (!isLast && minQty > 0 && legQty < minQty) continue // quota fica p/ o último nível
      if (legQty <= 0) continue
      allocated += legQty
      const r = await signedRequest("POST", "/v5/order/create", {
        category: "linear",
        symbol: o.symbol,
        side: oppSide,
        orderType: "Limit",
        qty: String(legQty),
        price: String(rp(levels[i])),
        reduceOnly: true,
        timeInForce: "GTC",
        positionIdx: 0,
      })
      tps.push({ price: rp(levels[i]), qty: legQty, ok: r.ok, retMsg: r.retMsg })
    }
  }

  return { ok: true, orderId, retCode: entry.retCode, retMsg: entry.retMsg, tps, slSet: sl != null }
}

/** Ticker `.P`/`USDT` → símbolo linear Bybit (ex.: BTCUSDT.P → BTCUSDT). */
export function toBybitSymbol(ticker: string): string {
  return ticker.toUpperCase().replace(/^[A-Z]+:/, "").replace(/\.P$/, "")
}

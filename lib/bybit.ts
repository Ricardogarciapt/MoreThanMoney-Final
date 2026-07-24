import crypto from "crypto"

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

  const sign = crypto.createHmac("sha256", secret).update(payloadForSign).digest("hex")
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
    const json = (await res.json().catch(() => ({}))) as { retCode?: number; retMsg?: string; result?: unknown }
    return {
      ok: res.ok && json.retCode === 0,
      status: res.status,
      retCode: json.retCode ?? -1,
      retMsg: json.retMsg ?? "",
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

/** Ticker `.P`/`USDT` → símbolo linear Bybit (ex.: BTCUSDT.P → BTCUSDT). */
export function toBybitSymbol(ticker: string): string {
  return ticker.toUpperCase().replace(/^[A-Z]+:/, "").replace(/\.P$/, "")
}

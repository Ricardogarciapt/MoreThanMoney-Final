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
  costPct: number // margem por posição como fração da equity (ex.: 0.10 = 10%)
  riskPct?: number | null // teto opcional: fração da equity arriscada ao SL
  costAbs?: number | null // teto opcional: margem máxima por posição, em USDT
  instrument: BybitInstrument | null
}

export interface MasterSizingResult {
  qty: number
  reason: string
  belowMin: boolean
}

/**
 * Dimensiona a ordem-mestre pela margem = costPct da equity × alavancagem. Se riskPct e/ou
 * costAbs forem dados, funcionam como TETOS (o menor ganha). Arredonda ao qtyStep; marca
 * belowMin se o mínimo do símbolo forçar uma qty maior que o alvo.
 */
export function computeMasterQty(i: MasterSizingInput): MasterSizingResult {
  const lev = Math.max(1, i.leverage)
  const stopDist = i.sl != null && i.sl > 0 ? Math.abs(i.entry - i.sl) : null
  const cands: { q: number; label: string }[] = []
  if (i.entry > 0 && i.costPct > 0) cands.push({ q: (i.equity * i.costPct * lev) / i.entry, label: `${(i.costPct * 100).toFixed(0)}% equity` })
  if (i.riskPct && i.riskPct > 0 && stopDist && stopDist > 0) cands.push({ q: (i.equity * i.riskPct) / stopDist, label: `risco ${(i.riskPct * 100).toFixed(2)}%` })
  if (i.costAbs && i.costAbs > 0 && i.entry > 0) cands.push({ q: (i.costAbs * lev) / i.entry, label: `custo $${i.costAbs}` })
  if (!cands.length) return { qty: 0, reason: "sem base de sizing", belowMin: false }

  const winner = cands.reduce((a, b) => (b.q < a.q ? b : a))
  const step = i.instrument?.qtyStep ?? 0
  let qty = roundQtyToStep(winner.q, step)
  const min = i.instrument?.minOrderQty ?? 0
  let belowMin = false
  if (min > 0 && qty < min) {
    belowMin = true
    qty = min
  }
  return { qty, reason: `${winner.label} → ${qty}${belowMin ? " (min do símbolo)" : ""}`, belowMin }
}

/**
 * Muda o símbolo para margem ISOLADA (tradeMode 1) + define a alavancagem. Isola o risco de
 * cada posição (não cruza com o resto da conta). Best-effort: tolera "not modified" (110026).
 * Tem de ser chamado ANTES de abrir posição no símbolo (a Bybit não deixa trocar com posição aberta).
 */
export async function setBybitIsolated(symbol: string, leverage: number) {
  const lev = String(Math.max(1, Math.round(leverage)))
  const r = await signedRequest("POST", "/v5/position/switch-isolated", {
    category: "linear",
    symbol,
    tradeMode: 1, // 0 = cross, 1 = isolated
    buyLeverage: lev,
    sellLeverage: lev,
  })
  if (!r.ok && r.retCode !== 110026 /* margin mode not modified */) return r
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

/**
 * Define SL + TP na POSIÇÃO (tpslMode Full → aparecem no cartão da posição). Mais fiável que
 * pôr tp/sl nos parâmetros da ordem de mercado (a Bybit às vezes só aplica o SL). Faz 1 retry
 * curto porque logo após um fill a mercado a posição pode ainda não estar disponível.
 */
export async function setBybitPositionTpSl(
  symbol: string,
  o: { stopLoss?: number | null; takeProfit?: number | null; positionIdx?: number },
) {
  const body: Record<string, unknown> = {
    category: "linear",
    symbol,
    tpslMode: "Full",
    positionIdx: o.positionIdx ?? 0,
  }
  if (o.stopLoss && o.stopLoss > 0) body.stopLoss = String(o.stopLoss)
  if (o.takeProfit && o.takeProfit > 0) body.takeProfit = String(o.takeProfit)
  let r = await signedRequest("POST", "/v5/position/trading-stop", body)
  // 10001/130125 etc. logo após o fill = posição ainda não pronta → 1 retry.
  if (!r.ok && r.retCode !== 34040 /* not modified */) {
    await new Promise((res) => setTimeout(res, 800))
    r = await signedRequest("POST", "/v5/position/trading-stop", body)
  }
  return r
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
  tpFinalSet: boolean
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
  // Margem ISOLADA + alavancagem (isola o risco de cada trade). Se a troca falhar (ex.: conta
  // em modo cross-only), garante pelo menos a alavancagem. Antes de abrir posição.
  if (o.leverage && o.leverage > 0) {
    const iso = await setBybitIsolated(o.symbol, o.leverage)
    if (!iso.ok) await setBybitLeverage(o.symbol, o.leverage)
  }

  const tick = o.instrument?.tickSize ?? 0
  const step = o.instrument?.qtyStep ?? 0
  const minQty = o.instrument?.minOrderQty ?? 0
  const rp = (p: number) => (tick > 0 ? roundToTick(p, tick) : p)
  const sl = o.stopLoss != null && o.stopLoss > 0 ? rp(o.stopLoss) : null

  const levels = (o.takeProfits ?? []).filter((t) => t != null && t > 0)
  const finalTp = levels.length ? rp(levels[levels.length - 1]) : null // TP máximo → vai na posição
  const intermediates = levels.slice(0, -1) // TP1/TP2 → ordens reduce-only parciais

  // 1) Entrada a mercado (sem tp/sl nos parâmetros — colocados a seguir na posição).
  const entry = await signedRequest("POST", "/v5/order/create", {
    category: "linear",
    symbol: o.symbol,
    side: o.side === "buy" ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(o.qty),
    timeInForce: "IOC",
    positionIdx: 0,
  })
  const orderId = (entry.result as { orderId?: string } | null)?.orderId ?? null
  if (!entry.ok) {
    return { ok: false, orderId, retCode: entry.retCode, retMsg: entry.retMsg, tps: [], slSet: false, tpFinalSet: false }
  }

  // 1b) SL COMPLETO + TP FINAL na posição via trading-stop (aparecem no cartão; o Full
  //     auto-ajusta ao que sobrar depois das saídas parciais). Fiável (vs params da ordem).
  let slSet = false
  let tpFinalSet = false
  if (sl != null || finalTp != null) {
    const ts = await setBybitPositionTpSl(o.symbol, { stopLoss: sl, takeProfit: finalTp })
    slSet = ts.ok && sl != null
    tpFinalSet = ts.ok && finalTp != null
  }

  // 2) Saídas PARCIAIS (TP1/TP2) como ordens reduce-only LIMIT do lado oposto. O que sobrar
  //    corre até ao TP final da posição. Leg abaixo do mínimo do símbolo é saltada.
  const tps: BybitPerpTradeResult["tps"] = []
  if (intermediates.length) {
    const parts = normalizePartials(o.partials, levels.length) // frações sobre a posição inteira
    const oppSide = o.side === "buy" ? "Sell" : "Buy"
    for (let i = 0; i < intermediates.length; i++) {
      const legQty = roundQtyToStep(o.qty * parts[i], step)
      if (legQty <= 0 || (minQty > 0 && legQty < minQty)) continue // quota fica p/ o TP final
      const r = await signedRequest("POST", "/v5/order/create", {
        category: "linear",
        symbol: o.symbol,
        side: oppSide,
        orderType: "Limit",
        qty: String(legQty),
        price: String(rp(intermediates[i])),
        reduceOnly: true,
        timeInForce: "GTC",
        positionIdx: 0,
      })
      tps.push({ price: rp(intermediates[i]), qty: legQty, ok: r.ok, retMsg: r.retMsg })
    }
  }

  return { ok: true, orderId, retCode: entry.retCode, retMsg: entry.retMsg, tps, slSet, tpFinalSet }
}

/** Ticker `.P`/`USDT` → símbolo linear Bybit (ex.: BTCUSDT.P → BTCUSDT). */
export function toBybitSymbol(ticker: string): string {
  return ticker.toUpperCase().replace(/^[A-Z]+:/, "").replace(/\.P$/, "")
}

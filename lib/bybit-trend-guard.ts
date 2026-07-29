/**
 * Guarda de TENDÊNCIA para os perpétuos cripto.
 *
 * Objetivo: não ser apanhado em movimentos de contratendência. Só deixa entrar quando a
 * direção do sinal está a favor de DUAS confirmações macro:
 *   1) Tendência do BTC (EMA rápida vs lenta em klines 4h da Bybit).
 *   2) Breadth do "mercado cripto 30" (% do top-30 por market cap a subir, via CoinGecko).
 *
 * Assim trabalhamos sempre de forma segura: BUY só com macro a subir, SELL só com macro a descer.
 * Gated por env BYBIT_PERPS_TREND_GUARD (default ON). Fail-open em erro de rede (não bloqueia
 * por indisponibilidade de dados — apenas anota), para não travar o motor por um timeout.
 */

export type Trend = "up" | "down" | "flat"

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  // valores em ordem cronológica (antigo → recente)
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}

/** Tendência do BTC por EMA(21) vs EMA(50) em klines 4h (Bybit público, sem auth). */
export async function getBtcTrend(): Promise<{ trend: Trend; detail: string }> {
  try {
    const url =
      "https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=240&limit=120"
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    const j = await res.json()
    const list: string[][] = j?.result?.list ?? []
    if (!list.length) return { trend: "flat", detail: "sem klines BTC" }
    // Bybit devolve do mais recente para o mais antigo → invertemos para cronológico.
    const closes = list
      .map((row) => Number(row[4]))
      .filter((n) => Number.isFinite(n))
      .reverse()
    const fast = ema(closes, 21)
    const slow = ema(closes, 50)
    const last = closes[closes.length - 1]
    if (fast == null || slow == null || last == null) return { trend: "flat", detail: "klines BTC insuficientes" }
    const spread = ((fast - slow) / slow) * 100
    const trend: Trend = spread > 0.15 ? "up" : spread < -0.15 ? "down" : "flat"
    return { trend, detail: `BTC 4h EMA21${fast > slow ? ">" : "<"}EMA50 (${spread.toFixed(2)}%)` }
  } catch (e) {
    return { trend: "flat", detail: `erro BTC: ${e instanceof Error ? e.message : "?"}` }
  }
}

/** Breadth do "cripto 30": % do top-30 por market cap com variação 24h positiva (CoinGecko). */
export async function getCrypto30Trend(): Promise<{ trend: Trend; detail: string }> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&price_change_percentage=24h"
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } })
    clearTimeout(t)
    const arr = (await res.json()) as Array<{ price_change_percentage_24h?: number | null }>
    if (!Array.isArray(arr) || !arr.length) return { trend: "flat", detail: "sem dados cripto30" }
    // Exclui stablecoins (variação ~0) do cálculo de breadth.
    const moves = arr.map((c) => Number(c.price_change_percentage_24h)).filter((n) => Number.isFinite(n))
    const nonStable = moves.filter((m) => Math.abs(m) >= 0.1)
    const universe = nonStable.length ? nonStable : moves
    const up = universe.filter((m) => m > 0).length
    const breadth = up / universe.length
    const trend: Trend = breadth >= 0.6 ? "up" : breadth <= 0.4 ? "down" : "flat"
    return { trend, detail: `cripto30 breadth ${(breadth * 100).toFixed(0)}% up` }
  } catch (e) {
    return { trend: "flat", detail: `erro cripto30: ${e instanceof Error ? e.message : "?"}` }
  }
}

export interface TrendGuardResult {
  allow: boolean
  reason: string
  btc: Trend
  market: Trend
}

/**
 * Confirma que o `side` está a favor da tendência macro (BTC + cripto30).
 *   - BUY  exige que NENHUM dos dois esteja 'down' e pelo menos um 'up'.
 *   - SELL exige que NENHUM dos dois esteja 'up'  e pelo menos um 'down'.
 * 'flat' é neutro (não bloqueia sozinho). Isto evita entrar contra uma tendência macro clara.
 */
export async function perpsTrendGuard(side: "Buy" | "Sell"): Promise<TrendGuardResult> {
  // Fail-open: se a guarda estiver desligada, permite sempre.
  if (process.env.BYBIT_PERPS_TREND_GUARD === "false") {
    return { allow: true, reason: "trend-guard off", btc: "flat", market: "flat" }
  }
  const [btcR, mktR] = await Promise.all([getBtcTrend(), getCrypto30Trend()])
  const btc = btcR.trend
  const market = mktR.trend
  const isBuy = side === "Buy"
  const against = isBuy ? "down" : "up"
  const withT = isBuy ? "up" : "down"
  const detail = `${btcR.detail} · ${mktR.detail}`

  // Modo do guard (afinável sem redeploy):
  //  - "btc_primary" (default): o BTC 4h manda. Bloqueia SÓ se o BTC 4h estiver contra a direção.
  //    A breadth Cripto30 (24h, mais ruidosa) só desempata quando o BTC está flat. Assim os
  //    SHORTS num BTC-down deixam de ser vetados por um repique de breadth verde (o edge do
  //    backtest: SELL +58.9R). Longs continuam bloqueados em BTC-down.
  //  - "strict": comportamento antigo (BTC E breadth têm de concordar; nenhum contra).
  const mode = (process.env.BYBIT_TREND_GUARD_MODE || "btc_primary").toLowerCase()

  if (mode !== "strict") {
    if (btc === against) {
      return { allow: false, reason: `BTC 4h contratendência (${side}): ${detail}`, btc, market }
    }
    if (btc === "flat" && market === against) {
      return { allow: false, reason: `BTC 4h flat + breadth contra (${side}): ${detail}`, btc, market }
    }
    return { allow: true, reason: `OK btc-primário (${side}): ${detail}`, btc, market }
  }

  // ── modo "strict" (antigo) ──
  const anyAgainst = btc === against || market === against
  const anyWith = btc === withT || market === withT
  if (anyAgainst) {
    return { allow: false, reason: `contratendência macro (${side}): ${detail}`, btc, market }
  }
  if (!anyWith) {
    return { allow: false, reason: `sem tendência macro a favor (${side}): ${detail}`, btc, market }
  }
  return { allow: true, reason: `tendência macro OK (${side}): ${detail}`, btc, market }
}

// Render do gráfico TradingView via chart-img.com (v2 Advanced Chart) → PNG com as
// linhas da trade (entry/SL/TP) desenhadas. Key em process.env.CHARTIMG_API_KEY.
// Doc: POST https://api.chart-img.com/v2/tradingview/advanced-chart

const ENDPOINT = "https://api.chart-img.com/v2/tradingview/advanced-chart"

/** TradingView timeframe (min "60"/"15"/"240"/"1D") → intervalo chart-img ("1h"/"15m"/…). */
export function tfToChartImgInterval(tf: string | null | undefined): string {
  const t = String(tf ?? "").trim().toUpperCase()
  if (!t) return "1h"
  if (t === "1D" || t === "D" || t === "1440") return "1D"
  if (t === "1W" || t === "W") return "1W"
  const min = Number(t)
  if (!Number.isFinite(min)) return "1h"
  if (min >= 1440) return "1D"
  if (min >= 60) return `${Math.round(min / 60)}h`
  return `${min}m`
}

/** Constrói o símbolo TradingView (EXCHANGE:SYMBOL) a partir do ticker + exchange do sinal. */
export function buildChartImgSymbol(ticker: string, exchange?: string | null): string {
  const t = ticker.toUpperCase().replace(/^[A-Z]+:/, "")
  const ex = (exchange || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (ex) return `${ex}:${t}`
  if (/\.P$/.test(t) || /USDT$/.test(t)) return `BYBIT:${t}` // perps cripto
  if (/^XAU|^XAG/.test(t)) return `OANDA:${t}`
  return `FX:${t}`
}

export interface ChartImgSignal {
  symbol: string // já EXCHANGE:SYMBOL
  interval: string
  direction: "buy" | "sell" | null
  entry: number | null
  sl: number | null
  tps: number[]
  width?: number
  height?: number
}

const hline = (price: number, color: string, width = 2) => ({
  name: "Horizontal Line",
  input: { price },
  override: { lineWidth: width, lineColor: color },
})

/**
 * Renderiza o gráfico real com as linhas da trade. Devolve os bytes PNG ou null (falha/sem key).
 * Só desenha níveis válidos; respeita o limite de params do plano (máx 5 linhas ≈ PRO).
 */
export async function renderSignalChartPng(sig: ChartImgSignal): Promise<ArrayBuffer | null> {
  const key = process.env.CHARTIMG_API_KEY
  if (!key) return null

  const drawings: unknown[] = []
  if (sig.entry != null && sig.entry > 0) drawings.push(hline(sig.entry, "rgb(59,130,246)", 2)) // azul
  if (sig.sl != null && sig.sl > 0) drawings.push(hline(sig.sl, "rgb(239,68,68)", 2)) // vermelho
  for (const tp of sig.tps.filter((x) => x > 0).slice(0, 3)) drawings.push(hline(tp, "rgb(22,185,129)", 2)) // verde

  const body = {
    symbol: sig.symbol,
    interval: sig.interval,
    theme: "dark",
    width: Math.min(sig.width ?? 1200, 1920),
    height: Math.min(sig.height ?? 675, 1080),
    drawings,
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.error("[chart-image] chart-img erro", res.status, (await res.text()).slice(0, 200))
      return null
    }
    const ct = res.headers.get("content-type") || ""
    if (!ct.startsWith("image/")) {
      console.error("[chart-image] resposta não-imagem", ct)
      return null
    }
    return await res.arrayBuffer()
  } catch (e) {
    console.error("[chart-image] fetch falhou", e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

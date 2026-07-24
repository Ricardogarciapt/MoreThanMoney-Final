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
  alertName?: string | null
  width?: number
  height?: number
}

const hline = (price: number, color: string, width = 2) => ({
  name: "Horizontal Line",
  input: { price },
  override: { lineWidth: width, lineColor: color },
})

// Studies built-in do chart-img que reproduzem os plots dos scanners MTM.
// Família MTM/Aurum: stack DEMA (15/50/238) + POC (Volume Profile) + RSI.
const DEMA = (len: number) => ({ name: "Double EMA", input: { length: len } })
const POC = { name: "Volume Profile Visible Range" }
const RSI = { name: "Relative Strength Index" }

/** Studies (em ordem de prioridade) para o scanner do sinal, pelo nome do alerta. */
export function studiesForScanner(alertName?: string | null): { name: string; input?: unknown; override?: unknown }[] {
  const a = (alertName || "").toLowerCase()
  // Aurum Flow e MTM Scanner partilham a base DEMA+POC+RSI
  if (/aurum|mtm\s*scanner|perps/.test(a)) {
    return [DEMA(15), DEMA(50), DEMA(238), POC, RSI]
  }
  // Sensei / GoldKiller (ouro) — DEMA + POC como contexto (afina-se depois com os plots próprios)
  if (/sensei|goldkiller|gold/.test(a)) {
    return [DEMA(50), DEMA(238), POC, RSI]
  }
  return [DEMA(50), DEMA(238)]
}

/**
 * Renderiza o gráfico real com as linhas da trade. Devolve os bytes PNG ou null (falha/sem key).
 * Só desenha níveis válidos; respeita o limite de params do plano (máx 5 linhas ≈ PRO).
 */
export async function renderSignalChartPng(sig: ChartImgSignal): Promise<ArrayBuffer | null> {
  return (await renderSignalChart(sig)).png
}

/** Igual, mas devolve também o erro/body para debug. */
export async function renderSignalChart(sig: ChartImgSignal): Promise<{ png: ArrayBuffer | null; error?: string; body?: unknown }> {
  const key = process.env.CHARTIMG_API_KEY
  if (!key) return { png: null, error: "sem CHARTIMG_API_KEY" }

  // Orçamento combinado de studies+drawings (limite do plano): PRO 5 · MEGA 10.
  const budget = Math.max(2, Number(process.env.CHARTIMG_MAX_PARAMS || 5))
  const st = studiesForScanner(sig.alertName)
  const tps = sig.tps.filter((x) => x > 0).slice(0, 3)

  // Lista ordenada por prioridade (trade primeiro, depois contexto do study), tag s/d.
  type Item = { t: "s" | "d"; v: unknown }
  const seq: Item[] = []
  if (sig.entry != null && sig.entry > 0) seq.push({ t: "d", v: hline(sig.entry, "rgb(59,130,246)", 2) })
  if (sig.sl != null && sig.sl > 0) seq.push({ t: "d", v: hline(sig.sl, "rgb(239,68,68)", 2) })
  if (tps[0]) seq.push({ t: "d", v: hline(tps[0], "rgb(22,185,129)", 2) })
  if (st[0]) seq.push({ t: "s", v: st[0] }) // DEMA rápida
  if (st[1]) seq.push({ t: "s", v: st[1] }) // DEMA média
  if (st[2]) seq.push({ t: "s", v: st[2] }) // DEMA lenta / POC
  if (tps[1]) seq.push({ t: "d", v: hline(tps[1], "rgb(22,185,129)", 2) })
  if (st[3]) seq.push({ t: "s", v: st[3] })
  if (tps[2]) seq.push({ t: "d", v: hline(tps[2], "rgb(22,185,129)", 2) })
  if (st[4]) seq.push({ t: "s", v: st[4] })

  const chosen = seq.slice(0, budget)
  const studies = chosen.filter((x) => x.t === "s").map((x) => x.v)
  const drawings = chosen.filter((x) => x.t === "d").map((x) => x.v)

  const body = {
    symbol: sig.symbol,
    interval: sig.interval,
    theme: "dark",
    width: Math.min(sig.width ?? 1200, 1920),
    height: Math.min(sig.height ?? 675, 1080),
    studies,
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
      const t = (await res.text()).slice(0, 400)
      console.error("[chart-image] chart-img erro", res.status, t)
      return { png: null, error: `${res.status} ${t}`, body }
    }
    const ct = res.headers.get("content-type") || ""
    if (!ct.startsWith("image/")) {
      return { png: null, error: `content-type ${ct}`, body }
    }
    return { png: await res.arrayBuffer() }
  } catch (e) {
    return { png: null, error: e instanceof Error ? e.message : String(e), body }
  } finally {
    clearTimeout(timer)
  }
}

/** Captura de screenshot e URL do gráfico TradingView (tv.js) — uso partilha Social. */

const CAPTURE_TIMEOUT_MS = 18_000

export type ChartShareSnapshot = {
  image: string | null
  chartUrl: string | null
  symbol: string
  warnings: string[]
}

export function normalizeChartImageData(data: unknown): string | null {
  if (data == null) return null
  if (typeof data === "string") {
    const s = data.trim()
    if (!s) return null
    if (s.startsWith("data:image")) return s
    if (s.length > 80) return `data:image/png;base64,${s}`
    return null
  }
  return null
}

export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader()
      reader.onloadend = () => {
        resolve(typeof reader.result === "string" ? reader.result : null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    } catch {
      resolve(null)
    }
  })
}

function captureFromCanvas(container?: HTMLElement | null): string | null {
  if (!container) return null
  try {
    const canvas = container.querySelector("canvas")
    if (canvas && typeof canvas.toDataURL === "function") {
      return canvas.toDataURL("image/png")
    }
  } catch (e) {
    console.warn("[chart-capture] canvas fallback:", e)
  }
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} (timeout ${ms}ms)`)), ms)
    ),
  ])
}

type TvWidgetCaptureApi = {
  takeClientScreenshot?: (opts?: object) => Promise<HTMLCanvasElement>
  takeScreenshot?: () => Promise<unknown>
}

type TvChartCaptureApi = {
  takeScreenshot?: () => Promise<unknown>
  getImage?: () => Promise<unknown>
}

async function captureFromWidgetApi(widget: unknown): Promise<string | null> {
  const w = widget as TvWidgetCaptureApi | null
  if (!w) return null

  if (w.takeClientScreenshot) {
    try {
      const canvas = await withTimeout(
        w.takeClientScreenshot({ hideStudiesFromLegend: false }),
        CAPTURE_TIMEOUT_MS,
        "takeClientScreenshot"
      )
      if (canvas && typeof canvas.toDataURL === "function") {
        const dataUrl = canvas.toDataURL("image/png")
        if (dataUrl && dataUrl.length > 80) return dataUrl
      }
    } catch (e) {
      console.warn("[chart-capture] takeClientScreenshot:", e)
    }
  }

  if (w.takeScreenshot) {
    try {
      const raw = await withTimeout(w.takeScreenshot(), CAPTURE_TIMEOUT_MS, "widget.takeScreenshot")
      if (typeof Blob !== "undefined" && raw instanceof Blob) {
        const fromBlob = await blobToDataUrl(raw)
        if (fromBlob) return fromBlob
      }
      const normalized = normalizeChartImageData(raw)
      if (normalized) return normalized
    } catch (e) {
      console.warn("[chart-capture] widget.takeScreenshot:", e)
    }
  }

  return null
}

async function captureFromChartApi(chart: unknown): Promise<string | null> {
  const c = chart as TvChartCaptureApi | null
  if (!c) return null

  if (c.takeScreenshot) {
    try {
      const raw = await withTimeout(c.takeScreenshot(), CAPTURE_TIMEOUT_MS, "chart.takeScreenshot")
      if (typeof Blob !== "undefined" && raw instanceof Blob) {
        const fromBlob = await blobToDataUrl(raw)
        if (fromBlob) return fromBlob
      }
      const normalized = normalizeChartImageData(raw)
      if (normalized) return normalized
    } catch (e) {
      console.warn("[chart-capture] chart.takeScreenshot:", e)
    }
  }

  if (c.getImage) {
    try {
      const raw = await withTimeout(c.getImage(), CAPTURE_TIMEOUT_MS, "getImage")
      const normalized = normalizeChartImageData(raw)
      if (normalized) return normalized
    } catch (e) {
      console.warn("[chart-capture] getImage:", e)
    }
  }

  return null
}

/**
 * Snapshot nativo TradingView (igual «Take a snapshot» / Copiar imagem da toolbar).
 * Ordem: takeClientScreenshot (widget) → takeScreenshot (widget/chart) → getImage → canvas.
 */
export async function captureChartScreenshot(
  chart: unknown,
  container?: HTMLElement | null,
  widget?: unknown
): Promise<string | null> {
  const fromWidget = await captureFromWidgetApi(widget)
  if (fromWidget) return fromWidget

  const fromChart = await captureFromChartApi(chart)
  if (fromChart) return fromChart

  return captureFromCanvas(container)
}

export type ChartUrlFallback = {
  symbol: string
  interval: string
  studies: string[]
  theme: "light" | "dark"
}

/** Link nativo de partilha TradingView (ex.: https://www.tradingview.com/x/0SgTjyBD/) */
export const NATIVE_TV_SHARE_PATH_RE = /\/x\/[A-Za-z0-9]+\/?$/i

export function isNativeTradingViewShareUrl(url: string | null | undefined): boolean {
  const u = String(url || "").trim()
  if (!u) return false
  try {
    const parsed = new URL(u)
    if (!parsed.hostname.includes("tradingview.com")) return false
    return NATIVE_TV_SHARE_PATH_RE.test(parsed.pathname)
  } catch {
    return /tradingview\.com\/x\/[A-Za-z0-9]+/i.test(u)
  }
}

/** Normaliza URL nativa TV (barra final, https). */
export function normalizeNativeTradingViewShareUrl(url: string): string {
  let u = url.trim()
  if (!u) return u
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    if (parsed.hostname === "tradingview.com") parsed.hostname = "www.tradingview.com"
    if (NATIVE_TV_SHARE_PATH_RE.test(parsed.pathname) && !parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`
    }
    return parsed.toString()
  } catch {
    return u.endsWith("/") ? u : `${u}/`
  }
}

async function fetchChartUrlFromApis(chart: unknown, widget: unknown): Promise<string | null> {
  const c = chart as { getChartUrl?: () => Promise<string> } | null
  const w = widget as { getChartUrl?: () => Promise<string> } | null

  try {
    if (c?.getChartUrl) {
      const url = await withTimeout(c.getChartUrl(), 10_000, "getChartUrl")
      if (url && typeof url === "string") return url.trim()
    }
  } catch (e) {
    console.warn("[chart-capture] chart.getChartUrl:", e)
  }

  try {
    if (w?.getChartUrl) {
      const url = await withTimeout(w.getChartUrl(), 10_000, "widget.getChartUrl")
      if (url && typeof url === "string") return url.trim()
    }
  } catch (e) {
    console.warn("[chart-capture] widget.getChartUrl:", e)
  }

  return null
}

/** Apenas link nativo /x/… (getChartUrl). Sem fallback chart/?symbol=… */
export async function resolveNativeChartShareUrl(
  chart: unknown,
  widget: unknown
): Promise<string | null> {
  const raw = await fetchChartUrlFromApis(chart, widget)
  if (!raw) return null
  if (isNativeTradingViewShareUrl(raw)) return normalizeNativeTradingViewShareUrl(raw)
  return null
}

/** URL de partilha TradingView (getChartUrl) ou link construído (pré-visualização / cópia). */
export async function resolveChartShareUrl(
  chart: unknown,
  widget: unknown,
  fallback: ChartUrlFallback
): Promise<string | null> {
  const native = await resolveNativeChartShareUrl(chart, widget)
  if (native) return native

  const raw = await fetchChartUrlFromApis(chart, widget)
  if (raw) return raw

  const { symbol, interval, studies, theme } = fallback
  const base = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`
  const studiesParam = studies.length > 0 ? `&studies=${encodeURIComponent(studies.join(","))}` : ""
  const themeParam = theme === "dark" ? "&theme=dark" : "&theme=light"
  return `${base}${studiesParam}${themeParam}`
}

export function resolveChartSymbol(chart: unknown, fallbackSymbol: string): string {
  try {
    const c = chart as { symbol?: () => string } | null
    if (c?.symbol && typeof c.symbol === "function") {
      const s = c.symbol()
      if (s && typeof s === "string") return s
    }
  } catch {
    /* ignore */
  }
  return fallbackSymbol
}

/** Captura completa para o diálogo de partilha Social. */
export async function buildChartShareSnapshot(input: {
  chart: unknown
  widget: unknown
  container?: HTMLElement | null
  fallbackSymbol: string
  urlFallback: ChartUrlFallback
}): Promise<ChartShareSnapshot> {
  const warnings: string[] = []
  const symbol = resolveChartSymbol(input.chart, input.fallbackSymbol)

  let image: string | null = null
  let chartUrl: string | null = null

  try {
    image = await captureChartScreenshot(input.chart, input.container, input.widget)
    if (!image) warnings.push("Não foi possível capturar a imagem do gráfico. Podes tentar «Atualizar captura».")
  } catch (e) {
    warnings.push("Erro ao capturar imagem do gráfico.")
    console.warn("[chart-capture] image:", e)
  }

  try {
    const native = await resolveNativeChartShareUrl(input.chart, input.widget)
    if (native) {
      chartUrl = native
    } else {
      warnings.push(
        "Link nativo indisponível. No TradingView usa «Share chart» / ⌥S para obter um link tradingview.com/x/… antes de publicar."
      )
    }
  } catch (e) {
    warnings.push("Não foi possível obter o link nativo do gráfico (getChartUrl).")
    console.warn("[chart-capture] url:", e)
  }

  return { image, chartUrl, symbol, warnings }
}

/** Link TradingView construído a partir do símbolo/timeframe (síncrono, para pré-visualização). */
export function buildChartShareUrlFromFallback(fallback: ChartUrlFallback): string {
  const { symbol, interval, studies, theme } = fallback
  const base = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`
  const studiesParam = studies.length > 0 ? `&studies=${encodeURIComponent(studies.join(","))}` : ""
  const themeParam = theme === "dark" ? "&theme=dark" : "&theme=light"
  return `${base}${studiesParam}${themeParam}`
}

/** Captura nativa (igual botão «Take a snapshot» / Copiar imagem do TradingView). */
export async function captureNativeTradingViewImage(
  getChart: () => unknown,
  captureChartImage?: () => Promise<string | null>,
  getWidget?: () => unknown,
  container?: HTMLElement | null
): Promise<string | null> {
  if (captureChartImage) {
    try {
      const dedicated = await captureChartImage()
      if (dedicated && dedicated.length > 80) return dedicated
    } catch (e) {
      console.warn("[chart-capture] captureChartImage:", e)
    }
  }

  return captureChartScreenshot(getChart(), container ?? null, getWidget?.())
}

/** Copia imagem PNG para a área de transferência (como «Copiar imagem» do TradingView). */
export async function copyChartImageToClipboard(dataUrl: string): Promise<void> {
  if (!dataUrl || dataUrl.length < 80) {
    throw new Error("Sem imagem para copiar. Atualiza a captura primeiro.")
  }

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const type = blob.type.startsWith("image/") ? blob.type : "image/png"
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
    return
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(dataUrl)
    return
  }

  throw new Error("O browser não suporta copiar imagens. Usa Chrome/Edge ou o menu do gráfico (clique direito).")
}

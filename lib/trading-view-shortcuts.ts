/** Atalhos do gráfico TradingView (tv.js) — link nativo e fallbacks. */

import {
  resolveChartShareUrl,
  type ChartUrlFallback,
} from "@/lib/chart-share-capture"

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    !!target.closest("[role='dialog']")
  )
}

/** Foco dentro do iframe TV — o browser NÃO envia keydown à página pai (cross-origin). */
export function isFocusInsideTradingViewIframe(
  chartContainer?: HTMLElement | null
): boolean {
  const active = document.activeElement
  if (active instanceof HTMLIFrameElement) return true
  if (!chartContainer) return false
  const iframe = chartContainer.querySelector("iframe")
  return active === iframe
}

function isAltOrOptionPressed(e: KeyboardEvent): boolean {
  return (
    e.altKey ||
    e.getModifierState?.("Alt") === true ||
    e.getModifierState?.("AltGraph") === true
  )
}

/** ⌥S / Alt+S — deteção por physical key (Mac Option muda e.key para ß, etc.). */
export function isShareChartLinkShortcut(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return false
  if (!isAltOrOptionPressed(e)) return false
  return e.code === "KeyS"
}

function collectChartTargets(chart: unknown, widget: unknown): unknown[] {
  const w = widget as { chart?: () => unknown; activeChart?: () => unknown } | null
  const targets: unknown[] = []
  if (chart) targets.push(chart)
  try {
    const active = w?.activeChart?.()
    if (active) targets.push(active)
  } catch {
    /* ignore */
  }
  try {
    const main = w?.chart?.()
    if (main && !targets.includes(main)) targets.push(main)
  } catch {
    /* ignore */
  }
  return targets
}

export async function getChartShareUrlFromApi(
  chart: unknown,
  widget: unknown
): Promise<string | null> {
  for (const target of collectChartTargets(chart, widget)) {
    const c = target as { getChartUrl?: () => Promise<string> } | null
    try {
      if (c?.getChartUrl) {
        const url = await c.getChartUrl()
        if (url && typeof url === "string") return url.trim()
      }
    } catch {
      /* try next */
    }
  }

  const w = widget as { getChartUrl?: () => Promise<string> } | null
  try {
    if (w?.getChartUrl) {
      const url = await w.getChartUrl()
      if (url) return url.trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

function isClipboardShortcut(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  const code = e.code
  return (
    code === "KeyC" ||
    code === "KeyV" ||
    code === "KeyX" ||
    code === "KeyA" ||
    code === "KeyZ" ||
    code === "KeyY"
  )
}

export type CopyChartLinkResult = {
  url: string
  native: boolean
}

/**
 * Copia link do gráfico: prioriza getChartUrl (nativo TV); senão link construído.
 */
export async function copyChartShareLink(
  chart: unknown,
  widget: unknown,
  urlFallback: ChartUrlFallback
): Promise<CopyChartLinkResult> {
  const nativeUrl = await getChartShareUrlFromApi(chart, widget)
  const url = nativeUrl ?? (await resolveChartShareUrl(chart, widget, urlFallback))

  if (!url?.trim()) {
    throw new Error("Não foi possível obter o link do gráfico.")
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url.trim())
  } else {
    throw new Error("Área de transferência indisponível neste browser.")
  }

  return { url: url.trim(), native: Boolean(nativeUrl) }
}

/** Copia link nativo do gráfico (getChartUrl quando existir). */
export async function copyNativeChartShareLink(
  chart: unknown,
  widget: unknown,
  urlFallback?: ChartUrlFallback
): Promise<string | null> {
  if (urlFallback) {
    const { url } = await copyChartShareLink(chart, widget, urlFallback)
    return url
  }
  const nativeUrl = await getChartShareUrlFromApi(chart, widget)
  if (!nativeUrl) return null
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(nativeUrl)
  }
  return nativeUrl
}

export type TradingViewShortcutOptions = {
  urlFallback?: ChartUrlFallback
  chartContainer?: HTMLElement | null
}

/**
 * ⌥S / Alt+S — copiar link (só quando o foco NÃO está no iframe TV).
 * Com foco no iframe, o atalho fica no TradingView (snapshot nativo); usa o botão «Copiar link».
 */
export async function handleTradingViewKeyboardShortcut(
  e: KeyboardEvent,
  chart: unknown,
  widget: unknown,
  options?: TradingViewShortcutOptions
): Promise<"share-link" | "share-link-fallback" | "save" | "share-link-failed" | null> {
  if (isEditableTarget(e.target)) return null
  if (isClipboardShortcut(e)) return null

  const isSaveKey = e.code === "KeyS"

  if (isShareChartLinkShortcut(e) && options?.urlFallback) {
    if (isFocusInsideTradingViewIframe(options.chartContainer)) {
      /* Não chamar preventDefault — deixa o TV processar ⌥S dentro do iframe */
      return null
    }

    try {
      const { native } = await copyChartShareLink(chart, widget, options.urlFallback)
      e.preventDefault()
      e.stopPropagation()
      return native ? "share-link" : "share-link-fallback"
    } catch {
      return "share-link-failed"
    }
  }

  if ((e.ctrlKey || e.metaKey) && isSaveKey && !e.altKey) {
    e.preventDefault()
    e.stopPropagation()
    const w = widget as {
      save?: (options?: unknown) => void
      chart?: () => { save?: () => void }
    } | null
    try {
      const ch = w?.chart?.()
      if (ch && typeof ch.save === "function") {
        ch.save()
        return "save"
      }
      if (w && typeof w.save === "function") {
        w.save()
        return "save"
      }
    } catch (err) {
      console.warn("[tv-shortcuts] save:", err)
    }
    return "save"
  }

  return null
}

export function focusTradingViewIframe(container: HTMLElement | null | undefined): void {
  if (!container) return
  const iframe = container.querySelector("iframe")
  if (iframe instanceof HTMLIFrameElement) {
    try {
      iframe.focus()
      iframe.contentWindow?.focus()
    } catch {
      /* cross-origin */
    }
  }
}

/** Foca a área do gráfico (wrapper) para ⌥S copiar link pela nossa página. */
export function focusChartStageWrapper(stage: HTMLElement | null | undefined): void {
  if (!stage) return
  try {
    stage.focus({ preventScroll: true })
  } catch {
    stage.focus()
  }
}

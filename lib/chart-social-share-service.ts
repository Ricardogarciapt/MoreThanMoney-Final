/**
 * Orquestração da partilha de gráfico → aba Social (captura + trade + publicação).
 */

import {
  buildChartShareSnapshot,
  captureNativeTradingViewImage,
  isNativeTradingViewShareUrl,
  normalizeNativeTradingViewShareUrl,
  resolveNativeChartShareUrl,
  type ChartShareSnapshot,
  type ChartUrlFallback,
} from "@/lib/chart-share-capture"
import {
  buildChartSharePostContent,
  chartShareDraftToPayload,
  emptyChartShareTradeDraft,
  extractChartShareTradeDraft,
  type ChartShareTradeDraft,
} from "@/lib/chart-share-trade"
import { inferChartSocialCategory, type ChartSocialCategory } from "@/lib/chart-social-category"

export type ChartSharePrepareInput = {
  symbol: string
  widgetLoaded: boolean
  getChart: () => unknown
  getWidget: () => unknown
  chartContainer?: HTMLElement | null
  urlFallback: ChartUrlFallback
  /** Captura dedicada (ex.: takeScreenshot do widget) — tem prioridade */
  captureChartImage?: () => Promise<string | null>
  /** Aguarda o iframe TV antes da captura (ms) */
  captureDelayMs?: number
  /** Imagem já capturada antes de abrir o modal */
  prefetchImage?: string | null
  /** Link nativo TV (getChartUrl / ⌥S) se já obtido */
  prefetchChartUrl?: string | null
  /** Não voltar a capturar imagem (só trade + URL nativa) */
  skipImageCapture?: boolean
}

export type ChartSharePrepared = {
  snapshot: ChartShareSnapshot
  trade: ChartShareTradeDraft
  category: ChartSocialCategory
}

export type ChartSharePublishInput = {
  symbol: string
  chartUrl: string | null
  /** Snapshot do gráfico (opcional; secundário face à mídia do utilizador) */
  chartImage: string | null
  /** URLs já enviadas para o Storage (mídia principal do post) */
  mediaUrls?: string[]
  category: ChartSocialCategory
  description: string
  trade: ChartShareTradeDraft
  urlFallback?: ChartUrlFallback
}

export type ChartSharePublishResult = {
  success: boolean
  postId?: string
  category: ChartSocialCategory
  mediaUrl?: string | null
  redirectUrl: string
  warning?: string
  error?: string
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function focusChartContainer(container?: HTMLElement | null): void {
  if (!container) return
  try {
    const iframe = container.querySelector("iframe")
    if (iframe instanceof HTMLIFrameElement) {
      iframe.focus()
    }
  } catch {
    /* cross-origin */
  }
}

/** Prepara captura de imagem, URL e níveis de trade dos scanners. */
export async function prepareChartSocialShare(
  input: ChartSharePrepareInput
): Promise<ChartSharePrepared> {
  if (!input.widgetLoaded) {
    throw new Error("O gráfico ainda está a carregar. Aguarda alguns segundos.")
  }

  focusChartContainer(input.chartContainer ?? null)
  if (input.captureDelayMs && input.captureDelayMs > 0) {
    await delay(input.captureDelayMs)
  }

  const chart = input.getChart()
  const widget = input.getWidget()

  let snapshot = await buildChartShareSnapshot({
    chart,
    widget,
    container: input.chartContainer ?? null,
    fallbackSymbol: input.symbol,
    urlFallback: input.urlFallback,
  })

  try {
    const nativeUrl = await resolveNativeChartShareUrl(chart, widget)
    if (nativeUrl) {
      snapshot = { ...snapshot, chartUrl: nativeUrl }
    }
  } catch (e) {
    console.warn("[chart-social-share] getChartUrl:", e)
  }

  if (input.prefetchChartUrl?.trim()) {
    const pref = input.prefetchChartUrl.trim()
    if (isNativeTradingViewShareUrl(pref)) {
      snapshot = { ...snapshot, chartUrl: normalizeNativeTradingViewShareUrl(pref) }
    }
  }

  if (input.prefetchImage && input.prefetchImage.length > 80) {
    snapshot = { ...snapshot, image: input.prefetchImage }
  } else if (!input.skipImageCapture) {
    try {
      const nativeImage = await captureNativeTradingViewImage(
        input.getChart,
        input.captureChartImage,
        input.getWidget,
        input.chartContainer ?? null
      )
      if (nativeImage && nativeImage.length > 80) {
        snapshot = { ...snapshot, image: nativeImage }
      }
    } catch (e) {
      console.warn("[chart-social-share] captura nativa:", e)
      if (!snapshot.image) {
        snapshot.warnings.push("Captura nativa falhou; tenta «Atualizar captura».")
      }
    }
  }

  let trade = emptyChartShareTradeDraft(snapshot.symbol)
  try {
    trade = await extractChartShareTradeDraft(chart, snapshot.symbol)
  } catch (e) {
    console.warn("[chart-social-share] extração trade:", e)
    snapshot.warnings.push(
      "Não foi possível ler níveis do indicador automaticamente. Preenche Entrada/SL/TP manualmente."
    )
  }

  const category = inferChartSocialCategory(snapshot.symbol)

  return { snapshot, trade, category }
}

export function validateChartShareBeforePublish(input: ChartSharePublishInput): string | null {
  if (input.chartImage && input.chartImage.length > 6_000_000) {
    return "A imagem do gráfico é demasiado grande. Remove o snapshot ou usa ficheiros mais pequenos."
  }
  return null
}

/** Publica no Social via API. */
export async function publishChartToSocial(
  input: ChartSharePublishInput
): Promise<ChartSharePublishResult> {
  const validationError = validateChartShareBeforePublish(input)
  if (validationError) {
    return {
      success: false,
      category: input.category,
      redirectUrl: `/app-mobile?tab=social&category=${input.category}`,
      error: validationError,
    }
  }

  const payload = chartShareDraftToPayload({
    symbol: input.symbol,
    chartUrl: input.chartUrl,
    chartImage: input.chartImage,
    mediaUrls: input.mediaUrls,
    category: input.category,
    description: input.description,
    trade: input.trade,
  })

  const response = await fetch("/api/social/share-chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  })

  let body: Record<string, unknown> = {}
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    return {
      success: false,
      category: input.category,
      redirectUrl: `/app-mobile?tab=social&category=${input.category}`,
      error: "Resposta inválida do servidor.",
    }
  }

  if (!response.ok) {
    return {
      success: false,
      category: input.category,
      redirectUrl: `/app-mobile?tab=social&category=${input.category}`,
      error: String(body.error || "Erro ao publicar no Social."),
    }
  }

  const category = (body.category as ChartSocialCategory) || input.category
  const redirectUrl =
    typeof body.redirectUrl === "string"
      ? body.redirectUrl
      : `/app-mobile?tab=social&category=${category}`

  return {
    success: true,
    postId: typeof body.postId === "string" ? body.postId : undefined,
    category,
    mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl : null,
    redirectUrl,
    warning: typeof body.warning === "string" ? body.warning : undefined,
  }
}

/** Texto da pré-visualização (link + parâmetros da trade sempre visíveis). */
export function buildSharePreviewText(
  symbol: string,
  chartUrl: string | null,
  description: string,
  trade: ChartShareTradeDraft,
  urlFallback?: ChartUrlFallback
): string {
  return buildChartSharePostContent({
    symbol,
    chartUrl,
    urlFallback,
    description,
    preview: true,
    trade: {
      direction: trade.direction,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      takeProfits: trade.takeProfits,
    },
  })
}

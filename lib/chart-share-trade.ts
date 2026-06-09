/** Rascunho de níveis de trade para partilha no Social (scanners MTM → app-mobile). */

import type { ChartUrlFallback } from "@/lib/chart-share-capture"
import type { ChartSocialCategory } from "@/lib/chart-social-category"

export type TradeDirection = "bullish" | "bearish" | ""

export interface ChartShareTradeDraft {
  direction: TradeDirection
  entry: string
  stopLoss: string
  /** TP1 … TP5 (opcionais) */
  takeProfits: [string, string, string, string, string]
  symbol: string
  /** True se algum valor veio da extração automática do gráfico/indicador */
  detectedFromChart: boolean
}

export function emptyChartShareTradeDraft(symbol = ""): ChartShareTradeDraft {
  return {
    direction: "",
    entry: "",
    stopLoss: "",
    takeProfits: ["", "", "", "", ""],
    symbol,
    detectedFromChart: false,
  }
}

function normalizePrice(raw: unknown): string {
  if (raw == null) return ""
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".")
  if (!s || s === "0" || s === "NaN") return ""
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return String(n)
}

function pickInput(inputs: Record<string, unknown>, keyFragments: string[]): string {
  for (const [k, v] of Object.entries(inputs)) {
    const kl = k.toLowerCase()
    if (keyFragments.some((frag) => kl.includes(frag.toLowerCase()))) {
      const p = normalizePrice(v)
      if (p) return p
    }
  }
  return ""
}

function inferDirectionFromInputs(inputs: Record<string, unknown>): TradeDirection {
  const blob = JSON.stringify(inputs).toUpperCase()
  if (/BUY|BULL|LONG|COMPRA|"1"/.test(blob) && !/SELL|BEAR|SHORT|VENDA/.test(blob)) {
    return "bullish"
  }
  if (/SELL|BEAR|SHORT|VENDA|"2"|"-1"/.test(blob)) return "bearish"
  const pos = pickInput(inputs, ["position", "side", "bias", "direction", "signal"])
  if (/buy|bull|long|compra/i.test(pos)) return "bullish"
  if (/sell|bear|short|venda/i.test(pos)) return "bearish"
  return ""
}

/** Lê inputs dos estudos MTM (Kill Shot, Momentum, etc.) via API TradingView. */
async function extractFromStudyInputs(chart: any): Promise<Partial<ChartShareTradeDraft>> {
  const partial: Partial<ChartShareTradeDraft> = {
    takeProfits: ["", "", "", "", ""],
  }

  if (!chart?.getAllStudies) return partial

  let studies: any[] = []
  try {
    studies = chart.getAllStudies() || []
  } catch {
    return partial
  }

  for (const study of studies) {
    let inputs: Record<string, unknown> = {}
    try {
      if (typeof study.getInputs === "function") {
        const raw = study.getInputs()
        if (raw && typeof raw === "object") inputs = raw as Record<string, unknown>
      } else if (study.inputs && typeof study.inputs === "object") {
        inputs = study.inputs as Record<string, unknown>
      }
    } catch {
      continue
    }

    if (!partial.entry) {
      partial.entry = pickInput(inputs, [
        "entry",
        "entrada",
        "custom_entry",
        "entry1",
        "entry_price",
        "price_in",
        "in_0",
        "in_1",
      ])
    }

    if (!partial.stopLoss) {
      partial.stopLoss = pickInput(inputs, ["stop", "sl", "stop_loss", "stoploss", "in_2"])
    }

    const tps = partial.takeProfits || ["", "", "", "", ""]
    for (let i = 0; i < 5; i++) {
      if (!tps[i]) {
        const tpVal = pickInput(inputs, [
          `tp${i + 1}`,
          `take_profit_${i + 1}`,
          `exit${i + 1}`,
          `target${i + 1}`,
          `in_${i + 3}`,
        ])
        if (tpVal) tps[i] = tpVal
      }
    }
    partial.takeProfits = tps as [string, string, string, string, string]

    if (!partial.direction) {
      partial.direction = inferDirectionFromInputs(inputs)
    }
  }

  return partial
}

function extractPriceFromText(text: string, kind: "entry" | "sl" | "tp"): string | null {
  const patterns: Record<typeof kind, RegExp[]> = {
    entry: [/(?:entry|entrada)\s*[:\-]?\s*([\d.,]+)/i, /(?:preço de entrada|price in)\s*[:\-]?\s*([\d.,]+)/i],
    sl: [/(?:stop|sl|stop\s*loss)\s*[:\-]?\s*([\d.,]+)/i],
    tp: [/(?:tp\d*|take\s*profit|exit\s*\d*|alvo\s*\d*)\s*(?:\([^)]*\))?\s*[:\-]?\s*([\d.,]+)/i],
  }
  for (const re of patterns[kind]) {
    const m = text.match(re)
    if (m?.[1]) return normalizePrice(m[1])
  }
  return null
}

function inferDirectionFromTexts(texts: string[]): TradeDirection {
  const blob = texts.join(" ").toUpperCase()
  if (/\bBUY\b|BULLISH|LONG\b|COMPRA/.test(blob)) return "bullish"
  if (/\bSELL\b|BEARISH|SHORT\b|VENDA/.test(blob)) return "bearish"
  return ""
}

function walkObjectForTexts(obj: unknown, out: string[], depth = 0): void {
  if (!obj || depth > 12) return
  if (typeof obj === "string") {
    if (obj.length < 300 && /entry|stop|tp|entrada|sl|buy|sell/i.test(obj)) out.push(obj)
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((v) => walkObjectForTexts(v, out, depth + 1))
    return
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>
    if (typeof record.text === "string") out.push(record.text)
    if (typeof record.label === "string") out.push(record.label)
    Object.values(record).forEach((v) => walkObjectForTexts(v, out, depth + 1))
  }
}

async function collectChartTexts(chart: any): Promise<string[]> {
  const texts: string[] = []

  if (typeof chart.getAllShapes === "function") {
    try {
      for (const id of chart.getAllShapes() || []) {
        try {
          const shape = typeof chart.getShapeById === "function" ? chart.getShapeById(id) : null
          const props = shape?.getProperties?.() ?? shape?.properties ?? {}
          if (props.text) texts.push(String(props.text))
          if (props.label) texts.push(String(props.label))
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (typeof chart.save === "function") {
    try {
      walkObjectForTexts(chart.save(), texts)
    } catch {
      /* ignore */
    }
  }

  return [...new Set(texts)]
}

function mergeDraft(base: ChartShareTradeDraft, partial: Partial<ChartShareTradeDraft>): ChartShareTradeDraft {
  const tps = [...base.takeProfits] as [string, string, string, string, string]
  if (partial.takeProfits) {
    partial.takeProfits.forEach((tp, i) => {
      if (i < 5 && tp && !tps[i]) tps[i] = tp
    })
  }
  return {
    symbol: partial.symbol || base.symbol,
    direction: partial.direction || base.direction,
    entry: partial.entry || base.entry,
    stopLoss: partial.stopLoss || base.stopLoss,
    takeProfits: tps,
    detectedFromChart: base.detectedFromChart,
  }
}

function applyTextsToDraft(texts: string[], draft: ChartShareTradeDraft): void {
  let tpIndex = 0
  for (const text of texts) {
    const entry = extractPriceFromText(text, "entry")
    if (entry && !draft.entry) draft.entry = entry

    const sl = extractPriceFromText(text, "sl")
    if (sl && !draft.stopLoss) draft.stopLoss = sl

    if (/tp\d|take\s*profit|exit|alvo/i.test(text)) {
      const tp = extractPriceFromText(text, "tp")
      if (tp) {
        const idx = draft.takeProfits.findIndex((x) => !x)
        const slot = idx >= 0 ? idx : tpIndex
        if (slot < 5 && !draft.takeProfits[slot]) {
          draft.takeProfits[slot] = tp
          tpIndex = Math.max(tpIndex, slot + 1)
        }
      }
    }
  }

  const dir = inferDirectionFromTexts(texts)
  if (dir && !draft.direction) draft.direction = dir
}

/** Extrai níveis do gráfico e dos indicadores MTM (melhor esforço). */
export async function extractChartShareTradeDraft(
  chart: unknown,
  symbol: string
): Promise<ChartShareTradeDraft> {
  let draft = emptyChartShareTradeDraft(symbol)
  const c = chart as any
  if (!c) return draft

  try {
    const fromStudies = await extractFromStudyInputs(c)
    draft = mergeDraft(draft, fromStudies)
  } catch (e) {
    console.warn("[chart-share-trade] study inputs:", e)
  }

  try {
    const texts = await collectChartTexts(c)
    applyTextsToDraft(texts, draft)
  } catch (e) {
    console.warn("[chart-share-trade] chart texts:", e)
  }

  draft.detectedFromChart = Boolean(
    draft.direction ||
      draft.entry ||
      draft.stopLoss ||
      draft.takeProfits.some((t) => t.trim() !== "")
  )

  return draft
}

export interface BuildChartShareContentParams {
  symbol: string
  chartUrl?: string | null
  urlFallback?: ChartUrlFallback
  description?: string
  trade?: Pick<ChartShareTradeDraft, "direction" | "entry" | "stopLoss" | "takeProfits">
  /** Na pré-visualização mostra todos os campos (mesmo vazios) */
  preview?: boolean
}

function resolveEffectiveChartUrl(params: BuildChartShareContentParams): string {
  return String(params.chartUrl || "").trim()
}

function buildTradeLines(
  trade: BuildChartShareContentParams["trade"],
  preview: boolean
): string[] {
  const lines: string[] = []

  if (preview) {
    const direction = trade?.direction
    if (direction === "bullish") lines.push("🟢 Ideia: Bullish (Long)")
    else if (direction === "bearish") lines.push("🔴 Ideia: Bearish (Short)")
    else lines.push("Ideia: —")

    lines.push(`📍 Entrada: ${trade?.entry?.trim() || "—"}`)
    lines.push(`🛑 SL: ${trade?.stopLoss?.trim() || "—"}`)

    const tps = trade?.takeProfits || ["", "", "", "", ""]
    for (let i = 0; i < 5; i++) {
      lines.push(`🎯 TP${i + 1}: ${tps[i]?.trim() || "—"}`)
    }
    return lines
  }

  const direction = trade?.direction
  if (direction === "bullish") lines.push("🟢 Ideia: Bullish (Long)")
  else if (direction === "bearish") lines.push("🔴 Ideia: Bearish (Short)")

  if (trade?.entry?.trim()) lines.push(`📍 Entrada: ${trade.entry.trim()}`)
  if (trade?.stopLoss?.trim()) lines.push(`🛑 SL: ${trade.stopLoss.trim()}`)

  trade?.takeProfits?.forEach((tp, i) => {
    if (tp?.trim()) lines.push(`🎯 TP${i + 1}: ${tp.trim()}`)
  })

  return lines
}

export function buildChartSharePostContent(params: BuildChartShareContentParams): string {
  const lines: string[] = []
  const preview = Boolean(params.preview)
  const desc = String(params.description || "").trim()

  if (desc) {
    lines.push(desc)
    lines.push("")
  }

  const symbol = String(params.symbol || "Ativo").trim()
  lines.push(`📊 ${symbol}`)

  const tradeLines = buildTradeLines(params.trade, preview)
  if (tradeLines.length > 0 || preview) {
    lines.push("")
    lines.push("📈 Parâmetros da trade")
    lines.push(...(tradeLines.length > 0 ? tradeLines : buildTradeLines(undefined, true)))
  }

  const chartUrl = resolveEffectiveChartUrl(params)
  if (chartUrl) {
    lines.push("")
    lines.push("🔗 Link do gráfico")
    lines.push(chartUrl)
  } else if (preview) {
    lines.push("")
    lines.push("🔗 Link do gráfico")
    lines.push("—")
  }

  return lines.join("\n").trim()
}

/** Payload JSON para POST /api/social/share-chart */
export function chartShareDraftToPayload(input: {
  symbol: string
  chartUrl: string | null
  chartImage: string | null
  mediaUrls?: string[]
  category: ChartSocialCategory
  description: string
  trade: ChartShareTradeDraft
}): Record<string, unknown> {
  return {
    symbol: input.symbol,
    chartUrl: String(input.chartUrl || "").trim(),
    chartImage: input.chartImage || "",
    mediaUrls: input.mediaUrls?.length ? input.mediaUrls : undefined,
    category: input.category,
    description: input.description,
    direction: input.trade.direction || undefined,
    entry: input.trade.entry || undefined,
    stopLoss: input.trade.stopLoss || undefined,
    takeProfits: [...input.trade.takeProfits],
  }
}

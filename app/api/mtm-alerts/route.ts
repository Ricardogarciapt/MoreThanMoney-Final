import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"

/**
 * Alertas MTM — lê os sinais gerados pelo webhook TradingView existente
 * (tabela `tradingview_signals`) e normaliza todos os dados dos plots:
 * entrada, stop loss, múltiplos take-profits, gestão da trade e imagem do gráfico.
 * Não altera o webhook nem cria variáveis novas.
 */

export interface AlertConfirmation {
  name: string
  passed: boolean
}

export interface MtmAlert {
  id: string
  ticker: string | null
  tvSymbol: string | null
  exchange: string | null
  timeframe: string | null
  action: string | null
  direction: "buy" | "sell" | "neutral"
  entry: number | null
  stopLoss: number | null
  takeProfits: number[]
  alertName: string | null
  strategy: string | null
  session: string | null
  confirmations: AlertConfirmation[]
  message: string | null
  aiAnalysis: string | null
  chartImageUrl: string | null
  createdAt: string
  status: string | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function resolveDirection(action: string | null): "buy" | "sell" | "neutral" {
  if (!action) return "neutral"
  const a = action.toLowerCase()
  if (/(buy|long|compra|bull|up)/.test(a)) return "buy"
  if (/(sell|short|venda|bear|down)/.test(a)) return "sell"
  return "neutral"
}

/** Extrai múltiplos take-profits do payload bruto (tp, tp1..tp5, targets[]). */
function extractTakeProfits(tp: number | null, raw: Record<string, unknown>): number[] {
  const out: number[] = []
  const push = (v: unknown) => {
    const n = num(v)
    if (n != null && !out.includes(n)) out.push(n)
  }
  for (const k of [
    "tp1", "tp2", "tp3", "tp4", "tp5",
    "exit1", "exit2", "exit3", "exit_1", "exit_2", "exit_3",
    "take_profit", "takeprofit", "target", "target1", "target2", "target3",
  ]) {
    push(raw[k] ?? raw[k.toUpperCase()])
  }
  if (Array.isArray(raw.targets)) raw.targets.forEach(push)
  if (Array.isArray(raw.tps)) (raw.tps as unknown[]).forEach(push)
  if (Array.isArray(raw.exits)) (raw.exits as unknown[]).forEach(push)
  if (out.length === 0 && tp != null) out.push(tp)
  return out
}

/** Stop loss — aceita sl/stop/invalidation. */
function extractStopLoss(sl: number | null, raw: Record<string, unknown>): number | null {
  if (sl != null) return sl
  for (const k of ["invalidation", "stop", "stop_loss", "stoploss", "sl"]) {
    const n = num(raw[k] ?? raw[k.toUpperCase()])
    if (n != null) return n
  }
  return null
}

function pickStr(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k] ?? raw[k.toUpperCase()]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

/** Confirmações do indicador (ex.: Zonetouch/Bandtouch/TrendTracker) a partir do payload. */
function extractConfirmations(raw: Record<string, unknown>): AlertConfirmation[] {
  const out: AlertConfirmation[] = []
  const toBool = (v: unknown): boolean => {
    if (typeof v === "boolean") return v
    if (typeof v === "number") return v > 0
    if (typeof v === "string") return /^(true|1|yes|sim|ok|pass|passed|✅)$/i.test(v.trim())
    return false
  }
  const src = (raw.confirmations && typeof raw.confirmations === "object" && !Array.isArray(raw.confirmations))
    ? (raw.confirmations as Record<string, unknown>)
    : null
  if (src) {
    for (const [k, v] of Object.entries(src)) out.push({ name: k, passed: toBool(v) })
    return out
  }
  if (Array.isArray(raw.confirmations)) {
    for (const c of raw.confirmations as unknown[]) {
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>
        const name = (o.name ?? o.label ?? o.title) as string | undefined
        if (name) out.push({ name: String(name), passed: toBool(o.passed ?? o.value ?? o.status) })
      }
    }
    return out
  }
  // Chaves soltas conhecidas
  for (const k of ["zonetouch", "bandtouch", "trendtracker", "trend_tracker"]) {
    if (k in raw || k.toUpperCase() in raw) {
      out.push({ name: k, passed: toBool(raw[k] ?? raw[k.toUpperCase()]) })
    }
  }
  return out
}

/** Constrói símbolo TradingView a partir de exchange + ticker. */
function buildTvSymbol(ticker: string | null, exchange: string | null): string | null {
  if (!ticker) return null
  const t = ticker.toUpperCase().replace(/[^A-Z0-9:._]/g, "")
  if (t.includes(":")) return t
  if (exchange) return `${exchange.toUpperCase()}:${t}`
  return t
}

/** Procura URL/ID de imagem de gráfico no payload ou na mensagem. */
function extractChartImage(raw: Record<string, unknown>, message: string | null): string | null {
  for (const k of ["chart_url", "chartUrl", "chart", "image", "image_url", "imageUrl", "snapshot", "screenshot"]) {
    const v = raw[k]
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v
  }
  // ID de snapshot TradingView (tradingview.com/x/ID) no payload ou mensagem
  const hay = `${JSON.stringify(raw)} ${message ?? ""}`
  const m = hay.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/i)
  if (m) {
    const id = m[1]
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`
  }
  return null
}

async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            /* read-only */
          },
        },
      }
    )
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 30, 100)
  const symbolFilter = (searchParams.get("symbol") || "").toUpperCase().trim()

  try {
    const admin = getSupabaseAdmin()
    let query = admin
      .from("tradingview_signals")
      .select("id, ticker, exchange, timeframe, action, price, sl, tp, alert_name, message, ai_analysis, raw_payload, chat_status, received_at")
      .order("received_at", { ascending: false })
      .limit(limit)

    if (symbolFilter) query = query.ilike("ticker", `%${symbolFilter}%`)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const alerts: MtmAlert[] = (data || []).map((row: any) => {
      const raw = (row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {}) as Record<string, unknown>
      return {
        id: row.id,
        ticker: row.ticker,
        tvSymbol: buildTvSymbol(row.ticker, row.exchange),
        exchange: row.exchange,
        timeframe: row.timeframe,
        action: row.action,
        direction: resolveDirection(row.action),
        entry: num(row.price),
        stopLoss: extractStopLoss(num(row.sl), raw),
        takeProfits: extractTakeProfits(num(row.tp), raw),
        alertName: row.alert_name,
        strategy: pickStr(raw, ["strategy", "strategy_name", "scanner", "estrategia"]) || row.alert_name,
        session: pickStr(raw, ["session", "trading_session", "sessao", "sessions"]),
        confirmations: extractConfirmations(raw),
        message: row.message,
        aiAnalysis: row.ai_analysis,
        chartImageUrl: extractChartImage(raw, row.message),
        createdAt: row.received_at,
        status: row.chat_status,
      }
    })

    return NextResponse.json({ success: true, alerts }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[MTM ALERTS] erro:", err)
    return NextResponse.json({ error: "Erro ao carregar alertas" }, { status: 500 })
  }
}

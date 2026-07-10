import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { captureAndStore, type CaptureParams } from "@/lib/mtm-alerts/capture-chart"

/**
 * CRON: captura o PNG do gráfico (widget + scanner + níveis) dos sinais recentes
 * que ainda não têm imagem. Corre fora do caminho do webhook (sem latência de trade).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function buildTvSymbol(ticker: string | null, exchange: string | null): string | null {
  if (!ticker) return null
  const t = ticker.toUpperCase().replace(/[^A-Z0-9:._]/g, "")
  if (t.includes(":")) return t
  return exchange ? `${exchange.toUpperCase()}:${t}` : t
}
function direction(action: string | null): "buy" | "sell" | "neutral" {
  const a = (action || "").toLowerCase()
  if (/(buy|long|compra|bull|up)/.test(a)) return "buy"
  if (/(sell|short|venda|bear|down)/.test(a)) return "sell"
  return "neutral"
}
function extractTps(tp: number | null, raw: Record<string, unknown>): number[] {
  const out: number[] = []
  const push = (v: unknown) => {
    const n = num(v)
    if (n != null && !out.includes(n)) out.push(n)
  }
  for (const k of ["tp1", "tp2", "tp3", "exit1", "exit2", "exit3", "target1", "target2", "target3"]) {
    push(raw[k] ?? raw[k.toUpperCase()])
  }
  if (Array.isArray(raw.targets)) raw.targets.forEach(push)
  if (out.length === 0 && tp != null) out.push(tp)
  return out
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("tradingview_signals")
    .select("id, ticker, exchange, timeframe, action, price, sl, tp, raw_payload")
    .is("chart_image_url", null)
    .not("ticker", "is", null)
    .gt("received_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order("received_at", { ascending: false })
    .limit(4)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { id: string; ok: boolean }[] = []
  for (const row of data || []) {
    const tvSymbol = buildTvSymbol(row.ticker, row.exchange)
    if (!tvSymbol) {
      results.push({ id: row.id, ok: false })
      continue
    }
    const raw = (row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {}) as Record<string, unknown>
    const interval = row.timeframe && /^\d+$/.test(String(row.timeframe)) ? String(row.timeframe) : "60"
    const params: CaptureParams = {
      tvSymbol,
      interval,
      ticker: row.ticker,
      direction: direction(row.action),
      entry: num(row.price),
      sl: num(row.sl),
      tps: extractTps(num(row.tp), raw),
    }
    const url = await captureAndStore(row.id, params)
    results.push({ id: row.id, ok: !!url })
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}

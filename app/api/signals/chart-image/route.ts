import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  renderSignalChartPng,
  buildChartImgSymbol,
  tfToChartImgInterval,
} from "@/lib/chart-image"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const supabase = getSupabaseAdmin()

function num(v: unknown): number | null {
  if (v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/**
 * GET /api/signals/chart-image?id=<signalId>
 * Renderiza o gráfico TradingView real (chart-img) com as linhas da trade e devolve PNG.
 * Cacheado na CDN por sinal → a quota chart-img só é gasta na 1.ª visualização de cada sinal.
 * Em falha (sem key/quota/erro) → 302 para o card sintético /api/og/signal (sempre há imagem).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const origin = req.nextUrl.origin
  if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })

  const { data: sig } = await supabase
    .from("tradingview_signals")
    .select("ticker, exchange, timeframe, action, price, sl, raw_payload, alert_name")
    .eq("id", id)
    .maybeSingle()

  if (!sig?.ticker) return NextResponse.json({ error: "sinal não encontrado" }, { status: 404 })

  const rp = (sig.raw_payload || {}) as Record<string, unknown>
  const entry = num(rp.entry) ?? num(sig.price)
  const slv = num(sig.sl) ?? num(rp.sl)
  const tps = [num(rp.tp1) ?? num(rp.take_profit_1), num(rp.tp2), num(rp.tp3)].filter(
    (x): x is number => x != null && x > 0,
  )
  const dir = String(sig.action || "").toLowerCase() === "sell" ? "sell" : "buy"

  // Fallback OG (card sintético) — usado se o render real falhar.
  const og = new URLSearchParams()
  const put = (k: string, v: unknown) => { if (v != null && v !== "") og.set(k, String(v)) }
  put("sym", sig.ticker)
  put("dir", dir)
  put("tf", sig.timeframe)
  put("strat", sig.alert_name || "MTM")
  put("entry", entry); put("sl", slv)
  tps.forEach((t, i) => put(`tp${i + 1}`, t))
  put("slpct", num(rp.sl_pct)); put("tp1pct", num(rp.tp1_pct)); put("tp2pct", num(rp.tp2_pct)); put("tp3pct", num(rp.tp3_pct))
  put("lev", num(rp.leverage)); put("cost", num(rp.fee_cost)); put("acct", num(rp.account))
  const ogUrl = `${origin}/api/og/signal?${og.toString()}`

  const png = await renderSignalChartPng({
    symbol: buildChartImgSymbol(sig.ticker, sig.exchange),
    interval: tfToChartImgInterval(sig.timeframe),
    direction: dir,
    entry,
    sl: slv,
    tps,
    alertName: sig.alert_name,
  })

  if (!png) {
    // sem imagem real → cai no card sintético (302, sem cache longo para poder recuperar)
    return NextResponse.redirect(ogUrl, { status: 302, headers: { "Cache-Control": "public, max-age=120" } })
  }

  return new NextResponse(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      // imutável por sinal → CDN serve as visualizações seguintes sem gastar quota
      "Cache-Control": "public, s-maxage=31536000, max-age=86400, immutable",
    },
  })
}

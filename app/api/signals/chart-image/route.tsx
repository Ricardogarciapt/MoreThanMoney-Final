import { NextRequest, NextResponse } from "next/server"
import { ImageResponse } from "next/og"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  renderSignalChart,
  buildChartImgSymbol,
  tfToChartImgInterval,
} from "@/lib/chart-image"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const supabase = getSupabaseAdmin()

const GOLD = "#D2A63C"
const GREEN = "#16b981"
const RED = "#ef4444"
const BLUE = "#3b82f6"
const INK = "#0b0d12"
const PANEL = "#12151d"
const MUTED = "#9AA0AA"

function num(v: unknown): number | null {
  if (v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
function fmt(v: number | null): string {
  if (v == null) return "—"
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 1000 ? 1 : 5 })
}

/**
 * GET /api/signals/chart-image?id=<signalId>
 * Compõe: gráfico TradingView real (chart-img, com as linhas Entry/SL/TP) como fundo +
 * rodapé com o TEXTO dos parâmetros (valores + distâncias %) e marca MTM. PNG cacheado por
 * sinal na CDN. Em falha do chart-img → 302 para o card sintético /api/og/signal.
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
  const slpct = num(rp.sl_pct)
  const tppcts = [num(rp.tp1_pct), num(rp.tp2_pct), num(rp.tp3_pct)]

  // Fallback OG
  const og = new URLSearchParams()
  const put = (k: string, v: unknown) => { if (v != null && v !== "") og.set(k, String(v)) }
  put("sym", sig.ticker); put("dir", dir); put("tf", sig.timeframe); put("strat", sig.alert_name || "MTM")
  put("entry", entry); put("sl", slv); tps.forEach((t, i) => put(`tp${i + 1}`, t))
  put("slpct", slpct); put("tp1pct", tppcts[0]); put("tp2pct", tppcts[1]); put("tp3pct", tppcts[2])
  put("lev", num(rp.leverage)); put("cost", num(rp.fee_cost)); put("acct", num(rp.account))
  const ogUrl = `${origin}/api/og/signal?${og.toString()}`

  const r = await renderSignalChart({
    symbol: buildChartImgSymbol(sig.ticker, sig.exchange),
    interval: tfToChartImgInterval(sig.timeframe),
    direction: dir,
    entry,
    sl: slv,
    tps,
    alertName: sig.alert_name,
    width: 1200,
    height: 620,
  })

  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({ ok: !!r.png, error: r.error, body: r.body })
  }
  if (!r.png) {
    return NextResponse.redirect(ogUrl, { status: 302, headers: { "Cache-Control": "public, max-age=120" } })
  }

  const chartDataUri = `data:image/png;base64,${Buffer.from(r.png).toString("base64")}`
  const dirColor = dir === "sell" ? RED : GREEN

  const chip = (label: string, value: string, color: string, sub?: string) => (
    <div style={{ display: "flex", flexDirection: "column", padding: "4px 14px", borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", color: MUTED, fontSize: 15, letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", color, fontSize: 24, fontWeight: 700 }}>
        {value}{sub ? <span style={{ color: MUTED, fontSize: 15, fontWeight: 400, marginLeft: 6, alignSelf: "center" }}>{sub}</span> : null}
      </div>
    </div>
  )

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK }}>
        <img src={chartDataUri} width={1200} height={620} style={{ width: 1200, height: 620 }} />
        <div style={{ display: "flex", alignItems: "center", height: 140, borderTop: `2px solid ${GOLD}`, background: PANEL, padding: "0 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 200 }}>
            <div style={{ display: "flex", color: GOLD, fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>MORE THAN MONEY</div>
            <div style={{ display: "flex", color: "#fff", fontSize: 22, fontWeight: 700 }}>
              {sig.ticker}
              <span style={{ background: dirColor, color: "#08131a", fontSize: 14, fontWeight: 800, padding: "1px 8px", borderRadius: 6, marginLeft: 8, alignSelf: "center" }}>
                {dir === "sell" ? "VENDA" : "COMPRA"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flex: 1, flexWrap: "wrap", alignItems: "center" }}>
            {chip("ENTRADA", fmt(entry), BLUE)}
            {chip("STOP LOSS", fmt(slv), RED, slpct != null ? `−${slpct}%` : undefined)}
            {tps.map((tp, i) => chip(`TP${i + 1}`, fmt(tp), GREEN, tppcts[i] != null ? `+${tppcts[i]}%` : undefined))}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 760,
      headers: { "Cache-Control": "public, s-maxage=31536000, max-age=86400, immutable" },
    },
  )
}

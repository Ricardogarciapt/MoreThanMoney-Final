import { NextRequest, NextResponse } from "next/server"
import { ImageResponse } from "next/og"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  renderSignalChart,
  buildChartImgSymbol,
  tfToChartImgInterval,
} from "@/lib/chart-image"
import { VELAS_MINIMAS, desenhoVelasSinal, graficoDaEstrategia } from "@/lib/sinais/grafico-velas"
import { pngDoDesenho } from "@/lib/sinais/grafico-png"
import { marcaDaEstrategia } from "@/lib/sinais/grafico-estrategia"

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

interface SinalDaImagem {
  ticker: string | null
  exchange: string | null
  timeframe: string | null
  action: string | null
  price: unknown
  sl: unknown
  tp: unknown
  raw_payload: unknown
  alert_name: string | null
  received_at: string | null
  estrategia: string | null
}

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
 *
 * Escada de três degraus para a imagem do alerta:
 *   1. o gráfico DA ESTRATÉGIA (lib/sinais/grafico-estrategia + grafico-velas): velas das
 *      referências públicas Binance/Yahoo, com a cor, o nome e os indicadores do scanner que deu
 *      o sinal. `&f=png` devolve o mesmo desenho em PNG (o Telegram não aceita SVG nas fotos);
 *   2. gráfico TradingView (chart-img) — só quando não há velas; tem quota diária e, desde 28/09,
 *      responde 403 à chave que temos;
 *   3. nem isso: 302 para o cartão sintético /api/og/signal.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const origin = req.nextUrl.origin
  const q = req.nextUrl.searchParams

  // Com `id`: o sinal gravado. Sem `id`: os parâmetros no URL (urlDoGrafico) — é assim que o
  // publicador da mestre, que não tem linha em tradingview_signals, pede o gráfico da entrada.
  let sig: SinalDaImagem | null = null
  if (id) {
    const { data } = await supabase
      .from("tradingview_signals")
      .select("ticker, exchange, timeframe, action, price, sl, tp, raw_payload, alert_name, received_at, estrategia")
      .eq("id", id)
      .maybeSingle()
    sig = (data as SinalDaImagem | null) ?? null
  } else if (q.get("s")) {
    const tpsQ = (q.get("tp") || "").split(",").map((x) => num(x)).filter((x): x is number => x != null && x > 0)
    sig = {
      ticker: q.get("s"),
      exchange: null,
      timeframe: q.get("tf"),
      action: q.get("d"),
      price: num(q.get("en")),
      sl: num(q.get("sl")),
      tp: tpsQ[0] ?? null,
      raw_payload: Object.fromEntries(tpsQ.map((t, i) => [`tp${i + 1}`, t])),
      alert_name: null,
      received_at: num(q.get("t")) != null ? new Date(Number(q.get("t")) * 1000).toISOString() : null,
      estrategia: q.get("e"),
    }
  } else {
    return NextResponse.json({ error: "id em falta" }, { status: 400 })
  }
  if (!sig?.ticker) return NextResponse.json({ error: "sinal não encontrado" }, { status: 404 })

  const rp = (sig.raw_payload || {}) as Record<string, unknown>
  const entry = num(rp.entry) ?? num(sig.price)
  const slv = num(sig.sl) ?? num(rp.sl)
  const tpsPayload = [num(rp.tp1) ?? num(rp.take_profit_1), num(rp.tp2), num(rp.tp3), num(rp.tp4)].filter(
    (x): x is number => x != null && x > 0,
  )
  // O Trendshot calcula os níveis no servidor: no payload não há tp1..4, só a coluna `tp`.
  const tps = tpsPayload.length ? tpsPayload : [num(sig.tp)].filter((x): x is number => x != null && x > 0)
  const dir = String(sig.action || "").toLowerCase() === "sell" ? "sell" : "buy"
  const slpct = num(rp.sl_pct)
  const tppcts = [num(rp.tp1_pct), num(rp.tp2_pct), num(rp.tp3_pct)]

  // Fallback OG
  const og = new URLSearchParams()
  const put = (k: string, v: unknown) => { if (v != null && v !== "") og.set(k, String(v)) }
  put("sym", sig.ticker); put("dir", dir); put("tf", sig.timeframe); put("strat", marcaDaEstrategia(sig.estrategia, sig.alert_name).nome)
  put("entry", entry); put("sl", slv); tps.forEach((t, i) => put(`tp${i + 1}`, t))
  put("slpct", slpct); put("tp1pct", tppcts[0]); put("tp2pct", tppcts[1]); put("tp3pct", tppcts[2])
  put("lev", num(rp.leverage)); put("cost", num(rp.fee_cost)); put("acct", num(rp.account))
  const ogUrl = `${origin}/api/og/signal?${og.toString()}`

  // Degrau 1: o gráfico DA ESTRATÉGIA — velas nossas + os indicadores e a cor do scanner
  // (lib/sinais/grafico-estrategia). Vem primeiro desde 26/10: o chart-img responde 403 desde 28/09
  // e, mesmo quando servia, desenhava o mesmo gráfico para todas as estratégias.
  const marca = marcaDaEstrategia(sig.estrategia, sig.alert_name)
  const emSeg = Math.floor(new Date(String(sig.received_at ?? Date.now())).getTime() / 1000)
  const base = { ticker: sig.ticker, timeframe: sig.timeframe, direcao: dir, entry, sl: slv, tps, emSeg, alertName: sig.alert_name, marca } as const
  const { velas, linhas } = await graficoDaEstrategia(base).catch(() => ({ velas: [], linhas: [] }))
  // PNG quando pedido (`&f=png`, o Telegram) OU quando quem pede não diz que lê SVG. Os browsers
  // mandam `image/svg+xml` no Accept de um <img>; a app iOS nativa (UIImage, chats da MTM System)
  // manda `*/*` e não lê SVG — via o cartão cinzento vazio (print do Ricardo, 28/10). `Vary: Accept`
  // para a CDN guardar as duas versões em separado.
  const formato = req.nextUrl.searchParams.get("f")
  const querPng = formato === "png" || (formato !== "svg" && !(req.headers.get("accept") || "").includes("image/svg+xml"))

  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({ ok: velas.length >= VELAS_MINIMAS, estrategia: marca.nome, velas: velas.length, linhas: linhas.map((l) => l.nome) })
  }
  if (velas.length >= VELAS_MINIMAS) {
    const desenho = desenhoVelasSinal({ ...base, linhas }, velas)
    // Um sinal com mais de dois dias já não muda; um fresco ainda ganha velas novas.
    const velho = Date.now() / 1000 - emSeg > 2 * 86400
    const cache = velho
      ? "public, s-maxage=31536000, max-age=86400, immutable"
      : "public, s-maxage=600, max-age=300, stale-while-revalidate=86400"
    // PNG para quem não lê SVG (o Telegram, nas fotos): o mesmo desenho, rasterizado.
    if (querPng) return pngDoDesenho(desenho, cache)
    return new NextResponse(desenho.svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": cache, Vary: "Accept" } })
  }

  // Degrau 2: gráfico TradingView (chart-img), só quando as referências públicas não deram velas.
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
  // Degrau 3: cartão sintético.
  if (!r.png) return NextResponse.redirect(ogUrl, { status: 302, headers: { "Cache-Control": "public, max-age=120" } })

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

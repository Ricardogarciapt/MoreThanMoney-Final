import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Captura headless de um gráfico TradingView (widget + scanner Momentum + níveis)
 * para PNG, guardado no Storage 'alert-charts'. Best-effort: nunca lança para o caller.
 */

const MOMENTUM_STUDIES = ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"]
const BUCKET = "alert-charts"

export interface CaptureParams {
  tvSymbol: string
  interval: string
  ticker: string
  direction: "buy" | "sell" | "neutral"
  entry: number | null
  sl: number | null
  tps: number[]
}

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("pt-PT", { maximumFractionDigits: 6 })
}

function buildHtml(p: CaptureParams): string {
  const dirLabel = p.direction === "buy" ? "COMPRA" : p.direction === "sell" ? "VENDA" : "SINAL"
  const dirColor = p.direction === "buy" ? "#34d399" : p.direction === "sell" ? "#f87171" : "#9ca3af"
  const tpRows = p.tps
    .map((t, i) => `<div class="lvl tp"><span>🎯 Exit ${i + 1}</span><b>${fmt(t)}</b></div>`)
    .join("")
  const studies = JSON.stringify(MOMENTUM_STUDIES)
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  *{margin:0;box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  body{width:1200px;height:628px;background:#050506;color:#f4f2ec;overflow:hidden}
  .wrap{display:flex;height:100%}
  .chart{flex:1;position:relative}
  #tv{position:absolute;inset:0}
  .side{width:320px;background:linear-gradient(180deg,#141216,#09090a);border-left:1px solid rgba(210,166,60,.25);padding:22px}
  .hd{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .sym{font-size:26px;font-weight:800}
  .badge{font-size:13px;font-weight:800;padding:4px 10px;border-radius:8px;border:1px solid ${dirColor};color:${dirColor};background:${dirColor}22}
  .tf{font-size:12px;color:#9a958a;margin-bottom:18px;font-family:ui-monospace,monospace}
  .lvl{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:15px;color:#c8c3ba}
  .lvl b{font-family:ui-monospace,monospace;font-size:16px;color:#fff}
  .lvl.stop b{color:#f87171}.lvl.tp b{color:#34d399}.lvl.entry b{color:#D2A63C}
  .foot{position:absolute;bottom:16px;left:22px;font-size:11px;color:#6f6a62}
  .brand{color:#D2A63C;font-weight:800}
</style></head>
<body>
  <div class="wrap">
    <div class="chart"><div id="tv"></div></div>
    <div class="side">
      <div class="hd"><span class="sym">${p.ticker}</span><span class="badge">${dirLabel}</span></div>
      <div class="tf">${p.tvSymbol} · ${p.interval}</div>
      <div class="lvl entry"><span>📍 Entrada</span><b>${fmt(p.entry)}</b></div>
      <div class="lvl stop"><span>🛑 Stop Loss</span><b>${fmt(p.sl)}</b></div>
      ${tpRows}
      <div class="foot"><span class="brand">MoreThanMoney</span> · Scanner Momentum · educativo, não é conselho financeiro</div>
    </div>
  </div>
  <script src="https://s3.tradingview.com/tv.js"></script>
  <script>
    new TradingView.widget({
      container_id:"tv", symbol:${JSON.stringify(p.tvSymbol)}, interval:${JSON.stringify(p.interval)},
      autosize:true, theme:"dark", style:"1", locale:"pt", timezone:"Europe/Lisbon",
      hide_top_toolbar:true, hide_legend:true, hide_side_toolbar:true, allow_symbol_change:false,
      save_image:false, backgroundColor:"rgba(0,0,0,1)", studies:${studies}
    });
    window.__tvReady = false;
    setTimeout(function(){ window.__tvReady = true; }, 6500);
  </script>
</body></html>`
}

/** Renderiza e devolve o PNG (Buffer). Lança em erro (caller trata). */
async function renderPng(p: CaptureParams): Promise<Buffer> {
  const chromium = (await import("@sparticuz/chromium")).default
  const puppeteer = await import("puppeteer-core")

  const browser = await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1200, height: 628 },
  })
  try {
    const page = await browser.newPage()
    await page.setContent(buildHtml(p), { waitUntil: "networkidle0", timeout: 25000 })
    // Espera o widget TradingView renderizar
    await new Promise((r) => setTimeout(r, 7000))
    const buf = (await page.screenshot({ type: "png" })) as Buffer
    return buf
  } finally {
    await browser.close()
  }
}

/** Captura + upload para Storage. Devolve a URL pública ou null (best-effort). */
export async function captureAlertChart(p: CaptureParams): Promise<string | null> {
  try {
    if (!p.tvSymbol) return null
    const png = await renderPng(p)
    const admin = getSupabaseAdmin()
    const path = `${p.ticker.replace(/[^A-Za-z0-9]/g, "")}/${Date.now()}.png`
    const { error } = await admin.storage.from(BUCKET).upload(path, png, {
      contentType: "image/png",
      upsert: true,
    })
    if (error) {
      console.error("[capture] upload error:", error)
      return null
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl ?? null
  } catch (err) {
    console.error("[capture] render error:", err)
    return null
  }
}

/** Captura idempotente para um sinal: se já tiver imagem, devolve-a. */
export async function captureAndStore(signalId: string, p: CaptureParams): Promise<string | null> {
  const admin = getSupabaseAdmin()
  const { data: row } = await admin
    .from("tradingview_signals")
    .select("chart_image_url")
    .eq("id", signalId)
    .maybeSingle()
  if (row?.chart_image_url) return row.chart_image_url as string

  const url = await captureAlertChart(p)
  if (url) {
    await admin.from("tradingview_signals").update({ chart_image_url: url }).eq("id", signalId)
  }
  return url
}

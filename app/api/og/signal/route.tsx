import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

export const runtime = "edge"

// Card estático do sinal MTM — desenho da trade (entry/SL/TP proporcionais) + parâmetros.
// URL estável baseado nos params → sempre disponível e cacheável. Usado como chart_image_url.
// Ex.: /api/og/signal?sym=XAUUSD&dir=sell&entry=4005&sl=4000&tp1=4100&tp2=...&slpct=1.1&...

const GOLD = "#D2A63C"
const GREEN = "#16b981"
const RED = "#ef4444"
const BLUE = "#3b82f6"
const INK = "#0b0d12"
const PANEL = "#12151d"
const MUTED = "#8b8f9a"

function n(v: string | null): number | null {
  if (!v) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
function fmt(v: number | null): string {
  if (v == null) return "—"
  const abs = Math.abs(v)
  const d = abs >= 1000 ? 2 : abs >= 1 ? 3 : 5
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d })
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const sym = (p.get("sym") || "—").toUpperCase()
  const dir = (p.get("dir") || "").toLowerCase() === "sell" ? "sell" : "buy"
  const isBuy = dir === "buy"
  const strat = p.get("strat") || "MTM Signal"
  const tf = p.get("tf") || ""
  const entry = n(p.get("entry"))
  const sl = n(p.get("sl"))
  const tps = [n(p.get("tp1")), n(p.get("tp2")), n(p.get("tp3"))].filter((x): x is number => x != null && x > 0)
  const slpct = p.get("slpct")
  const tppcts = [p.get("tp1pct"), p.get("tp2pct"), p.get("tp3pct")]
  const lev = p.get("lev")
  const cost = p.get("cost")
  const acct = p.get("acct")

  // Escala vertical do esquema (min..max dos preços)
  const prices = [entry, sl, ...tps].filter((x): x is number => x != null)
  const min = prices.length ? Math.min(...prices) : 0
  const max = prices.length ? Math.max(...prices) : 1
  const span = max - min || 1
  const CHART_H = 470
  const yOf = (v: number) => 40 + (1 - (v - min) / span) * (CHART_H - 80)

  const dirColor = isBuy ? GREEN : RED
  const dirLabel = isBuy ? "COMPRA" : "VENDA"

  const levelRow = (label: string, value: number | null, color: string, sub?: string) => ({
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #1e2230" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [
          { type: "div", props: { style: { color: MUTED, fontSize: 20, letterSpacing: 2 }, children: label } },
          sub ? { type: "div", props: { style: { color, fontSize: 18 }, children: sub } } : null,
        ] } },
        { type: "div", props: { style: { color, fontSize: 30, fontWeight: 700 }, children: fmt(value) } },
      ],
    },
  })

  return new ImageResponse(
    {
      type: "div",
      props: {
        style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, color: "#fff", fontFamily: "sans-serif", padding: 0 },
        children: [
          // header
          { type: "div", props: { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 34px", borderBottom: `2px solid ${GOLD}` }, children: [
            { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [
              { type: "div", props: { style: { color: GOLD, fontSize: 22, fontWeight: 800, letterSpacing: 3 }, children: "MORE THAN MONEY" } },
              { type: "div", props: { style: { color: MUTED, fontSize: 20 }, children: strat + (tf ? `  ·  ${tf}` : "") } },
            ] } },
            { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 16 }, children: [
              { type: "div", props: { style: { fontSize: 44, fontWeight: 800 }, children: sym } },
              { type: "div", props: { style: { background: dirColor, color: "#08131a", fontSize: 26, fontWeight: 800, padding: "6px 18px", borderRadius: 10 }, children: dirLabel } },
            ] } },
          ] } },
          // body: esquema à esquerda + níveis à direita
          { type: "div", props: { style: { display: "flex", flex: 1, padding: "24px 34px", gap: 34 }, children: [
            // esquema da trade
            { type: "div", props: { style: { position: "relative", width: 520, height: CHART_H, background: PANEL, borderRadius: 16, border: "1px solid #1e2230" }, children: [
              // linha SL
              sl != null ? { type: "div", props: { style: { position: "absolute", left: 0, right: 0, top: yOf(sl), height: 3, background: RED, display: "flex" } } } : null,
              sl != null ? { type: "div", props: { style: { position: "absolute", left: 14, top: yOf(sl) - 26, color: RED, fontSize: 20, fontWeight: 700 }, children: `SL ${fmt(sl)}${slpct ? `  (${slpct}%)` : ""}` } } : null,
              // entry
              entry != null ? { type: "div", props: { style: { position: "absolute", left: 0, right: 0, top: yOf(entry), height: 3, background: BLUE, display: "flex" } } } : null,
              entry != null ? { type: "div", props: { style: { position: "absolute", left: 14, top: yOf(entry) - 26, color: BLUE, fontSize: 22, fontWeight: 800 }, children: `ENTRY ${fmt(entry)}` } } : null,
              // TPs
              ...tps.map((tp, i) => ({ type: "div", props: { style: { position: "absolute", left: 0, right: 0, top: yOf(tp), height: 3, background: GREEN, display: "flex" } } })),
              ...tps.map((tp, i) => ({ type: "div", props: { style: { position: "absolute", right: 14, top: yOf(tp) - 26, color: GREEN, fontSize: 20, fontWeight: 700, display: "flex" }, children: `TP${i + 1} ${fmt(tp)}${tppcts[i] ? `  (+${tppcts[i]}%)` : ""}` } })),
            ] } },
            // níveis + gestão
            { type: "div", props: { style: { display: "flex", flexDirection: "column", flex: 1 }, children: [
              levelRow("ENTRADA", entry, BLUE),
              levelRow("STOP LOSS", sl, RED, slpct ? `−${slpct}%` : undefined),
              ...tps.map((tp, i) => levelRow(`TAKE PROFIT ${i + 1}`, tp, GREEN, tppcts[i] ? `+${tppcts[i]}%` : undefined)),
              { type: "div", props: { style: { display: "flex", gap: 22, marginTop: 18 }, children: [
                acct ? { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [ { type: "div", props: { style: { color: MUTED, fontSize: 16 }, children: "CONTA" } }, { type: "div", props: { style: { fontSize: 24, fontWeight: 700 }, children: `$${acct}` } } ] } } : null,
                lev ? { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [ { type: "div", props: { style: { color: MUTED, fontSize: 16 }, children: "ALAVANCAGEM" } }, { type: "div", props: { style: { fontSize: 24, fontWeight: 700, color: GOLD }, children: `${lev}x` } } ] } } : null,
                cost ? { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [ { type: "div", props: { style: { color: MUTED, fontSize: 16 }, children: "CUSTO" } }, { type: "div", props: { style: { fontSize: 24, fontWeight: 700 }, children: `$${cost}` } } ] } } : null,
              ] } },
            ] } },
          ] } },
          // footer
          { type: "div", props: { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 34px", borderTop: "1px solid #1e2230", background: PANEL }, children: [
            { type: "div", props: { style: { color: GOLD, fontSize: 20, fontWeight: 700 }, children: "@morethanmoney.pt" } },
            { type: "div", props: { style: { color: MUTED, fontSize: 16 }, children: "Material educativo · Não é aconselhamento financeiro · Trading tem risco" } },
          ] } },
        ],
      },
    },
    { width: 1200, height: 630 },
  )
}

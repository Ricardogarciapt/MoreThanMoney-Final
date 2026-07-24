import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

export const runtime = "edge"

// Card estático do sinal MTM — desenho da trade (entry/SL/TP proporcionais) + parâmetros.
// URL estável baseado nos params → sempre disponível e cacheável. Usado como chart_image_url.

const GOLD = "#D2A63C"
const GREEN = "#16b981"
const RED = "#ef4444"
const BLUE = "#3b82f6"
const INK = "#0b0d12"
const PANEL = "#12151d"
const MUTED = "#8b8f9a"
const LINE = "#1e2230"

function toNum(v: string | null): number | null {
  if (!v) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
function fmt(v: number | null): string {
  if (v == null) return "—"
  const abs = Math.abs(v)
  const d = abs >= 1000 ? 2 : abs >= 1 ? 3 : 5
  return v.toLocaleString("en-US", { maximumFractionDigits: d })
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const sym = (p.get("sym") || "—").toUpperCase()
  const isBuy = (p.get("dir") || "").toLowerCase() !== "sell"
  const strat = p.get("strat") || "MTM Signal"
  const tf = p.get("tf") || ""
  const entry = toNum(p.get("entry"))
  const sl = toNum(p.get("sl"))
  const tps = [toNum(p.get("tp1")), toNum(p.get("tp2")), toNum(p.get("tp3"))].filter(
    (x): x is number => x != null && x > 0,
  )
  const slpct = p.get("slpct")
  const tppcts = [p.get("tp1pct"), p.get("tp2pct"), p.get("tp3pct")]
  const lev = p.get("lev")
  const cost = p.get("cost")
  const acct = p.get("acct")

  const prices = [entry, sl, ...tps].filter((x): x is number => x != null)
  const min = prices.length ? Math.min(...prices) : 0
  const max = prices.length ? Math.max(...prices) : 1
  const span = max - min || 1
  const CH = 470
  const yOf = (v: number) => 34 + (1 - (v - min) / span) * (CH - 70)

  const dirColor = isBuy ? GREEN : RED
  const dirLabel = isBuy ? "COMPRA" : "VENDA"

  const rows: { label: string; value: number | null; color: string; sub?: string }[] = [
    { label: "ENTRADA", value: entry, color: BLUE },
    { label: "STOP LOSS", value: sl, color: RED, sub: slpct ? `−${slpct}%` : undefined },
    ...tps.map((tp, i) => ({
      label: `TAKE PROFIT ${i + 1}`,
      value: tp,
      color: GREEN,
      sub: tppcts[i] ? `+${tppcts[i]}%` : undefined,
    })),
  ]

  const stat = (label: string, value: string, color = "#fff") => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ color: MUTED, fontSize: 16 }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: INK,
          color: "#fff",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 34px",
            borderBottom: `2px solid ${GOLD}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: GOLD, fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>MORE THAN MONEY</div>
            <div style={{ color: MUTED, fontSize: 20 }}>{strat + (tf ? `  ·  ${tf}` : "")}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 800, marginRight: 16 }}>{sym}</div>
            <div
              style={{
                background: dirColor,
                color: "#08131a",
                fontSize: 26,
                fontWeight: 800,
                padding: "6px 18px",
                borderRadius: 10,
              }}
            >
              {dirLabel}
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ display: "flex", flex: 1, padding: "24px 34px" }}>
          {/* esquema */}
          <div
            style={{
              position: "relative",
              display: "flex",
              width: 520,
              height: CH,
              background: PANEL,
              borderRadius: 16,
              border: `1px solid ${LINE}`,
              marginRight: 34,
            }}
          >
            {sl != null && (
              <div style={{ position: "absolute", left: 0, right: 0, top: yOf(sl), height: 3, background: RED, display: "flex" }} />
            )}
            {sl != null && (
              <div style={{ position: "absolute", left: 14, top: yOf(sl) - 26, color: RED, fontSize: 20, fontWeight: 700, display: "flex" }}>
                {`SL ${fmt(sl)}${slpct ? `  (${slpct}%)` : ""}`}
              </div>
            )}
            {entry != null && (
              <div style={{ position: "absolute", left: 0, right: 0, top: yOf(entry), height: 3, background: BLUE, display: "flex" }} />
            )}
            {entry != null && (
              <div style={{ position: "absolute", left: 14, top: yOf(entry) - 26, color: BLUE, fontSize: 22, fontWeight: 800, display: "flex" }}>
                {`ENTRY ${fmt(entry)}`}
              </div>
            )}
            {tps.map((tp, i) => (
              <div key={`l${i}`} style={{ position: "absolute", left: 0, right: 0, top: yOf(tp), height: 3, background: GREEN, display: "flex" }} />
            ))}
            {tps.map((tp, i) => (
              <div key={`t${i}`} style={{ position: "absolute", right: 14, top: yOf(tp) - 26, color: GREEN, fontSize: 20, fontWeight: 700, display: "flex" }}>
                {`TP${i + 1} ${fmt(tp)}${tppcts[i] ? `  (+${tppcts[i]}%)` : ""}`}
              </div>
            ))}
          </div>

          {/* níveis + stats */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {rows.map((r, i) => (
              <div
                key={`r${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: `1px solid ${LINE}`,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ color: MUTED, fontSize: 20, letterSpacing: 2 }}>{r.label}</div>
                  {r.sub ? <div style={{ color: r.color, fontSize: 18 }}>{r.sub}</div> : null}
                </div>
                <div style={{ color: r.color, fontSize: 30, fontWeight: 700 }}>{fmt(r.value)}</div>
              </div>
            ))}
            <div style={{ display: "flex", marginTop: 18 }}>
              {acct ? <div style={{ display: "flex", marginRight: 26 }}>{stat("CONTA", `$${acct}`)}</div> : null}
              {lev ? <div style={{ display: "flex", marginRight: 26 }}>{stat("ALAVANCAGEM", `${lev}x`, GOLD)}</div> : null}
              {cost ? <div style={{ display: "flex" }}>{stat("CUSTO", `$${cost}`)}</div> : null}
            </div>
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 34px",
            borderTop: `1px solid ${LINE}`,
            background: PANEL,
          }}
        >
          <div style={{ color: GOLD, fontSize: 20, fontWeight: 700 }}>@morethanmoney.pt</div>
          <div style={{ color: MUTED, fontSize: 16 }}>Material educativo · Não é aconselhamento financeiro · Trading tem risco</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

import { NextRequest, NextResponse } from "next/server"
import {
  toBybitSymbol,
  bybitConfigured,
  getBybitEquity,
  getBybitInstrumentInfo,
  computeMasterQty,
  placeBybitPerp,
} from "@/lib/bybit"

// Edge + fra1: a Bybit bloqueia IPs dos EUA (serverless Node corre em iad1). Só as Edge
// Functions respeitam preferredRegion na Vercel Pro → esta rota corre em Frankfurt (UE).
// É a PONTE: o webhook dos perps (Node/iad1) não alcança a Bybit e faz fetch para aqui.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

const DEFAULT_COST_PCT = 0.10 // margem por posição = 10% da equity
const DEFAULT_LEVERAGE = 3

/**
 * Coloca a ordem-MESTRE na Bybit (Copy Trading nativo replica p/ seguidores): entrada a
 * mercado + SL completo + TPs parciais (reduce-only). Faz o SIZING aqui (fra1) porque o
 * webhook em iad1 não lê a wallet. Gated por BYBIT_PERPS_EXEC_ENABLED.
 *   POST /api/bybit/place   Authorization: Bearer <CRON_SECRET>
 *   body: { symbol, side, entry, sl?, tps?: number[], partials?: number[],
 *           leverage?, riskPct?, costAbs?, qty? }
 * `tps` = [tp1,tp2,tp3]; se vier só `tp`, usa-se como nível único. `qty` direta salta o sizing.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (process.env.BYBIT_PERPS_EXEC_ENABLED !== "true") {
    return NextResponse.json({ ok: false, skipped: true, reason: "BYBIT_PERPS_EXEC_ENABLED off" })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const symbol = toBybitSymbol(String(b.symbol || ""))
  if (!symbol) return NextResponse.json({ ok: false, error: "symbol em falta" }, { status: 400 })
  const side = String(b.side || "").toLowerCase() === "sell" ? "sell" : "buy"
  const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)
  const entry = num(b.entry) ?? num(b.price)
  const sl = num(b.sl)
  const takeProfits = Array.isArray(b.tps)
    ? (b.tps as unknown[]).map(num).filter((n): n is number => n != null && n > 0)
    : [num(b.tp)].filter((n): n is number => n != null && n > 0)
  const partials = Array.isArray(b.partials)
    ? (b.partials as unknown[]).map(num).filter((n): n is number => n != null && n > 0)
    : null
  const leverage = num(b.leverage) ?? DEFAULT_LEVERAGE
  const costPct = num(b.costPct) ?? (Number(process.env.BYBIT_COST_PCT) || DEFAULT_COST_PCT)
  const riskPct = num(b.riskPct) ?? (Number(process.env.BYBIT_RISK_PCT) || null) // teto opcional
  const costAbs = num(b.costAbs) ?? (Number(process.env.BYBIT_COST_ABS) || null) // teto opcional

  const instrument = await getBybitInstrumentInfo(symbol)

  // qty: direta (testes) ou dimensionada (menor entre risco riskPct e margem ≤ costAbs).
  let qty = num(b.qty) ?? 0
  let sizing = "qty direta"
  if (!(qty > 0)) {
    if (!(entry != null && entry > 0)) {
      return NextResponse.json({ ok: false, error: "entry necessário para o sizing" }, { status: 400 })
    }
    const equity = await getBybitEquity()
    if (!(equity != null && equity > 0)) {
      return NextResponse.json({ ok: false, error: "equity Bybit indisponível" }, { status: 502 })
    }
    const r = computeMasterQty({ equity, entry, sl, leverage, costPct, riskPct, costAbs, instrument })
    qty = r.qty
    sizing = `equity $${equity.toFixed(2)} · ${r.reason}`
    if (!(qty > 0)) {
      return NextResponse.json({ ok: false, error: `qty=0 após sizing (${sizing})` }, { status: 422 })
    }
  }

  const trade = await placeBybitPerp({
    symbol,
    side,
    qty,
    leverage,
    stopLoss: sl,
    takeProfits,
    partials,
    instrument,
  })

  return NextResponse.json({
    ok: trade.ok,
    retCode: trade.retCode,
    retMsg: trade.retMsg,
    orderId: trade.orderId,
    symbol,
    side,
    qty,
    slSet: trade.slSet,
    tps: trade.tps.map((t) => ({ price: t.price, qty: t.qty, ok: t.ok, err: t.ok ? undefined : t.retMsg })),
    sizing,
  })
}

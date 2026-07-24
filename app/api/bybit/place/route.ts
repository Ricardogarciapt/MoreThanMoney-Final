import { NextRequest, NextResponse } from "next/server"
import {
  placeBybitOrder,
  toBybitSymbol,
  bybitConfigured,
  getBybitEquity,
  getBybitInstrumentInfo,
  computeMasterQty,
} from "@/lib/bybit"

// Edge + fra1: a Bybit bloqueia IPs dos EUA (serverless Node corre em iad1). Só as Edge
// Functions respeitam preferredRegion na Vercel Pro → esta rota corre em Frankfurt (UE).
// É a PONTE: o webhook dos perps (Node/iad1) não alcança a Bybit e faz fetch para aqui.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

const DEFAULT_RISK_PCT = 0.001 // 0.1% da equity arriscada ao SL
const DEFAULT_COST_PCT = 0.01 // teto: 1% da equity em margem

/**
 * Coloca a ordem-MESTRE na Bybit (Copy Trading nativo replica p/ seguidores).
 * Faz o sizing AQUI (fra1) porque o webhook em iad1 não lê a wallet Bybit.
 * Interna: CRON_SECRET. Só executa com BYBIT_PERPS_EXEC_ENABLED=true (senão skipped).
 *   POST /api/bybit/place   Authorization: Bearer <CRON_SECRET>
 *   body: { symbol, side, entry, sl?, tp?, leverage?, riskPct?, costPct?, qty? }
 * Se `qty` vier definida, usa-a direto (bypass do sizing — testes).
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
  const tp = num(b.tp)
  const leverage = num(b.leverage) ?? 3
  const riskPct = num(b.riskPct) ?? (Number(process.env.BYBIT_RISK_PCT) || DEFAULT_RISK_PCT)
  const costPct = num(b.costPct) ?? (Number(process.env.BYBIT_COST_PCT) || DEFAULT_COST_PCT)

  // qty: direta (testes) ou dimensionada (menor entre risco riskPct e margem costPct×lev).
  let qty = num(b.qty) ?? 0
  let sizing = "qty direta"
  if (!(qty > 0)) {
    if (!(entry != null && entry > 0)) {
      return NextResponse.json({ ok: false, error: "entry necessário para o sizing" }, { status: 400 })
    }
    const [equity, instrument] = await Promise.all([getBybitEquity(), getBybitInstrumentInfo(symbol)])
    if (!(equity != null && equity > 0)) {
      return NextResponse.json({ ok: false, error: "equity Bybit indisponível" }, { status: 502 })
    }
    const r = computeMasterQty({ equity, entry, sl, leverage, riskPct, costPct, instrument })
    qty = r.qty
    sizing = `equity $${equity.toFixed(2)} · ${r.reason}`
    if (!(qty > 0)) {
      return NextResponse.json({ ok: false, error: `qty=0 após sizing (${sizing})` }, { status: 422 })
    }
  }

  const order = await placeBybitOrder({
    symbol,
    side,
    qty,
    orderType: "market",
    stopLoss: sl,
    takeProfit: tp,
    leverage,
  })

  return NextResponse.json({
    ok: order.ok,
    retCode: order.retCode,
    retMsg: order.retMsg,
    orderId: (order.result as { orderId?: string } | null)?.orderId ?? null,
    symbol,
    side,
    qty,
    sizing,
  })
}

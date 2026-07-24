import { NextRequest, NextResponse } from "next/server"
import { placeBybitOrder, toBybitSymbol, bybitConfigured } from "@/lib/bybit"

export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/**
 * Coloca uma ordem de TESTE na conta-mestre Bybit. Protegido por CRON_SECRET e
 * SÓ funciona em TESTNET (guarda contra ordens reais acidentais).
 *   POST /api/bybit/test-order   Authorization: Bearer <CRON_SECRET>
 *   body: { symbol, side, qty, price?, sl?, tp?, leverage?, orderType? }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (process.env.BYBIT_TESTNET !== "true") {
    return NextResponse.json({ error: "test-order só em BYBIT_TESTNET=true (evita ordens reais)" }, { status: 403 })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const symbol = toBybitSymbol(String(b.symbol || "BTCUSDT"))
  const side = String(b.side || "buy").toLowerCase() === "sell" ? "sell" : "buy"
  const qty = Number(b.qty || 0.001)
  const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)

  const r = await placeBybitOrder({
    symbol,
    side,
    qty,
    orderType: String(b.orderType || "market").toLowerCase() === "limit" ? "limit" : "market",
    price: num(b.price),
    stopLoss: num(b.sl),
    takeProfit: num(b.tp),
    leverage: num(b.leverage),
  })

  return NextResponse.json({ ok: r.ok, retCode: r.retCode, retMsg: r.retMsg, result: r.result, symbol, side, qty })
}

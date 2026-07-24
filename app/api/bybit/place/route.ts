import { NextRequest, NextResponse } from "next/server"
import { placeBybitOrder, toBybitSymbol, bybitConfigured } from "@/lib/bybit"

// Edge + fra1: a Bybit bloqueia IPs dos EUA (serverless Node corre em iad1). Só as Edge
// Functions respeitam preferredRegion na Vercel Pro → esta rota corre em Frankfurt (UE).
// É a PONTE: o webhook dos perps (Node/iad1) não alcança a Bybit e faz fetch para aqui.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/**
 * Coloca a ordem-MESTRE na Bybit (Copy Trading nativo replica p/ seguidores).
 * Interna: autenticada com CRON_SECRET (o webhook passa o mesmo). Só executa com a flag
 * BYBIT_PERPS_EXEC_ENABLED=true — senão devolve skipped (deixa o pipeline em papel).
 *   POST /api/bybit/place   Authorization: Bearer <CRON_SECRET>
 *   body: { symbol, side, qty, sl?, tp?, leverage?, orderType? }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const enabled = process.env.BYBIT_PERPS_EXEC_ENABLED === "true"
  if (!enabled) {
    return NextResponse.json({ ok: false, skipped: true, reason: "BYBIT_PERPS_EXEC_ENABLED off" })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const symbol = toBybitSymbol(String(b.symbol || ""))
  if (!symbol) return NextResponse.json({ ok: false, error: "symbol em falta" }, { status: 400 })
  const side = String(b.side || "").toLowerCase() === "sell" ? "sell" : "buy"
  const qty = Number(b.qty || 0)
  if (!(qty > 0)) return NextResponse.json({ ok: false, error: "qty inválida" }, { status: 400 })
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

  return NextResponse.json({
    ok: r.ok,
    retCode: r.retCode,
    retMsg: r.retMsg,
    orderId: (r.result as { orderId?: string } | null)?.orderId ?? null,
    symbol,
    side,
    qty,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { getBybitLastClosedPnl, bybitConfigured } from "@/lib/bybit"

// Edge + fra1 (contorna o geo-bloqueio da Bybit, como as outras rotas Bybit). READ-ONLY.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/** PnL do último fecho de um símbolo (linear). ?symbol=BTCUSDT[&sinceMs=]. Bearer CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }
  const symbol = (req.nextUrl.searchParams.get("symbol") || "").toUpperCase().trim()
  if (!symbol) return NextResponse.json({ ok: false, error: "symbol em falta" }, { status: 400 })
  const sinceMs = Number(req.nextUrl.searchParams.get("sinceMs")) || undefined
  const closed = await getBybitLastClosedPnl(symbol, sinceMs).catch(() => null)
  return NextResponse.json({ ok: true, symbol, closed })
}

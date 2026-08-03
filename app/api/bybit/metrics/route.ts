import { NextRequest, NextResponse } from "next/server"
import { getBybitPerpMetrics, bybitConfigured } from "@/lib/bybit"

// Edge + fra1 (contorna o geo-bloqueio da Bybit). READ-ONLY. Chamada internamente pela
// rota admin provider-performance (node/iad1 não alcança a Bybit).
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/** Métricas da conta-mestre Bybit (equity, lucro, win rate, trades). Bearer CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }
  const daysParam = Number(new URL(req.url).searchParams.get("days"))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 30
  const m = await getBybitPerpMetrics(days)
  return NextResponse.json(m)
}

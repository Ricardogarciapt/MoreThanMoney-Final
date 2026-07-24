import { NextRequest, NextResponse } from "next/server"
import { getBybitPositions, bybitConfigured } from "@/lib/bybit"

// Edge + fra1 (contorna o geo-bloqueio da Bybit, como as outras rotas Bybit). READ-ONLY.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/** Lista as posições abertas na conta-mestre (sem alterar nada). Bearer CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET" }, { status: 400 })
  }
  const r = await getBybitPositions()
  return NextResponse.json({ ok: r.ok, retMsg: r.retMsg, count: r.positions.length, positions: r.positions })
}

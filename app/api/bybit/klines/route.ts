import { NextRequest, NextResponse } from "next/server"

// Edge + fra1: contorna o geo-bloqueio da Bybit (o cron mtm-alerts-evaluate corre em
// node/iad1 e não alcança api.bybit.com). READ-ONLY. Devolve velas linear (hi/lo) para
// a avaliação path-based dos perps. Bearer CRON_SECRET.
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const url = new URL(req.url)
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const since = Number(url.searchParams.get("since"))
  const interval = url.searchParams.get("interval") || "15"
  if (!symbol || !Number.isFinite(since)) {
    return NextResponse.json({ ok: false, error: "symbol/since obrigatórios", candles: [] }, { status: 400 })
  }
  try {
    const end = Date.now()
    const api =
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}` +
      `&interval=${interval}&start=${Math.floor(since)}&end=${end}&limit=1000`
    const res = await fetch(api)
    const j = (await res.json()) as { result?: { list?: string[][] } }
    const list = j?.result?.list ?? []
    // Bybit devolve recente→antigo; invertemos para cronológico.
    const candles = list
      .slice()
      .reverse()
      .map((row) => ({ hi: Number(row[2]), lo: Number(row[3]) }))
      .filter((c) => Number.isFinite(c.hi) && Number.isFinite(c.lo))
    return NextResponse.json({ ok: true, symbol, count: candles.length, candles })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "erro", candles: [] })
  }
}

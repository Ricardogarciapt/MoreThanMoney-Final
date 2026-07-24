import { NextRequest, NextResponse } from "next/server"
import { getBybitWalletBalance, bybitConfigured } from "@/lib/bybit"

// Edge Runtime + fra1: só as Edge Functions respeitam preferredRegion na Vercel Pro.
// Corre em Frankfurt (UE) → contorna o geo-bloqueio da Bybit (serverless Node corre em iad1/EUA).
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/**
 * Valida as keys Bybit lendo o saldo (SEM colocar ordens). Protegido por CRON_SECRET.
 *   GET /api/bybit/selftest  (Authorization: Bearer <CRON_SECRET>)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!bybitConfigured()) {
    return NextResponse.json({ ok: false, error: "sem BYBIT_API_KEY/SECRET na Vercel" }, { status: 400 })
  }

  const r = await getBybitWalletBalance()
  const testnet = process.env.BYBIT_TESTNET === "true"
  const list = (r.result as { list?: { totalEquity?: string; coin?: unknown[] }[] } | null)?.list ?? []
  const totalEquity = list[0]?.totalEquity ?? null

  return NextResponse.json({
    ok: r.ok,
    testnet,
    region: process.env.VERCEL_REGION ?? "?",
    httpStatus: r.status,
    retCode: r.retCode,
    retMsg: r.retMsg,
    totalEquity,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { getBybitWalletBalance, getBybitPositions, bybitConfigured } from "@/lib/bybit"

// Edge + fra1: contorna o geo-bloqueio da Bybit (serverless Node corre em iad1/EUA).
export const runtime = "edge"
export const preferredRegion = "fra1"
export const dynamic = "force-dynamic"

/**
 * DIAGNÓSTICO da carteira Bybit (conta UNIFIED) — breakdown completo para perceber porque é que
 * o `available` pode estar a $0 mesmo com saldo. Mostra os totais + cada moeda (walletBalance,
 * equity, availableToWithdraw, margem inicial usada) + resumo de posições abertas.
 *   GET /api/bybit/wallet  (Authorization: Bearer <CRON_SECRET>)
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

  const [r, pos] = await Promise.all([getBybitWalletBalance(), getBybitPositions()])
  const row = (r.result as { list?: Record<string, unknown>[] } | null)?.list?.[0] ?? null
  const n = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null)

  const coins = Array.isArray(row?.coin)
    ? (row!.coin as Record<string, unknown>[])
        .map((c) => ({
          coin: String(c.coin ?? ""),
          walletBalance: n(c.walletBalance),
          equity: n(c.equity),
          availableToWithdraw: n(c.availableToWithdraw),
          usdValue: n(c.usdValue),
          positionIM: n(c.totalPositionIM),
          orderIM: n(c.totalOrderIM),
          unrealisedPnl: n(c.unrealisedPnl),
        }))
        .filter((c) => (c.walletBalance ?? 0) !== 0 || (c.equity ?? 0) !== 0)
    : []

  const totalEquity = n(row?.totalEquity)
  const totalAvailable = n(row?.totalAvailableBalance)
  const totalInitialMargin = n(row?.totalInitialMargin)
  const totalMaintMargin = n(row?.totalMaintenanceMargin)
  const totalMarginBalance = n(row?.totalMarginBalance)

  // Disponível CALCULADO (robusto ao caso dos totais vazios): USDT equity − margem de posições/ordens.
  const usdt = coins.find((c) => c.coin === "USDT") ?? coins[0]
  const usdtEquity = usdt?.equity ?? usdt?.walletBalance ?? null
  const usdtIM = (usdt?.positionIM ?? 0) + (usdt?.orderIM ?? 0)
  const availableCalculado =
    totalAvailable != null ? totalAvailable : usdtEquity != null ? Math.max(0, usdtEquity - usdtIM) : null

  // Diagnóstico automático
  let diagnostico = "available OK"
  if (totalAvailable == null && availableCalculado != null && availableCalculado > 0.01) {
    diagnostico = `Bybit devolveu os totais agregados VAZIOS (modo de margem da UTA) → o disponível REAL é ~$${availableCalculado.toFixed(2)} (equity USDT − margem). O motor já usa este cálculo (fix getBybitWallet).`
  } else if ((availableCalculado ?? 0) <= 0.01) {
    if ((totalEquity ?? 0) <= 0.01) diagnostico = "conta UNIFIED sem equity → os fundos estão NOUTRA carteira (Funding/Spot/subconta). Transfere USDT para a Unified Trading Account."
    else diagnostico = "quase toda a equity está presa como margem de posições/ordens abertas → fecha/reduz posições para libertar."
  }

  return NextResponse.json({
    ok: r.ok,
    region: process.env.VERCEL_REGION ?? "?",
    accountType: String(row?.accountType ?? "?"),
    retCode: r.retCode,
    retMsg: r.retMsg,
    totais: {
      totalEquity,
      totalMarginBalance,
      totalAvailableBalance: totalAvailable,
      totalInitialMargin,
      totalMaintenanceMargin: totalMaintMargin,
    },
    availableCalculado,
    moedas: coins,
    posicoesAbertas: pos.positions.length,
    posicoes: pos.positions.map((p) => ({ symbol: p.symbol, side: p.side, size: p.size, uPnl: p.unrealisedPnl })),
    diagnostico,
  })
}

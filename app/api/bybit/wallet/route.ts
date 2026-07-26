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

  // Diagnóstico automático da causa provável do available=0
  let diagnostico = "available OK"
  if ((totalAvailable ?? 0) <= 0.01) {
    if ((totalEquity ?? 0) <= 0.01) diagnostico = "conta UNIFIED sem equity → os fundos estão NOUTRA carteira (Funding/Spot/subconta). Transfere USDT para a Unified Trading Account."
    else if ((totalInitialMargin ?? 0) >= (totalEquity ?? 0) * 0.9) diagnostico = "quase toda a equity está presa como margem inicial de posições/ordens abertas → fecha/reduz posições para libertar."
    else if (coins.every((c) => (c.availableToWithdraw ?? 0) <= 0.01)) diagnostico = "há equity mas 0 disponível por moeda → provável colateral desligado ou moeda não-USDT sem ser aceite como margem. Vê 'Margin' nas definições da conta Bybit."
    else diagnostico = "available=0 com equity>0 e margem baixa → verifica o modo de margem (isolada) e o collateral da conta."
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
    moedas: coins,
    posicoesAbertas: pos.positions.length,
    posicoes: pos.positions.map((p) => ({ symbol: p.symbol, side: p.side, size: p.size, uPnl: p.unrealisedPnl })),
    diagnostico,
  })
}

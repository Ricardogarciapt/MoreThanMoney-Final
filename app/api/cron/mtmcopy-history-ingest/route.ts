import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { ingestClosedTradesForAllConnections, diagnoseIngestion, ingestMasterStrategyTrades, MASTER_STRATEGIES } from "@/lib/mtmcopy/history-ingest"
import { listOpenPositions } from "@/lib/mtmcopy/metaapi"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Ingere o histórico real de trades fechados (últimos 90 dias) de todas as contas
 * ligadas (T2T + MTM Copy + auditadas) para o plano de trading do utilizador.
 * Corre periodicamente via Vercel Cron; é idempotente (dedup por posição do broker).
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const dbg = new URL(request.url).searchParams.get("debug")
    // ?debug=positions → posições ABERTAS por conta-mestre (detetar acumulação).
    if (dbg === "positions") {
      const out = []
      for (const m of MASTER_STRATEGIES) {
        const pos = (await listOpenPositions(m.accountId)) as Array<Record<string, unknown>>
        out.push({
          strategy: m.strategy,
          abertas: pos.length,
          volume: pos.reduce((s, p) => s + (Number(p.volume) || 0), 0),
          simbolos: Array.from(new Set(pos.map((p) => p.symbol as string))).slice(0, 8),
          mais_antiga: pos.map((p) => (p.time ?? p.openTime) as string).filter(Boolean).sort()[0] ?? null,
        })
      }
      return NextResponse.json({ ok: true, openPositions: out })
    }
    // ?debug=masters → corre só a ingestão das estratégias-mestre e devolve o erro exato.
    if (dbg === "masters") {
      try {
        return NextResponse.json({ ok: true, masters: await ingestMasterStrategyTrades() })
      } catch (e) {
        return NextResponse.json({ ok: false, mastersError: e instanceof Error ? e.message : String(e) })
      }
    }
    // ?debug=1 → diagnóstico read-only (deals por conta slave + mestre), não ingere.
    if (dbg === "1") {
      return NextResponse.json({ ok: true, debug: await diagnoseIngestion() })
    }
    const result = await ingestClosedTradesForAllConnections()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro na ingestão" },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { evaluateOpenAlerts } from "@/lib/mtm-alerts/evaluate"

/**
 * CRON: avalia o estado dos Alertas MTM abertos (pending/active) contra o preço
 * atual e escala para exit_1/2/3 (win) ou loss. Alimenta o win rate mostrado
 * nos Alertas MTM e na mensagem de estado diária.
 * Horário: a cada 15 minutos.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await evaluateOpenAlerts()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "erro" },
      { status: 500 }
    )
  }
}

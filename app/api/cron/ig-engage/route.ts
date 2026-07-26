/**
 * Cron de ENGAGEMENT automático no Instagram (warm/hot, diário).
 *
 * Responde com apreço a quem comentou nos posts do Ricardo/MTM dos últimos 15 dias,
 * priorizando os conteúdos com mais views (≥2k). NÃO faz cold outreach — só toca em
 * pessoas que já interagiram com os teus próprios posts. Dedup por comment_id.
 *
 * Auto live: publica as respostas diretamente (aprovado pelo Ricardo). Cadência: 1×/dia.
 */
import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runIgEngagement, diagnoseIgAccess } from "@/lib/instagram/engage"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ?mode=diagnose → só verifica scopes/capacidades do token (read-only, NÃO publica nada).
  const mode = new URL(request.url).searchParams.get("mode")
  if (mode === "diagnose") {
    return NextResponse.json(await diagnoseIgAccess())
  }
  const result = await runIgEngagement()
  const totalReplied = result.accounts.reduce((s, a) => s + a.replied, 0)
  console.log(`[ig-engage] respondidos=${totalReplied} ::`, JSON.stringify(result.accounts))
  return NextResponse.json({ totalReplied, ...result })
}

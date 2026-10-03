/**
 * Cron do FUNIL IG — Prospector + Setter (comment → DM). Corre a cada 30 min para apanhar a
 * intenção enquanto está quente. Deteta palavras-chave nos comentários e envia DM com a oferta.
 * O Closer (conversa na DM) é tratado pelo /api//closer + o link fecha (register→trial).
 */
import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runIgFunnel } from "@/lib/instagram/funnel"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await runIgFunnel()
  const dms = result.accounts.reduce((s, a) => s + a.dmsSent, 0)
  const leads = result.accounts.reduce((s, a) => s + a.leads, 0)
  console.log(`[ig-funnel] leads=${leads} dms=${dms} ::`, JSON.stringify(result.accounts))
  return NextResponse.json({ leads, dms, ...result })
}

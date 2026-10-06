/**
 * Cron do FUNIL IG — Prospector + Setter (comment → DM). Corre a cada 30 min para apanhar a
 * intenção enquanto está quente. Deteta palavras-chave nos comentários e envia DM com a oferta.
 * O Closer (conversa na DM) é o motor nativo em lib/instagram/dm-closer.ts (webhook
 * /api/webhooks/instagram) + o link fecha (Telegram/register).
 */
import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runIgFunnel } from "@/lib/instagram/funnel"
import { enviarAprovadosPendentes } from "@/lib/instagram/setter"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await runIgFunnel()
  // Os rascunhos do setter que uma pessoa APROVOU e cuja tentativa de envio falhou. Os
  // `pendente` nunca saem por aqui — ver lib/envios-aprovacao.ts.
  let aprovadosEnviados = 0
  try { aprovadosEnviados = await enviarAprovadosPendentes() } catch {}
  const dms = result.accounts.reduce((s, a) => s + a.dmsSent, 0)
  const leads = result.accounts.reduce((s, a) => s + a.leads, 0)
  console.log(`[ig-funnel] leads=${leads} dms=${dms} ::`, JSON.stringify(result.accounts))
  return NextResponse.json({ leads, dms, aprovadosEnviados, ...result })
}

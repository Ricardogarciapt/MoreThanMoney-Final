/**
 * Cron do FUNIL IG — Prospector + Setter (comment → DM). Corre a cada 30 min para apanhar a
 * intenção enquanto está quente. Deteta palavras-chave nos comentários e envia DM com a oferta.
 * O Closer (conversa na DM) é o motor nativo em lib/instagram/dm-closer.ts (webhook
 * /api/webhooks/instagram) + o link fecha (Telegram/register).
 */
import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runIgFunnel } from "@/lib/instagram/funnel"
import { reenviarDmsPorSair } from "@/lib/instagram/setter"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await runIgFunnel()
  // As DMs do setter cujo envio imediato falhou: reenviam-se até 48 h depois do comentário; a
  // partir daí ficam `expirado` e nunca saem (lib/envios-aprovacao.ts, `dm_ao_comentador`).
  let reenvio = { enviadas: 0, expiradas: 0 }
  try { reenvio = await reenviarDmsPorSair() } catch {}
  const dms = result.accounts.reduce((s, a) => s + a.dmsSent, 0)
  const leads = result.accounts.reduce((s, a) => s + a.leads, 0)
  console.log(`[ig-funnel] leads=${leads} dms=${dms} ::`, JSON.stringify(result.accounts))
  return NextResponse.json({ leads, dms, reenvio, ...result })
}

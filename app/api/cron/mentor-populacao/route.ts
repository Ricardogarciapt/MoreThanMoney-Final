import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { correrPendentes } from "@/lib/mentor/populacao-servidor"

/**
 * De noite (00h–06h UTC, de 10 em 10 min): corre 4 personas do teste de população do Mentor,
 * para não gastar a quota grátis de IA que o site usa de dia. Sem pendentes não faz nada.
 * Às 03h faz também a limpeza RGPD das conversas com mais de 12 meses.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const agora = new Date()
  if (agora.getUTCHours() === 3 && agora.getUTCMinutes() < 10) {
    await getSupabaseAdmin().rpc("mentor_limpar_antigos").then(() => null, () => null)
  }
  const n = Math.min(10, Math.max(0, Number(process.env.MENTOR_POP_POR_CORRIDA ?? 4)))
  const r = n ? await correrPendentes(n) : { feitas: 0, pedidas: 0 }
  return NextResponse.json({ ok: true, ...r })
}

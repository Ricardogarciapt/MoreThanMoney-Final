import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { prepararFila } from "@/lib/instagram/fila-comentarios-servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * O agente Prospector (AG-PROSPECTOR) a preparar a fila de comentários.
 *
 * Mesmo horário do radar (de meia em meia hora, 9h–17h), desfasado um quarto de hora para
 * apanhar o que o radar acabou de encontrar: `15,45 9-16 * * *` no vercel.json.
 *
 * Só ESCREVE. Publicar é sempre o dono, à mão, no Instagram: a Graph API não comenta em posts
 * de terceiros e automatizar o browser põe a conta em risco. No máximo 20 por dia.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const r = await prepararFila(getSupabaseAdmin())
  if (r.erros.length) console.log("[fila-comentarios]", r.erros.join(" · "))
  return NextResponse.json({ ok: true, ...r })
}

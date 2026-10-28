import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { passagemOperador } from "@/lib/operador/servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * O agente operador (AG-OPERADOR): aprova posts e envios que passam nas regras e limpa a fila de
 * comentários, de meia em meia hora das 8h às 22h (Lisboa no inverno). Tudo fica em `operador_registo`.
 * Em `site_settings.operador.modo = "ensaio"` só escreve o que faria. Ver lib/operador/regras.ts.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await passagemOperador(getSupabaseAdmin())
  if (r.erros.length) console.log("[operador]", r.erros.join(" · "))
  return NextResponse.json({ ok: true, ...r })
}

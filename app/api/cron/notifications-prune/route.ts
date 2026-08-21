import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * CRON diário: poda a tabela `notifications`.
 *
 * Chegou a 793 mil linhas e 330 MB para 132 pessoas — mais de cinco mil avisos por pessoa,
 * nenhum deles lido depois do primeiro dia. Era isso que puxava o egress do Supabase: cada
 * sondagem do painel lia de uma tabela desse tamanho.
 *
 * Regra: fora as lidas com mais de 7 dias, e fora tudo o que passe de 30 dias. Ninguém abre a
 * app para ver um aviso do mês passado.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const agora = Date.now()
  const out: Record<string, unknown> = {}

  for (const [nome, corte, sóLidas] of [
    ["lidas_7d", new Date(agora - 7 * 86_400_000), true],
    ["tudo_30d", new Date(agora - 30 * 86_400_000), false],
  ] as Array<[string, Date, boolean]>) {
    let q = supabase.from("notifications").delete({ count: "exact" }).lt("created_at", corte.toISOString())
    if (sóLidas) q = q.eq("read", true)
    const { error, count } = await q
    out[nome] = error ? `erro: ${error.message}` : (count ?? 0)
  }

  // notification_history serve para diagnóstico de envios; 30 dias chega.
  const { error: eh } = await supabase
    .from("notification_history")
    .delete()
    .lt("created_at", new Date(agora - 30 * 86_400_000).toISOString())
  out.historico_30d = eh ? `erro: ${eh.message}` : "ok"

  return NextResponse.json({ ok: true, ...out })
}

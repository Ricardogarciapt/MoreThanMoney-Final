import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { correrRadarProspecao } from "@/lib/prospecao/correr-radar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * O radar de prospeção, uma vez por dia.
 *
 * Não procura pessoas novas e não fala com ninguém — arruma o que o webhook do bot já apanhou:
 * tira da lista quem entretanto entrou no funil, redesenha o mapa dos grupos e deixa a lista
 * priorizada pronta para o dono decidir a quem fala.
 *
 * Uma vez por dia e não de hora a hora porque a matéria-prima chega em tempo real pelo webhook —
 * isto é só a arrumação, e arrumar de hora a hora não muda nada a não ser a fatura.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const r = await correrRadarProspecao(getSupabaseAdmin())
  if (r.avisoDoMapa) console.log("[prospecao-radar]", r.avisoDoMapa)
  if (!r.cobertura.ok) console.log("[prospecao-radar] cobertura:", r.cobertura.aviso)

  return NextResponse.json({ ok: true, ...r })
}

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { desfazer, gravarConfigOperador, lerConfigOperador, lerRegisto, passagemOperador } from "@/lib/operador/servidor"
import { lerConfig } from "@/lib/operador/regras"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** O registo do agente operador, para o dono auditar. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  return NextResponse.json({ ok: true, ...(await lerRegisto(getSupabaseAdmin())) })
}

/**
 * { acao: "desfazer", id }  → desfaz uma linha (posts e comentários; envios que saíram, não)
 * { acao: "correr" }        → faz já uma passagem
 * { acao: "config", modo?, posts?, envios?, comentarios? } → muda o modo e as áreas
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()

  if (corpo.acao === "desfazer" && typeof corpo.id === "string") {
    const r = await desfazer(db, corpo.id, "admin:painel")
    return NextResponse.json(r, { status: r.ok ? 200 : 409 })
  }
  if (corpo.acao === "correr") {
    return NextResponse.json({ ok: true, ...(await passagemOperador(db)) })
  }
  if (corpo.acao === "config") {
    const atual = await lerConfigOperador(db)
    const nova = lerConfig({ ...atual, ...corpo })
    await gravarConfigOperador(db, nova)
    return NextResponse.json({ ok: true, config: nova })
  }
  return NextResponse.json({ ok: false, erro: "Pedido incompleto" }, { status: 400 })
}

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  lerFila,
  marcarAberto,
  marcarPublicado,
  marcarSaltado,
  prepararFila,
} from "@/lib/instagram/fila-comentarios-servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** A fila: os comentários prontos e os contadores. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  return NextResponse.json({ ok: true, ...(await lerFila(getSupabaseAdmin())) })
}

/**
 * As acções do dono sobre a fila. Nenhuma publica: «aberto» e «publicado» registam o que o
 * dono fez à mão no Instagram.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; id?: string }
  const db = getSupabaseAdmin()

  try {
    switch (corpo.acao) {
      case "preparar":
        return NextResponse.json({ ok: true, ...(await prepararFila(db)) })
      case "aberto":
        if (!corpo.id) break
        await marcarAberto(db, corpo.id)
        return NextResponse.json({ ok: true })
      case "publiquei":
        if (!corpo.id) break
        return NextResponse.json({ ok: true, registo: await marcarPublicado(db, corpo.id) })
      case "saltar":
        if (!corpo.id) break
        await marcarSaltado(db, corpo.id)
        return NextResponse.json({ ok: true })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 400 })
  }
  return NextResponse.json({ ok: false, erro: "Pedido incompleto" }, { status: 400 })
}

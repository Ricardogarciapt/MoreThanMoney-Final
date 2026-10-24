import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { materialParaGravar } from "@/lib/lms/aulas"

/**
 * MATERIAIS DE UMA SALA (211) — o admin junta e tira os guias em PDF, playlists a mais e links.
 *
 * POST   { streamId, titulo, url, tipo, descricao?, ordem? } → junta
 * DELETE { id }                                              → tira
 *
 * A leitura vem com as salas, em GET /api/admin/live-sessions/streams (e, para os alunos, em
 * /api/live-sessions/streams, já com o nível aplicado). A validação é a de `materialParaGravar`.
 */

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json().catch(() => ({}))
    const streamId = String(body.streamId || "").trim()
    if (!streamId) return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })

    const v = materialParaGravar(body)
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })

    const { data, error } = await supabase
      .from("lms_stream_materiais")
      .insert({ stream_id: streamId, ...v.material })
      .select("id, stream_id, titulo, descricao, url, tipo, ordem")
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || "").trim()
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })

    const { error } = await supabase.from("lms_stream_materiais").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

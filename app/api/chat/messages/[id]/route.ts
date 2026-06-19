import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

async function resolveUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_type")
    .eq("id", data.user.id)
    .single()

  return profile ?? null
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "ID em falta" }, { status: 400 })
    }

    const profile = await resolveUser(request)
    if (!profile) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Fetch the message to verify ownership
    const { data: msg, error: fetchErr } = await supabase
      .from("chat_messages")
      .select("id, user_id, is_deleted")
      .eq("id", id)
      .single()

    if (fetchErr || !msg) {
      return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })
    }

    if (msg.is_deleted) {
      return NextResponse.json({ ok: true }) // already deleted
    }

    const isAdmin = profile.user_type === "admin"
    const isOwner = msg.user_id === profile.id

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Sem permissão para apagar esta mensagem" }, { status: 403 })
    }

    const { error: updateErr } = await supabase
      .from("chat_messages")
      .update({ is_deleted: true })
      .eq("id", id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}

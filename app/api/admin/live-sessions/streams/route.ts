import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from("lms_streams")
    .select(`
      *,
      academy:lms_academies(id, name),
      educator:lms_educators(id, display_name)
    `)
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const payload = {
      academy_id: body.academy_id,
      educator_id: body.educator_id,
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim() || null,
      thumbnail_url: String(body.thumbnail_url || "").trim() || null,
      category: String(body.category || "").trim() || null,
      scheduled_start_at: body.scheduled_start_at ? String(body.scheduled_start_at) : null,
      viewer_count: typeof body.viewer_count === "number" ? body.viewer_count : 0,
      stream_key: String(body.stream_key || "").trim() || null,
      rtmps_url: String(body.rtmps_url || "").trim() || getLmsIngestServerUrl(),
      playback_url: String(body.playback_url || "").trim() || null,
      restream_embed_url: String(body.restream_embed_url || "").trim() || null,
      chat_enabled: body.chat_enabled !== false,
      is_live: Boolean(body.is_live),
    }

    if (!payload.academy_id || !payload.educator_id || !payload.title) {
      return NextResponse.json({ error: "academy_id, educator_id e title são obrigatórios" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("lms_streams")
      .insert(payload)
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })

    const updates: Record<string, any> = {}
    const fields = [
      "academy_id",
      "educator_id",
      "title",
      "description",
      "thumbnail_url",
      "category",
      "scheduled_start_at",
      "viewer_count",
      "stream_key",
      "rtmps_url",
      "playback_url",
      "restream_embed_url",
      "chat_enabled",
      "is_live",
    ]

    for (const field of fields) {
      if (body[field] !== undefined) updates[field] = body[field]
    }
    if (updates.title !== undefined) updates.title = String(updates.title || "").trim()
    if (updates.description !== undefined) updates.description = String(updates.description || "").trim() || null

    if (updates.is_live === true) {
      updates.live_started_at = new Date().toISOString()
      updates.live_ended_at = null
    }
    if (updates.is_live === false) {
      updates.live_ended_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from("lms_streams")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()

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
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })

    const { error } = await supabase.from("lms_streams").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

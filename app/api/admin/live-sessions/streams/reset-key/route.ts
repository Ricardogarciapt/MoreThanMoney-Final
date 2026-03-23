import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

function generateStreamKey(streamId: string, educatorId: string) {
  const token = randomBytes(16).toString("hex")
  const shortStream = streamId.replace(/-/g, "").slice(0, 8)
  const shortEducator = educatorId.replace(/-/g, "").slice(0, 8)
  return `mtm_${shortEducator}_${shortStream}_${token}`
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const streamId = String(body.streamId || "")
    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    const { data: stream, error: streamError } = await supabase
      .from("lms_streams")
      .select("id, educator_id")
      .eq("id", streamId)
      .single()

    if (streamError || !stream) {
      return NextResponse.json({ error: "Stream não encontrada" }, { status: 404 })
    }

    const streamKey = generateStreamKey(stream.id, stream.educator_id)
    const { data, error } = await supabase
      .from("lms_streams")
      .update({ stream_key: streamKey, is_live: false, live_ended_at: new Date().toISOString() })
      .eq("id", streamId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, stream_key: streamKey })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


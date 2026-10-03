import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"
import { generateMtmIngestStreamKey } from "@/lib/lms-stream-keys"

const supabase = getSupabaseAdmin()

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

    const streamKey = generateMtmIngestStreamKey(stream.educator_id)
    // A chave é POR EDUCADOR (fixa). Fonte de verdade = lms_educators.stream_key_fixed.
    await supabase
      .from("lms_educators")
      .update({ stream_key_fixed: streamKey })
      .eq("id", stream.educator_id)

    // Aplica a nova chave a TODAS as salas do educador (ficam consistentes; sem órfãs).
    const { error } = await supabase
      .from("lms_streams")
      .update({
        stream_key: streamKey,
        rtmps_url: getLmsIngestServerUrl(),
        is_live: false,
        live_ended_at: new Date().toISOString(),
      })
      .eq("educator_id", stream.educator_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, stream_key: streamKey })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


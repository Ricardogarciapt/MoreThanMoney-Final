import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"
import { generateMtmIngestStreamKey } from "@/lib/lms-stream-keys"

const supabase = getSupabaseAdmin()

/**
 * O educador gera uma nova chave no formato MTM (servidor de ingestão HLS).
 * Não altera restream_stream_key — isso é independente no cartão Restream.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null
    if (!educator) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const streamId = String(body.streamId || "").trim()
    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    const { data: stream, error: streamError } = await supabase
      .from("lms_streams")
      .select("id, educator_id")
      .eq("id", streamId)
      .eq("educator_id", educator.educatorId)
      .maybeSingle()

    if (streamError || !stream) {
      return NextResponse.json({ error: "Canal não encontrado para esta conta" }, { status: 404 })
    }

    const streamKey = generateMtmIngestStreamKey(educator.educatorId)
    const ingestUrl = getLmsIngestServerUrl()

    const { error: eduErr } = await supabase
      .from("lms_educators")
      .update({ stream_key_fixed: streamKey, updated_at: new Date().toISOString() })
      .eq("id", educator.educatorId)

    if (eduErr) {
      return NextResponse.json({ error: eduErr.message }, { status: 500 })
    }

    const { error: streamsErr } = await supabase
      .from("lms_streams")
      .update({
        stream_key: streamKey,
        rtmps_url: ingestUrl,
        is_live: false,
        live_ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("educator_id", educator.educatorId)

    if (streamsErr) {
      return NextResponse.json({ error: streamsErr.message }, { status: 500 })
    }

    const { data: updated } = await supabase
      .from("lms_streams")
      .select("*")
      .eq("id", streamId)
      .single()

    return NextResponse.json({
      success: true,
      stream_key: streamKey,
      data: updated,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null

    if (!educator) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const streamId = String(body.streamId || "")
    const action = String(body.action || "").trim()
    const isLive = Boolean(body.isLive)
    const forceRegenerateKey = Boolean(body.regenerate)

    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    const { data: stream, error: streamError } = await supabase
      .from("lms_streams")
      .select("*")
      .eq("id", streamId)
      .eq("educator_id", educator.educatorId)
      .single()

    if (streamError || !stream) {
      return NextResponse.json({ error: "Canal não encontrado para este educador" }, { status: 404 })
    }

    const wantsStart = action === "start" || (action === "" && isLive === true)
    const wantsPause = action === "pause" || (action === "" && isLive === false)
    const wantsGenerate = action === "generate"

    const updates: Record<string, any> = {}
    const ingestUrl = getLmsIngestServerUrl()
    const { data: educatorRow } = await supabase
      .from("lms_educators")
      .select("stream_key_fixed")
      .eq("id", educator.educatorId)
      .single()
    const fixedKey = educatorRow?.stream_key_fixed || stream.stream_key

    if (!fixedKey) {
      return NextResponse.json(
        { error: "A tua chave fixa ainda não foi definida. Contacta o admin para gerar chave." },
        { status: 400 }
      )
    }

    const needsKey = !stream.stream_key || !stream.rtmps_url
    const shouldRefreshIngest = wantsGenerate || wantsStart || needsKey

    // Chave de transmissão é fixa por educador.
    updates.stream_key = fixedKey
    if (shouldRefreshIngest) updates.rtmps_url = ingestUrl

    if (wantsStart) {
      updates.is_live = true
      updates.live_started_at = new Date().toISOString()
      updates.live_ended_at = null
    }

    if (wantsPause) {
      updates.is_live = false
      updates.live_ended_at = new Date().toISOString()
    }

    // Ignora tentativa de regenerar chave quando a política é chave fixa.
    if (forceRegenerateKey && wantsGenerate) {
      updates.live_ended_at = stream.live_ended_at || null
    }

    const { data, error } = await supabase
      .from("lms_streams")
      .update(updates)
      .eq("id", streamId)
      .eq("educator_id", educator.educatorId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


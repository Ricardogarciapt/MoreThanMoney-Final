import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"
import { DEFAULT_RESTREAM_INGEST_URL, normalizeRestreamIngestUrl } from "@/lib/lms-restream"
import { normalizeIngestProvider } from "@/lib/lms-stream-options"

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
    const { data: educatorRow } = await supabase
      .from("lms_educators")
      .select("stream_key_fixed, restream_enabled, restream_ingest_url, restream_stream_key")
      .eq("id", educator.educatorId)
      .single()
    const restreamBase =
      normalizeRestreamIngestUrl(educatorRow?.restream_ingest_url || null) || DEFAULT_RESTREAM_INGEST_URL
    const restreamKey = educatorRow?.restream_stream_key || null
    const restreamEnabled = Boolean(educatorRow?.restream_enabled)
    const ingestProvider = normalizeIngestProvider(stream.ingest_provider)
    const shouldUseRestream = Boolean(ingestProvider === "restream" && restreamEnabled && restreamKey)

    if (ingestProvider === "restream" && !shouldUseRestream) {
      return NextResponse.json(
        {
          error:
            "Este canal está em Ingest Restream, mas a conta do educador não tem Restream configurado corretamente (ativar Restream e definir stream key).",
        },
        { status: 400 }
      )
    }

    const fixedKey = educatorRow?.stream_key_fixed || stream.stream_key
    if (!fixedKey && !shouldUseRestream) {
      return NextResponse.json({ error: "Falta definir chave de ingestão para iniciar o canal." }, { status: 400 })
    }

    // Só devemos sobrescrever ingest/keys quando:
    // - a gente pediu geração de chave (`generate`), ou
    // - o canal está com chave/ingest em falta.
    // Isso evita divergência entre a chave que o OBS está a usar e a que o site passa a procurar (HLS).
    const needsKey = !stream.stream_key || !stream.rtmps_url
    const shouldRefreshIngest = wantsGenerate || needsKey

    // Ingestão: Restream (RTMPS + key) quando configurado; caso contrário MTM direto.
    updates.stream_key = shouldUseRestream ? restreamKey : fixedKey
    if (shouldRefreshIngest) updates.rtmps_url = shouldUseRestream ? restreamBase : getLmsIngestServerUrl()

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


import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { randomBytes } from "crypto"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()
const RTMPS_BASE_URL = process.env.LMS_RTMPS_BASE_URL || "rtmps://live.morethanmoney.local/live"

function generateStreamKey(streamId: string, educatorId: string) {
  const token = randomBytes(16).toString("hex")
  const shortStream = streamId.replace(/-/g, "").slice(0, 8)
  const shortEducator = educatorId.replace(/-/g, "").slice(0, 8)
  return `mtm_${shortEducator}_${shortStream}_${token}`
}

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
    const regenerate = Boolean(body.regenerate)

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

    // Geração por canal: ao iniciar, gera automaticamente se não existir.
    // Também permite regeneração manual.
    if (wantsGenerate || regenerate || (wantsStart && (!stream.stream_key || !stream.rtmps_url))) {
      updates.stream_key = generateStreamKey(streamId, educator.educatorId)
      updates.rtmps_url = RTMPS_BASE_URL
    }

    if (wantsStart) {
      updates.is_live = true
      updates.live_started_at = new Date().toISOString()
      updates.live_ended_at = null
    }

    if (wantsPause) {
      updates.is_live = false
      updates.live_ended_at = new Date().toISOString()
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


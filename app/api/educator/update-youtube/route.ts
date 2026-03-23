import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

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
    const youtubeKey = String(body.youtube_key || "").trim() || null
    const youtubeEnabled = Boolean(body.youtube_enabled)

    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("lms_streams")
      .update({
        youtube_key: youtubeKey,
        youtube_enabled: youtubeEnabled,
      })
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


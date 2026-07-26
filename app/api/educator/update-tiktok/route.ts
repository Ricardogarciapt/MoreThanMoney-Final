import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()

/**
 * POST /api/educator/update-tiktok — o educador guarda a sua Stream Key TikTok LIVE (+ server)
 * para multistream. O relay do servidor RTMP replica a stream para o TikTok com esta key.
 * Body: { tiktok_key, tiktok_server, tiktok_enabled }
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null
    if (!educator) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const tiktokKey = String(body.tiktok_key || "").trim() || null
    // Server do TikTok (ex.: rtmp://...tiktokcdn.com/live/). Garante barra final.
    let tiktokServer = String(body.tiktok_server || "").trim() || null
    if (tiktokServer && !tiktokServer.endsWith("/")) tiktokServer += "/"
    const tiktokEnabled = Boolean(body.tiktok_enabled)

    const { data, error } = await supabase
      .from("lms_educators")
      .update({
        tiktok_stream_key: tiktokKey,
        tiktok_server: tiktokServer,
        tiktok_enabled: tiktokEnabled,
      })
      .eq("id", educator.educatorId)
      .select("id, tiktok_enabled, tiktok_server")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

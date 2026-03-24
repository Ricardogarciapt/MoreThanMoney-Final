import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()

/** Sem chaves de ingestão nem YouTube — só para listagens públicas / alunos. */
const STREAM_SELECT_PUBLIC = `
  id,
  title,
  description,
  thumbnail_url,
  is_live,
  educator_id,
  academy_id,
  playback_url,
  restream_embed_url,
  chat_enabled,
  youtube_enabled,
  live_started_at,
  live_ended_at,
  created_at,
  updated_at,
  category,
  scheduled_start_at,
  viewer_count,
  academy:lms_academies(id, slug, name),
  educator:lms_educators(id, display_name, bio, avatar_url, is_active, specialty, restream_enabled, restream_embed_url)
`

const STREAM_SELECT_EDUCATOR = `
  *,
  academy:lms_academies(id, slug, name),
  educator:lms_educators(id, display_name, bio, avatar_url, is_active, specialty)
`

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const academyId = searchParams.get("academyId")
    const educatorId = searchParams.get("educatorId")
    const onlyLive = searchParams.get("live") === "true"

    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const authEducator = token ? verifyEducatorToken(token) : null
    const canSeeSecrets = Boolean(educatorId && authEducator && authEducator.educatorId === educatorId)

    const selectColumns = canSeeSecrets ? STREAM_SELECT_EDUCATOR : STREAM_SELECT_PUBLIC

    let query = supabase
      .from("lms_streams")
      .select(selectColumns)
      .order("is_live", { ascending: false })
      .order("updated_at", { ascending: false })

    if (academyId) query = query.eq("academy_id", academyId)
    if (educatorId) query = query.eq("educator_id", educatorId)
    if (onlyLive) query = query.eq("is_live", true)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


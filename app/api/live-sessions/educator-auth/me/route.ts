import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  if (!token) {
    return NextResponse.json({ authenticated: false })
  }
  const payload = verifyEducatorToken(token)
  if (!payload) {
    return NextResponse.json({ authenticated: false })
  }

  const { data: profile } = await supabase
    .from("lms_educators")
    .select(
      "academy_id, avatar_url, bio, specialty, restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url, fish_voice_id"
    )
    .eq("id", payload.educatorId)
    .maybeSingle()

  return NextResponse.json({
    authenticated: true,
    educator: {
      ...payload,
      academy_id: profile?.academy_id ?? null,
      avatar_url: profile?.avatar_url ?? null,
      bio: profile?.bio ?? null,
      specialty: profile?.specialty ?? null,
      restream_enabled: Boolean(profile?.restream_enabled),
      restream_ingest_url: profile?.restream_ingest_url ?? null,
      restream_stream_key: profile?.restream_stream_key ?? null,
      restream_embed_url: profile?.restream_embed_url ?? null,
      fish_voice_id: profile?.fish_voice_id ?? null,
    },
  })
}


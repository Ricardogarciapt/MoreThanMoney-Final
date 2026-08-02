import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { DVR_DEFAULT_DUB_LANGS, DVR_CAPTION_LANGS, isYoutubeConnectorEnabled } from "@/lib/lms-dvr/config"

const supabase = getSupabaseAdmin()

// Uma gravação por SALA (stream). O educador pode ter várias salas → lista de jobs.

async function authEducator() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  return token ? verifyEducatorToken(token) : null
}

const JOB_COLS =
  "id, stream_id, status, langs, base_file, multi_file, download_url, size_bytes, duration_s, error, subtitle_langs, subtitle_files, youtube_status, youtube_video_url, youtube_playlist_url, youtube_error, updated_at"

// GET — gravações do educador autenticado (uma por sala), com título da sala.
export async function GET() {
  const educator = await authEducator()
  if (!educator) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: jobs } = await supabase
    .from("lms_dvr_jobs")
    .select(`${JOB_COLS}, stream:lms_streams(id, title)`)
    .eq("educator_id", educator.educatorId)
    .order("updated_at", { ascending: false })

  return NextResponse.json(
    {
      jobs: jobs ?? [],
      dubLangs: DVR_DEFAULT_DUB_LANGS,
      captionLangs: DVR_CAPTION_LANGS,
      youtubeEnabled: isYoutubeConnectorEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

// POST — { action: 'prepare' | 'confirm_delete', streamId, langs?, subtitleLangs?, youtube? }
export async function POST(req: NextRequest) {
  const educator = await authEducator()
  if (!educator) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")
  const streamId = String(body?.streamId || "")

  // Alvo: sala específica; retro-compat: se não vier streamId usa a única do educador.
  let q = supabase.from("lms_dvr_jobs").select("id, status").eq("educator_id", educator.educatorId)
  if (streamId) q = q.eq("stream_id", streamId)
  const { data: job } = await q.maybeSingle()
  if (!job) return NextResponse.json({ error: "Sem gravação disponível para esta sala" }, { status: 404 })

  if (action === "prepare") {
    const norm = (arr: unknown) =>
      (Array.isArray(arr) ? arr : []).map((l) => String(l).toLowerCase().slice(0, 2)).filter(Boolean)
    const langs = body?.langs ? norm(body.langs) : [...DVR_DEFAULT_DUB_LANGS]
    const subtitleLangs = body?.subtitleLangs ? norm(body.subtitleLangs) : [...DVR_CAPTION_LANGS]
    const wantYoutube = Boolean(body?.youtube) && isYoutubeConnectorEnabled()
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({
        status: "pending",
        langs,
        subtitle_langs: subtitleLangs,
        youtube_status: wantYoutube ? "pending" : null,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "pending", langs, subtitleLangs, youtube: wantYoutube })
  }

  if (action === "confirm_delete") {
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({ status: "delete_requested", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "delete_requested" })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

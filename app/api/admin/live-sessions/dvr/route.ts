import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import {
  DVR_DEFAULT_DUB_LANGS,
  DVR_CAPTION_LANGS,
  dvrDownloadUrl,
  isYoutubeConnectorEnabled,
} from "@/lib/lms-dvr/config"

const supabase = getSupabaseAdmin()

const subtitleUrl = (streamId: string, lang: string, format: "vtt" | "srt") =>
  `/api/live-sessions/dvr/${streamId}/subtitles/${lang}.${format}`

// GET — TODAS as gravações DVR (uma por sala), agrupáveis por academia → educador → sala.
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from("lms_dvr_jobs")
    .select(
      `id, stream_id, educator_id, stream_key, status, langs, base_file, multi_file, download_url,
       size_bytes, duration_s, error, updated_at,
       subtitle_langs, subtitle_files, youtube_status, youtube_video_url, youtube_playlist_url, youtube_error,
       educator:lms_educators(display_name, academy_id),
       stream:lms_streams(id, title, academy_id, academy:lms_academies(name, slug),
         operador:lms_educators!lms_streams_operador_educator_id_fkey(display_name))`,
    )
    .order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const recordings = (data ?? []).map((j: any) => {
    const subLangs: string[] = j.subtitle_langs || []
    return {
      id: j.id,
      educatorId: j.educator_id,
      // Uma sala de gravação («Introdução») não tem formador de propósito, e sem isto a gravação
      // dela caía num grupo chamado «—», onde ninguém a procura. Quem a operou aparece, mas
      // ESCRITO COMO OPERADOR: o grupo dele como formador continua a ser outro, e o dono não
      // passa a constar como professor de uma sala que fez questão de não ter professor.
      educatorName:
        j.educator?.display_name || (j.stream?.operador?.display_name ? `${j.stream.operador.display_name} (operador)` : "—"),
      streamId: j.stream_id,
      streamTitle: j.stream?.title || "Sala",
      academyName: j.stream?.academy?.name || "Sem academia",
      academySlug: j.stream?.academy?.slug || "sem-academia",
      status: j.status,
      langs: j.langs || [],
      // Download do ORIGINAL (PT)
      baseUrl: j.base_file ? dvrDownloadUrl(j.base_file) : null,
      // Download MULTI-ÁUDIO (PT + dobragens) — quando montado
      multiUrl: j.download_url || (j.multi_file ? dvrDownloadUrl(j.multi_file) : null),
      // Legendas sidecar (sempre disponíveis se houver captions gravadas)
      subtitleLangs: subLangs,
      subtitles: subLangs.map((l) => ({
        lang: l,
        vtt: subtitleUrl(j.stream_id, l, "vtt"),
        srt: subtitleUrl(j.stream_id, l, "srt"),
      })),
      // YouTube (connector)
      youtubeStatus: j.youtube_status || null,
      youtubeVideoUrl: j.youtube_video_url || null,
      youtubePlaylistUrl: j.youtube_playlist_url || null,
      youtubeError: j.youtube_error || null,
      sizeBytes: j.size_bytes,
      durationS: j.duration_s,
      error: j.error,
      updatedAt: j.updated_at,
    }
  })

  return NextResponse.json(
    {
      recordings,
      dubLangs: DVR_DEFAULT_DUB_LANGS,
      captionLangs: DVR_CAPTION_LANGS,
      youtubeEnabled: isYoutubeConnectorEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

// POST — { action: 'prepare' | 'delete' | 'youtube', jobId, langs?, subtitleLangs?, youtube? }
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (authCheck) return authCheck

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")
  const jobId = String(body?.jobId || "")
  if (!jobId) return NextResponse.json({ error: "jobId em falta" }, { status: 400 })

  const norm = (arr: unknown, fallback: readonly string[]) =>
    (Array.isArray(arr) ? arr : [...fallback]).map((l) => String(l).toLowerCase().slice(0, 2)).filter(Boolean)

  if (action === "prepare") {
    const langs = norm(body?.langs, DVR_DEFAULT_DUB_LANGS)
    const subtitleLangs = norm(body?.subtitleLangs, DVR_CAPTION_LANGS)
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
      .eq("id", jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "pending", langs, subtitleLangs, youtube: wantYoutube })
  }

  // Enfileirar (ou reenfileirar) só o upload para o YouTube de uma gravação já montada.
  if (action === "youtube") {
    if (!isYoutubeConnectorEnabled()) {
      return NextResponse.json({ error: "Connector YouTube não configurado (faltam credenciais)." }, { status: 400 })
    }
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({ youtube_status: "pending", youtube_error: null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, youtubeStatus: "pending" })
  }

  if (action === "delete") {
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({ status: "delete_requested", updated_at: new Date().toISOString() })
      .eq("id", jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "delete_requested" })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

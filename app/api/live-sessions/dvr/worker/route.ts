import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { translateCaption } from "@/lib/lms-captions/translate"
import { synthesizeToStorage } from "@/lib/lms-captions/tts"
import { normalizeCaptionLang } from "@/lib/lms-captions/constants"
import { getDvrWorkerSecret } from "@/lib/lms-dvr/config"

export const runtime = "nodejs"
export const maxDuration = 60

const supabase = getSupabaseAdmin()

// Quantos clips TTS gerar por chamada (mantém cada request dentro do limite serverless).
const TTS_BATCH = 10

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://www.morethanmoney.pt")
}

function unauthorized(req: NextRequest): boolean {
  const secret = getDvrWorkerSecret()
  return !secret || req.headers.get("x-caption-secret") !== secret
}

// GET — o worker do VPS reclama o próximo job acionável.
//  • delete_requested → devolve os ficheiros a apagar (action:'delete').
//  • pending/assembling → gera TTS em lotes; quando tudo pronto devolve o manifesto (action:'assemble', ready:true).
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // 1) apagar tem prioridade (liberta espaço)
  const { data: del } = await supabase
    .from("lms_dvr_jobs")
    .select("id, stream_key, base_file, multi_file")
    .eq("status", "delete_requested")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (del) {
    await supabase.from("lms_dvr_jobs").update({ status: "deleting" }).eq("id", del.id)
    return NextResponse.json({
      action: "delete",
      jobId: del.id,
      files: [del.base_file, del.multi_file].filter(Boolean),
      streamKey: del.stream_key,
    })
  }

  // 2) upload para o YouTube de gravações já montadas (connector opcional)
  const { data: yt } = await supabase
    .from("lms_dvr_jobs")
    .select("id, stream_id, stream_key, base_file, multi_file, youtube_playlist_id")
    .eq("youtube_status", "pending")
    .eq("status", "ready")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (yt && (yt.multi_file || yt.base_file)) {
    await supabase.from("lms_dvr_jobs").update({ youtube_status: "uploading" }).eq("id", yt.id)
    const { data: s } = await supabase
      .from("lms_streams")
      .select("title, academy:lms_academies(name)")
      .eq("id", yt.stream_id)
      .maybeSingle()
    const title = (s?.title as string) || "Sessão MoreThanMoney"
    const academy = ((s?.academy as { name?: string } | null)?.name as string) || "MoreThanMoney"
    return NextResponse.json({
      action: "youtube",
      jobId: yt.id,
      file: yt.multi_file || yt.base_file, // prefere multi-áudio
      title: `${title} · ${academy}`,
      description: `Sessão MoreThanMoney (${academy}). Gravação com múltiplas faixas de áudio e legendas traduzidas.`,
      privacyStatus: "unlisted",
      playlistId: yt.youtube_playlist_id || null,
      playlistTitle: `${academy} · Rever aulas`,
    })
  }

  // 3) montagem multi-áudio + legendas
  const { data: job } = await supabase
    .from("lms_dvr_jobs")
    .select("id, stream_id, stream_key, base_file, langs, subtitle_langs, status")
    .in("status", ["pending", "assembling"])
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!job) return NextResponse.json({ action: "none" })

  if (job.status === "pending") {
    await supabase.from("lms_dvr_jobs").update({ status: "assembling" }).eq("id", job.id)
  }

  const targetLangs = (job.langs as string[]).map(normalizeCaptionLang).filter(Boolean)

  // voz do educador (default Ricardo tratado na lib)
  const { data: st } = await supabase
    .from("lms_streams")
    .select("caption_source_language, educator:lms_educators(fish_voice_id)")
    .eq("id", job.stream_id)
    .maybeSingle()
  const voiceId =
    ((st?.educator as { fish_voice_id?: string } | null)?.fish_voice_id || undefined) as string | undefined
  const srcLang = normalizeCaptionLang((st?.caption_source_language as string) || "pt")

  // todas as legendas finais com texto
  const { data: cuesRaw } = await supabase
    .from("lms_stream_captions")
    .select("seq, source_text, translations, audio, t_start_ms")
    .eq("stream_id", job.stream_id)
    .eq("is_final", true)
    .order("seq", { ascending: true })

  const cues = (cuesRaw ?? []).filter((c) => (c.source_text || "").trim())

  // gera em lote o que falta (tradução + TTS), persistindo na linha da legenda
  let generated = 0
  let missing = 0
  for (const lang of targetLangs) {
    if (lang === srcLang) continue
    for (const c of cues) {
      const tr = (c.translations || {}) as Record<string, string>
      const au = (c.audio || {}) as Record<string, string>
      if (au[lang]) continue // já tem áudio
      missing++
      if (generated >= TTS_BATCH) continue
      // tradução
      let text = tr[lang]
      if (!text) {
        const t = await translateCaption(c.source_text, srcLang, [lang])
        text = t[lang] || ""
        if (text) {
          tr[lang] = text
          await supabase.from("lms_stream_captions").update({ translations: tr }).eq("stream_id", job.stream_id).eq("seq", c.seq)
        }
      }
      if (!text) continue
      const url = await synthesizeToStorage(supabase, text, `${job.stream_id}/dvr-${c.seq}-${lang}.mp3`, voiceId)
      if (url) {
        au[lang] = url
        c.audio = au // reflete localmente p/ contagem
        await supabase.from("lms_stream_captions").update({ audio: au }).eq("stream_id", job.stream_id).eq("seq", c.seq)
        generated++
      }
    }
  }

  const stillMissing = missing - generated
  await supabase.from("lms_dvr_jobs").update({ updated_at: new Date().toISOString() }).eq("id", job.id)

  if (stillMissing > 0) {
    // ainda a preparar áudio — o worker volta a pedir
    return NextResponse.json({ action: "assemble", jobId: job.id, ready: false, remaining: stillMissing })
  }

  // manifesto completo: por idioma, clips ordenados com offset
  const manifest: Record<string, { start_ms: number; url: string }[]> = {}
  for (const lang of targetLangs) {
    if (lang === srcLang) continue
    manifest[lang] = cues
      .map((c) => ({ start_ms: c.t_start_ms ?? 0, url: ((c.audio || {}) as Record<string, string>)[lang] }))
      .filter((x) => x.url)
  }

  // Legendas a embutir (mov_text) + sidecar: URL do nosso endpoint que gera WebVTT/SRT.
  const subLangs = ((job.subtitle_langs as string[]) || []).map(normalizeCaptionLang).filter(Boolean)
  const base = siteUrl()
  const subtitles = subLangs.map((lang) => ({
    lang,
    vttUrl: `${base}/api/live-sessions/dvr/${job.stream_id}/subtitles/${lang}.vtt`,
  }))

  return NextResponse.json({
    action: "assemble",
    jobId: job.id,
    ready: true,
    streamKey: job.stream_key,
    baseFile: job.base_file,
    langs: targetLangs,
    sourceLang: srcLang,
    manifest,
    subtitleLangs: subLangs,
    subtitles,
  })
}

// POST — o worker reporta o resultado. Body: { jobId, result, ... }
export async function POST(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const jobId = String(b?.jobId || "")
  const result = String(b?.result || "")
  if (!jobId) return NextResponse.json({ error: "jobId em falta" }, { status: 400 })

  if (result === "assembled") {
    // Legendas sidecar: mapa lang → URL do nosso endpoint (WebVTT). Sempre disponíveis.
    const { data: jrow } = await supabase
      .from("lms_dvr_jobs")
      .select("stream_id, subtitle_langs")
      .eq("id", jobId)
      .maybeSingle()
    const subLangs: string[] = (jrow?.subtitle_langs as string[]) || []
    const subtitleFiles: Record<string, string> = {}
    for (const l of subLangs) {
      subtitleFiles[l] = `${siteUrl()}/api/live-sessions/dvr/${jrow?.stream_id}/subtitles/${l}.vtt`
    }
    await supabase
      .from("lms_dvr_jobs")
      .update({
        status: "ready",
        multi_file: b?.multi_file || null,
        download_url: b?.download_url || null,
        size_bytes: b?.size_bytes ?? null,
        duration_s: b?.duration_s ?? null,
        subtitle_files: subtitleFiles,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
    return NextResponse.json({ success: true })
  }

  // Connector YouTube: upload concluído → guarda ligações + alimenta a playlist "Rever aulas"
  if (result === "youtube_done") {
    const videoId = String(b?.video_id || "")
    const videoUrl = String(b?.video_url || (videoId ? `https://youtu.be/${videoId}` : ""))
    const playlistId = String(b?.playlist_id || "")
    const playlistUrl = String(b?.playlist_url || (playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : ""))
    await supabase
      .from("lms_dvr_jobs")
      .update({
        youtube_status: "done",
        youtube_video_id: videoId || null,
        youtube_video_url: videoUrl || null,
        youtube_playlist_id: playlistId || null,
        youtube_playlist_url: playlistUrl || null,
        youtube_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
    // Liga a playlist ao stream para o viewer "Rever aulas" a mostrar automaticamente.
    if (playlistUrl) {
      const { data: jr } = await supabase.from("lms_dvr_jobs").select("stream_id").eq("id", jobId).maybeSingle()
      if (jr?.stream_id) {
        const { data: sExisting } = await supabase
          .from("lms_streams")
          .select("playlist_url")
          .eq("id", jr.stream_id)
          .maybeSingle()
        const patch: Record<string, unknown> = { playlist_url: playlistUrl }
        if (!(sExisting?.playlist_url)) patch.playlist_title = "Rever aulas"
        await supabase.from("lms_streams").update(patch).eq("id", jr.stream_id)
      }
    }
    return NextResponse.json({ success: true })
  }

  if (result === "youtube_error") {
    await supabase
      .from("lms_dvr_jobs")
      .update({ youtube_status: "error", youtube_error: String(b?.error || "erro").slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", jobId)
    return NextResponse.json({ success: true })
  }

  if (result === "deleted") {
    // gravação removida do VPS → remove a linha (educador pode gravar de novo)
    await supabase.from("lms_dvr_jobs").delete().eq("id", jobId)
    return NextResponse.json({ success: true })
  }

  if (result === "error") {
    await supabase
      .from("lms_dvr_jobs")
      .update({ status: "error", error: String(b?.error || "erro").slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", jobId)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "result inválido" }, { status: 400 })
}

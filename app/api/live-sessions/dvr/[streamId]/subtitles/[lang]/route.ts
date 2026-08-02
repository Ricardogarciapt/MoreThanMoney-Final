import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { toWebVTT, toSRT, type CaptionCue } from "@/lib/lms-captions/subtitles"

const supabase = getSupabaseAdmin()

export const dynamic = "force-dynamic"

// GET /api/live-sessions/dvr/:streamId/subtitles/:lang(.vtt|.srt)?format=srt
// Devolve as legendas da sala num idioma como WebVTT (default) ou SRT.
// Servido como as gravações (URLs públicas via nginx): as legendas já são transmitidas
// ao vivo a todos os espectadores, logo não são mais sensíveis que o próprio vídeo.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string; lang: string }> },
) {
  const { streamId, lang: langRaw } = await params
  const url = new URL(req.url)

  // .srt/.vtt no path ou ?format=
  let lang = langRaw
  let format = (url.searchParams.get("format") || "").toLowerCase()
  const m = langRaw.match(/^([a-z]{2})\.(vtt|srt)$/i)
  if (m) {
    lang = m[1]
    format = m[2].toLowerCase()
  }
  lang = lang.toLowerCase().slice(0, 2)
  if (format !== "srt") format = "vtt"

  const { data: cues } = await supabase
    .from("lms_stream_captions")
    .select("seq, t_start_ms, t_end_ms, source_language, source_text, translations")
    .eq("stream_id", streamId)
    .order("t_start_ms", { ascending: true })

  const rows = (cues ?? []) as CaptionCue[]
  const bodyText = format === "srt" ? toSRT(rows, lang) : toWebVTT(rows, lang)
  const contentType = format === "srt" ? "application/x-subrip" : "text/vtt"

  return new NextResponse(bodyText, {
    status: 200,
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="legendas-${lang}.${format}"`,
      "Cache-Control": "no-store",
    },
  })
}

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

// SRS http_hook `on_dvr`: chamado quando o SRS fecha um ficheiro de gravação (DVR).
// Mapeia a stream (key) → educador e regista que existe UMA gravação base para ele.
// Autenticado por ?secret= == RTMP_RELAY_SECRET (o mesmo do forward). SRS espera "0" em texto.

const supabase = getSupabaseAdmin()

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const secret = process.env.RTMP_RELAY_SECRET
    if (!secret || url.searchParams.get("secret") !== secret) {
      return new NextResponse("1", { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    // SRS envia: { action:"on_dvr", app, stream, file, ... }
    const streamKey = String(body?.stream || "").trim()
    const filePath = String(body?.file || "").trim()
    if (!streamKey) return new NextResponse("0", { status: 200 })

    const baseFile = filePath.split("/").pop() || `${streamKey}.mp4`

    // stream + educador a partir da key
    const { data: st } = await supabase
      .from("lms_streams")
      .select("id, educator_id")
      .eq("stream_key", streamKey)
      .maybeSingle()

    if (!st?.id) return new NextResponse("0", { status: 200 }) // key desconhecida — ignora

    // Uma gravação por educador: upsert por educator_id (substitui a anterior).
    // Reinicia o ciclo — a nova gravação fica "recorded" e sem multi-áudio.
    await supabase
      .from("lms_dvr_jobs")
      .upsert(
        {
          stream_id: st.id,
          educator_id: st.educator_id,
          stream_key: streamKey,
          base_file: baseFile,
          status: "recorded",
          langs: [],
          multi_file: null,
          download_url: null,
          size_bytes: null,
          duration_s: null,
          error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "educator_id" },
      )

    return new NextResponse("0", { status: 200 })
  } catch {
    // Nunca bloquear o SRS: responde 0 mesmo em erro.
    return new NextResponse("0", { status: 200 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import {
  DVR_DEFAULT_DUB_LANGS,
  DVR_CAPTION_LANGS,
  isYoutubeConnectorEnabled,
  isDvrAutoProcessEnabled,
} from "@/lib/lms-dvr/config"

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

    // stream + educador a partir da key. NOTA: várias salas do mesmo educador podem
    // partilhar o stream_key → NÃO usar maybeSingle (falha com >1).
    //
    // A ordem de desempate importa e custou uma gravação no sítio errado a descobrir:
    //  1. AO VIVO — se uma sala está no ar, foi ela que produziu o ficheiro, ponto.
    //  2. A GRAVAR — as salas de gravação («Introdução») nunca ficam ao vivo, por isso
    //     nunca ganhavam o critério 1 e a gravação era atribuída a outra sala do mesmo
    //     educador, indo parar à playlist do curso errado. `gravacao_iniciada_em` só
    //     está preenchido enquanto o dono carregou em «Iniciar transmissão».
    //  3. A mais recentemente atualizada — o que restava antes, agora só como recurso.
    const { data: sts } = await supabase
      .from("lms_streams")
      .select("id, educator_id, is_live, gravacao_iniciada_em, updated_at")
      .eq("stream_key", streamKey)
      .order("is_live", { ascending: false })
      .order("gravacao_iniciada_em", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
    const st = sts?.[0]

    if (!st?.id) return new NextResponse("0", { status: 200 }) // key desconhecida — ignora

    // Uma gravação por SALA (stream): upsert por stream_id (substitui a anterior).
    // Processamento automático (default): monta logo multi-áudio + legendas e, se o
    // connector estiver ligado, faz upload p/ YouTube. Manual se DVR_AUTOPROCESS=0.
    const auto = isDvrAutoProcessEnabled()
    await supabase
      .from("lms_dvr_jobs")
      .upsert(
        {
          stream_id: st.id,
          educator_id: st.educator_id,
          stream_key: streamKey,
          base_file: baseFile,
          status: auto ? "pending" : "recorded",
          // GRAVAÇÃO SEM DOBRAGEM (decisão Ricardo 2026-08-18): o DVR guarda só o ORIGINAL + CC.
          // A dobragem existe apenas na sessão AO VIVO. Mantemos o campo por retrocompatibilidade
          // do worker (lista vazia = nenhuma faixa de áudio extra a montar).
          langs: [],
          multi_file: null,
          download_url: null,
          size_bytes: null,
          duration_s: null,
          error: null,
          subtitle_langs: auto ? [...DVR_CAPTION_LANGS] : [],
          subtitle_files: {},
          youtube_status: auto && isYoutubeConnectorEnabled() ? "pending" : null,
          youtube_video_id: null,
          youtube_video_url: null,
          youtube_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "stream_id" },
      )

    return new NextResponse("0", { status: 200 })
  } catch {
    // Nunca bloquear o SRS: responde 0 mesmo em erro.
    return new NextResponse("0", { status: 200 })
  }
}

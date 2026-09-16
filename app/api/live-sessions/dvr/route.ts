import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { DVR_DEFAULT_DUB_LANGS, DVR_CAPTION_LANGS, isYoutubeConnectorEnabled } from "@/lib/lms-dvr/config"
import { idsDasSalasQueOpera, podeOperarSala } from "@/lib/lms-sala-introducao"

const supabase = getSupabaseAdmin()

// Uma gravação por SALA (stream). O educador pode ter várias salas → lista de jobs.
//
// O PAINEL SEGUE A SALA, NÃO O EDUCADOR.
//
// Isto filtrava por `lms_dvr_jobs.educator_id`, que o `on_dvr` copia da sala. Numa sala de
// gravação sem formador — a «Introdução» — esse campo é null de propósito, e o painel ficava
// vazio: o dono gravava, o vídeo subia ao YouTube, e não via a gravação em lado nenhum. As acções
// (preparar, YouTube, apagar) davam 404 pela mesma razão.
//
// A correcção é a mesma separação da migração 101: `educator_id` continua a ser QUEM APARECE, e a
// pergunta passa a ser QUEM OPERA a sala. Pôr o operador dentro de `lms_dvr_jobs.educator_id` era
// mais curto, mas esse campo é lido em /admin para dizer de quem é a gravação — o dono apareceria
// listado como formador de uma sala que fez questão de não ter formador nenhum.

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

  // As salas dele: as que educa e as que apenas opera (ver `idsDasSalasQueOpera`).
  const streamIds = await idsDasSalasQueOpera(educator.educatorId)

  // Sem salas não se pergunta nada — um `.in(…, [])` é um pedido inútil à base.
  const { data: jobs } = streamIds.length
    ? await supabase
        .from("lms_dvr_jobs")
        .select(`${JOB_COLS}, stream:lms_streams(id, title)`)
        .in("stream_id", streamIds)
        .order("updated_at", { ascending: false })
    : { data: [] }

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
  //
  // AUTORIZA PRIMEIRO, ESCREVE DEPOIS — a mesma ordem da rota da presença. A permissão é decidida
  // aqui, em TypeScript, e só então a query fica presa ao `stream_id` já autorizado. A alternativa
  // (arrastar a identidade de quem age para dentro dos filtros da escrita) é como se perde o
  // controlo de a quem uma linha pertence.
  if (streamId) {
    const { data: sala } = await supabase
      .from("lms_streams")
      .select("id, educator_id, operador_educator_id")
      .eq("id", streamId)
      .maybeSingle()
    if (!podeOperarSala(sala, educator.educatorId)) {
      return NextResponse.json({ error: "Esta sala não é tua" }, { status: 403 })
    }
  }

  const streamIds = streamId ? [streamId] : await idsDasSalasQueOpera(educator.educatorId)
  if (!streamIds.length) {
    return NextResponse.json({ error: "Sem gravação disponível para esta sala" }, { status: 404 })
  }

  const { data: job } = await supabase
    .from("lms_dvr_jobs")
    .select("id, status")
    .in("stream_id", streamIds)
    .maybeSingle()
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

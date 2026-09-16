import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { resolveViewerPlayback } from "@/lib/lms-playback"

const supabase = getSupabaseAdmin()

/** Sem chaves de ingestão nem YouTube — só para listagens públicas / alunos. */
const STREAM_SELECT_PUBLIC = `
  id,
  title,
  description,
  thumbnail_url,
  square_image_url,
  playlist_url,
  playlist_title,
  playlist_access_tier,
  is_live,
  educator_id,
  academy_id,
  playback_url,
  playback_mode,
  ingest_provider,
  stream_key,
  youtube_key,
  chat_enabled,
  youtube_enabled,
  live_started_at,
  live_ended_at,
  created_at,
  updated_at,
  category,
  scheduled_start_at,
  viewer_count,
  access_tier,
  nunca_ao_vivo,
  academy:lms_academies(id, slug, name),
  educator:lms_educators(id, display_name, bio, avatar_url, is_active, specialty, restream_enabled, restream_embed_url)
`

const STREAM_SELECT_EDUCATOR = `
  *,
  academy:lms_academies(id, slug, name),
  educator:lms_educators(id, display_name, bio, avatar_url, is_active, specialty)
`

function sanitizePublicRow(row: Record<string, unknown>) {
  const copy: Record<string, unknown> = { ...row }
  delete copy.stream_key
  delete copy.youtube_key

  if (copy.educator && typeof copy.educator === "object") {
    const edu = { ...(copy.educator as Record<string, unknown>) }
    delete edu.restream_embed_url
    copy.educator = edu
  }
  return copy
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const academyId = searchParams.get("academyId")
    const educatorId = searchParams.get("educatorId")
    const onlyLive = searchParams.get("live") === "true"

    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const authEducator = token ? verifyEducatorToken(token) : null
    // O `.or(...)` abaixo interpola este valor num filtro em texto. Ele vem do nosso próprio token
    // assinado, mas a forma confirma-se na mesma: uma vírgula aqui mudava o significado do filtro.
    const ehUuid = (v: string | null) => Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    const canSeeSecrets = Boolean(
      educatorId && ehUuid(educatorId) && authEducator && authEducator.educatorId === educatorId
    )

    const selectColumns = canSeeSecrets ? STREAM_SELECT_EDUCATOR : STREAM_SELECT_PUBLIC

    let query = supabase
      .from("lms_streams")
      .select(selectColumns)
      .order("is_live", { ascending: false })
      .order("updated_at", { ascending: false })

    if (academyId) query = query.eq("academy_id", academyId)
    if (educatorId) {
      // QUEM OPERA ≠ QUEM APARECE. Uma sala sem educador (a «Introdução») tem de chegar ao studio
      // de quem a opera, senão ele não tem onde carregar em «Iniciar transmissão». Mas só na vista
      // AUTENTICADA: na página pública do educador ela continua a não ser dele — o dono pediu a
      // sala sem formador, e operar não é aparecer.
      query = canSeeSecrets
        ? query.or(`educator_id.eq.${educatorId},operador_educator_id.eq.${educatorId}`)
        : query.eq("educator_id", educatorId)
    }
    // Uma sala de gravação («Introdução») nunca entra numa lista de «ao vivo». A trava a sério
    // está na escrita — a base de dados nunca guarda is_live=true para estas salas — mas isto
    // custa nada e protege de linhas antigas ou de uma escrita feita à mão na consola.
    if (onlyLive) query = query.eq("is_live", true).eq("nunca_ao_vivo", false)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data || []
    const mapped = rows.map((row: Record<string, unknown>) => {
      const resolved = resolveViewerPlayback({
        playback_url: row.playback_url as string | null,
        playback_mode: row.playback_mode as string | null,
        ingest_provider: row.ingest_provider as string | null,
        stream_key: row.stream_key as string | null,
        is_live: row.is_live as boolean | null,
        youtube_enabled: row.youtube_enabled as boolean | null,
        youtube_key: row.youtube_key as string | null,
        educator: row.educator as any,
      })
      return {
        ...row,
        // Mesma razão da linha acima: se alguma vez uma destas salas aparecer com is_live=true,
        // o site não a mostra acesa.
        is_live: row.nunca_ao_vivo ? false : (row.is_live as boolean),
        playback_url: resolved.playback_url,
        hls_manifest_url: resolved.hls_manifest_url,
      }
    })

    const safeMapped = canSeeSecrets ? mapped : mapped.map(sanitizePublicRow)
    return NextResponse.json({ success: true, data: safeMapped })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


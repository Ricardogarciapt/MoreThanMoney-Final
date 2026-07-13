import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { normalizeLmsCategory } from "@/lib/lms-categories"
import { DEFAULT_RESTREAM_INGEST_URL, normalizeRestreamIngestUrl } from "@/lib/lms-restream"
import { normalizeIngestProvider, normalizePlaybackMode } from "@/lib/lms-stream-options"

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null
    if (!educator) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const title = String(body.title || "").trim()

    if (!title) {
      return NextResponse.json({ error: "title é obrigatório" }, { status: 400 })
    }

    const { data: row, error: eduErr } = await supabase
      .from("lms_educators")
      .select("academy_id, stream_key_fixed, restream_enabled, restream_ingest_url, restream_stream_key")
      .eq("id", educator.educatorId)
      .single()

    if (eduErr || !row) {
      return NextResponse.json({ error: "Educador não encontrado" }, { status: 404 })
    }

    // Só a academia atribuída no admin — educadores não podem associar-se a canais de outros.
    const academyId = row.academy_id
    if (!academyId) {
      return NextResponse.json(
        {
          error:
            "A tua conta ainda não tem academia definida. Contacta o administrador (Admin → Educação / LMS) para te associarem a uma academia antes de criares canais.",
        },
        { status: 400 }
      )
    }

    const description = String(body.description || "").trim() || null
    const thumbnail_url = String(body.thumbnail_url || "").trim() || null
    const square_image_url = String(body.square_image_url || "").trim() || null
    const playlist_url = String(body.playlist_url || "").trim() || null
    const playlist_access_tier = ["all", "app_member", "premium"].includes(body.playlist_access_tier)
      ? body.playlist_access_tier
      : null
    const access_tier = ["all", "app_member", "premium"].includes(body.access_tier) ? body.access_tier : "all"
    const category = normalizeLmsCategory(String(body.category || "").trim()) || null
    const scheduled_start_at = body.scheduled_start_at ? String(body.scheduled_start_at) : null

    const restreamBase =
      normalizeRestreamIngestUrl((row as any).restream_ingest_url || null) || DEFAULT_RESTREAM_INGEST_URL
    const restreamKey = (row as any).restream_stream_key || null
    const restreamEnabled = Boolean((row as any).restream_enabled)
    const shouldUseRestream = Boolean(restreamEnabled && restreamKey)
    const ingestProvider = normalizeIngestProvider(
      body.ingest_provider ?? (shouldUseRestream ? "restream" : "mtm_direct")
    )
    const playbackMode = normalizePlaybackMode(body.playback_mode)
    const effectiveUseRestream = ingestProvider === "restream" && shouldUseRestream

    if (ingestProvider === "restream" && !effectiveUseRestream) {
      return NextResponse.json(
        {
          error:
            "Ingest Restream selecionado, mas faltam configurações do Restream (ativar Restream + stream key). Atualiza no cartão Restream do Studio ou muda ingest para MTM direto.",
        },
        { status: 400 }
      )
    }

    const { data: inserted, error: insErr } = await supabase
      .from("lms_streams")
      .insert({
        academy_id: academyId,
        educator_id: educator.educatorId,
        title,
        description,
        thumbnail_url,
        square_image_url,
        playlist_url,
        playlist_access_tier,
        access_tier,
        category,
        rtmps_url: effectiveUseRestream ? restreamBase : DEFAULT_RESTREAM_INGEST_URL,
        stream_key: effectiveUseRestream ? restreamKey : restreamEnabled ? null : row.stream_key_fixed || null,
        ingest_provider: ingestProvider,
        playback_mode: playbackMode,
        chat_enabled: body.chat_enabled !== false,
        is_live: false,
        scheduled_start_at,
      })
      .select("*")
      .single()

    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message || "Erro ao criar canal" }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: inserted })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const edu = token ? verifyEducatorToken(token) : null
    if (!edu) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const streamId = String(body.streamId || "")
    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (body.description !== undefined) updates.description = String(body.description || "").trim() || null
    if (body.thumbnail_url !== undefined) updates.thumbnail_url = String(body.thumbnail_url || "").trim() || null
    if (body.square_image_url !== undefined) updates.square_image_url = String(body.square_image_url || "").trim() || null
    if (body.playlist_url !== undefined) updates.playlist_url = String(body.playlist_url || "").trim() || null
    if (body.playlist_access_tier !== undefined)
      updates.playlist_access_tier = ["all", "app_member", "premium"].includes(body.playlist_access_tier)
        ? body.playlist_access_tier
        : null
    if (body.access_tier !== undefined)
      updates.access_tier = ["all", "app_member", "premium"].includes(body.access_tier) ? body.access_tier : "all"
    if (body.category !== undefined) updates.category = normalizeLmsCategory(String(body.category || "").trim())
    if (body.title !== undefined) {
      const t = String(body.title || "").trim()
      if (!t) return NextResponse.json({ error: "title não pode ser vazio" }, { status: 400 })
      updates.title = t
    }
    if (body.scheduled_start_at !== undefined) {
      const v = body.scheduled_start_at
      updates.scheduled_start_at = v === null || v === "" ? null : String(v)
    }
    if (body.restream_embed_url !== undefined) {
      updates.restream_embed_url = String(body.restream_embed_url || "").trim() || null
    }
    if (body.playback_url !== undefined) {
      updates.playback_url = String(body.playback_url || "").trim() || null
    }
    if (body.playback_mode !== undefined) {
      updates.playback_mode = normalizePlaybackMode(body.playback_mode)
    }
    if (body.ingest_provider !== undefined) {
      updates.ingest_provider = normalizeIngestProvider(body.ingest_provider)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("lms_streams")
      .update(updates)
      .eq("id", streamId)
      .eq("educator_id", edu.educatorId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: "Canal não encontrado ou não pertence a esta conta" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null
    if (!educator) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const streamId = String(body.streamId || "")
    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    const { error } = await supabase.from("lms_streams").delete().eq("id", streamId).eq("educator_id", educator.educatorId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

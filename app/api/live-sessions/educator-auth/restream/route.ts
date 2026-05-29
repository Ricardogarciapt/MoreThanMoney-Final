import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { DEFAULT_RESTREAM_INGEST_URL, normalizeRestreamIngestUrl } from "@/lib/lms-restream"

const supabase = getSupabaseAdmin()

/**
 * O educador atualiza os dados Restream do próprio perfil (ingest + chave + embed).
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const edu = token ? verifyEducatorToken(token) : null
    if (!edu) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    // Suportar colagem do "link combinado":
    // - ingest: "rtmps://live.restream.io:1937/live" + key separado (re_...)
    // - ou ingest: "rtmps://.../live re_..." com a key embutida.
    const parseRestreamInputs = () => {
      const ingestRaw = body.restream_ingest_url !== undefined ? String(body.restream_ingest_url || "").trim() : ""
      let keyRaw = body.restream_stream_key !== undefined ? String(body.restream_stream_key || "").trim() : ""

      // Extrair key se estiver embutida no ingestRaw
      if (!keyRaw && ingestRaw) {
        // Caso 1: "rtmps://.../live/re_XXXX"
        const m = ingestRaw.match(/\/live\/(re_[A-Za-z0-9_-]+)/)
        if (m?.[1]) keyRaw = m[1]

        // Caso 2: "rtmps://.../live re_XXXX" (separado por whitespace)
        if (!keyRaw) {
          const parts = ingestRaw.split(/\s+/).map((p) => p.trim()).filter(Boolean)
          const candidate = parts.find((p) => /^re_[A-Za-z0-9_-]+$/.test(p))
          if (candidate) keyRaw = candidate
        }
      }

      // Normalizar ingest base (sem key) se vier combinado
      let ingestBase = ingestRaw
      if (ingestBase) {
        // Remover "/live/<key>" caso venha no mesmo campo
        ingestBase = ingestBase.replace(/\/live\/[A-Za-z0-9_-]+.*$/i, "/live")
        ingestBase = ingestBase.replace(/\/+$/, "")
      }

      const ingestNormalized = ingestBase
        ? normalizeRestreamIngestUrl(ingestBase)
        : DEFAULT_RESTREAM_INGEST_URL

      const keyNormalized = keyRaw ? keyRaw : null
      return { ingestNormalized, keyNormalized }
    }

    if (body.restream_embed_url !== undefined) {
      updates.restream_embed_url = String(body.restream_embed_url || "").trim() || null
    }
    if (body.restream_enabled !== undefined) {
      updates.restream_enabled = Boolean(body.restream_enabled)
    } else if (updates.restream_embed_url) {
      // URL de embed nova sem toggling explícito → activar (default BD era false)
      updates.restream_enabled = true
    }

    const shouldUpdateRestreamConnection =
      body.restream_ingest_url !== undefined || body.restream_stream_key !== undefined
    if (shouldUpdateRestreamConnection) {
      const { ingestNormalized, keyNormalized } = parseRestreamInputs()

      if (keyNormalized && keyNormalized.length > 512) {
        return NextResponse.json({ error: "Chave Restream demasiado longa (máx. 512 caracteres)" }, { status: 400 })
      }

      updates.restream_ingest_url = ingestNormalized || null
      updates.restream_stream_key = keyNormalized

      // Se o user meteu key/ingest mas não mexeu no toggle, assumir activo para permitir iniciar live.
      if (body.restream_enabled === undefined && keyNormalized) {
        updates.restream_enabled = true
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("lms_educators")
      .update(updates)
      .eq("id", edu.educatorId)
      .select(
        "id, restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url, updated_at"
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Atualizar os canais do educador para que o StreamKeyCard e o start/pause usem a key mais recente.
    if (data?.restream_stream_key || data?.restream_ingest_url) {
      const restreamIngest = normalizeRestreamIngestUrl(data.restream_ingest_url as string | null) || DEFAULT_RESTREAM_INGEST_URL
      await supabase
        .from("lms_streams")
        .update({
          rtmps_url: restreamIngest,
          stream_key: data.restream_stream_key as string | null,
        })
        .eq("educator_id", edu.educatorId)
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const edu = token ? verifyEducatorToken(token) : null
    if (!edu) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("lms_educators")
      .select(
        "restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url"
      )
      .eq("id", edu.educatorId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Não encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        restream_ingest_url: normalizeRestreamIngestUrl(data.restream_ingest_url as string | null),
        default_ingest_url: DEFAULT_RESTREAM_INGEST_URL,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

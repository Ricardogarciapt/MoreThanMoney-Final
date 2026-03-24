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

    if (body.restream_enabled !== undefined) {
      updates.restream_enabled = Boolean(body.restream_enabled)
    }
    if (body.restream_ingest_url !== undefined) {
      const u = String(body.restream_ingest_url || "").trim()
      updates.restream_ingest_url = u || null
    }
    if (body.restream_stream_key !== undefined) {
      updates.restream_stream_key = String(body.restream_stream_key || "").trim() || null
    }
    if (body.restream_embed_url !== undefined) {
      updates.restream_embed_url = String(body.restream_embed_url || "").trim() || null
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

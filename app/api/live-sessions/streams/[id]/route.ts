import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin, verifyAdminAccess } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { resolveViewerPlayback } from "@/lib/lms-playback"

const supabase = getSupabaseAdmin()

const EDUCATOR_SELECT_PUBLIC =
  "id, display_name, bio, avatar_url, is_active, specialty, restream_enabled, restream_embed_url"

const EDUCATOR_SELECT_FULL =
  "id, display_name, bio, avatar_url, is_active, specialty, restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url"

function stripIngestSecrets(data: Record<string, unknown>) {
  const copy = { ...data }
  delete copy.stream_key
  delete copy.rtmps_url
  delete copy.youtube_key
  return copy
}

function sanitizeEducatorPublic(edu: unknown) {
  if (!edu || typeof edu !== "object") return edu
  const e = { ...(edu as Record<string, unknown>) }
  delete e.restream_stream_key
  delete e.restream_ingest_url
  delete e.restream_embed_url
  return e
}

function applyPlaybackForClient(
  row: Record<string, unknown>,
  options: { publicViewer: boolean }
) {
  const resolved = resolveViewerPlayback({
    playback_url: row.playback_url as string | null,
    restream_embed_url: row.restream_embed_url as string | null,
    stream_key: row.stream_key as string | null,
    educator: row.educator as { restream_enabled?: boolean; restream_embed_url?: string | null } | null,
  })

  if (options.publicViewer) {
    const base = stripIngestSecrets(row)
    delete base.restream_embed_url
    return {
      ...base,
      educator: sanitizeEducatorPublic(base.educator),
      playback_url: resolved.playback_url,
      hls_manifest_url: resolved.hls_manifest_url,
    }
  }

  return {
    ...row,
    playback_url: resolved.playback_url,
    hls_manifest_url: resolved.hls_manifest_url,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: row, error } = await supabase
      .from("lms_streams")
      .select(
        `
        *,
        academy:lms_academies(id, slug, name),
        educator:lms_educators(${EDUCATOR_SELECT_FULL})
      `
      )
      .eq("id", id)
      .single()

    if (error || !row) {
      return NextResponse.json({ error: error?.message || "Não encontrado" }, { status: 404 })
    }

    const cookieStore = await cookies()
    const educatorToken = cookieStore.get(getEducatorCookieName())?.value
    const educator = educatorToken ? verifyEducatorToken(educatorToken) : null
    const isOwner = Boolean(educator && educator.educatorId === row.educator_id)
    const adminAuth = await verifyAdminAccess()
    const isAdmin = Boolean(adminAuth.isAdmin)

    if (isOwner || isAdmin) {
      return NextResponse.json({
        success: true,
        data: applyPlaybackForClient(row as Record<string, unknown>, { publicViewer: false }),
      })
    }

    const rowPublic = {
      ...(row as Record<string, unknown>),
      educator: (row as any).educator
        ? { ...(row as any).educator, restream_stream_key: undefined, restream_ingest_url: undefined }
        : null,
    }

    return NextResponse.json({
      success: true,
      data: applyPlaybackForClient(rowPublic, { publicViewer: true }),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

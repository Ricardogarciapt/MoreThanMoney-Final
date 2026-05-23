import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { syncLmsStreamViewerCount } from "@/lib/lms-sync-viewer-count"

const supabase = getSupabaseAdmin()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await params
    const body = await request.json().catch(() => ({}))
    const viewerKey = String(body.viewerKey || "").trim().slice(0, 128)
    const action = String(body.action || "ping").trim()

    if (!streamId || !viewerKey) {
      return NextResponse.json({ error: "streamId e viewerKey são obrigatórios" }, { status: 400 })
    }

    const { data: stream, error: streamError } = await supabase
      .from("lms_streams")
      .select("id, is_live, viewer_count")
      .eq("id", streamId)
      .single()

    if (streamError || !stream) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 })
    }

    try {
      if (action === "leave") {
        await supabase.from("lms_stream_viewers").delete().eq("stream_id", streamId).eq("viewer_key", viewerKey)
      } else {
        await supabase.from("lms_stream_viewers").upsert(
          {
            stream_id: streamId,
            viewer_key: viewerKey,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "stream_id,viewer_key" }
        )
      }
    } catch (presenceErr) {
      console.warn("[LMS viewers] Presença indisponível (aplica migration 021):", presenceErr)
      return NextResponse.json({
        success: true,
        viewer_count: stream.viewer_count ?? 0,
        is_live: stream.is_live,
      })
    }

    let viewerCount = stream.viewer_count ?? 0
    try {
      viewerCount = await syncLmsStreamViewerCount(supabase, streamId)
    } catch {
      // tabela ainda não migrada
    }

    return NextResponse.json({
      success: true,
      viewer_count: viewerCount,
      is_live: stream.is_live,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

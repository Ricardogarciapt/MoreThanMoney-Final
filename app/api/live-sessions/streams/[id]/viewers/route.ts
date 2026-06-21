import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { syncLmsStreamViewerCount } from "@/lib/lms-sync-viewer-count"
import { awardXp } from "@/lib/xp-service"

const supabase = getSupabaseAdmin()

async function resolveAuthUserId(request: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const {
      data: { session },
    } = await supabaseAuth.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await params
    const { data: stream, error } = await supabase
      .from("lms_streams")
      .select("id, is_live, viewer_count")
      .eq("id", streamId)
      .single()

    if (error || !stream) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 })
    }

    let viewerCount = stream.viewer_count ?? 0
    try {
      viewerCount = await syncLmsStreamViewerCount(supabase, streamId)
    } catch {
      /* migration pendente */
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

    let xp = null
    const userId = await resolveAuthUserId(request)
    if (userId && action === "ping" && stream.is_live) {
      const xpResult = await awardXp(supabase, userId, "live_session_watch", {
        actionDescription: `Live · ${streamId}`,
        cooldownMinutes: 15,
      })
      xp = { ...xpResult, action_type: "live_session_watch" }
    }

    return NextResponse.json({
      success: true,
      viewer_count: viewerCount,
      is_live: stream.is_live,
      xp,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

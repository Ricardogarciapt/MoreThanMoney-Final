import type { SupabaseClient } from "@supabase/supabase-js"
import { LMS_VIEWER_ACTIVE_SECONDS } from "@/lib/lms-viewer-presence"

export async function syncLmsStreamViewerCount(
  supabase: SupabaseClient,
  streamId: string
): Promise<number> {
  const cutoff = new Date(Date.now() - LMS_VIEWER_ACTIVE_SECONDS * 1000).toISOString()

  const { count, error: countError } = await supabase
    .from("lms_stream_viewers")
    .select("*", { count: "exact", head: true })
    .eq("stream_id", streamId)
    .gte("last_seen_at", cutoff)

  if (countError) {
    console.warn("[LMS] Falha a contar espectadores:", countError.message)
    return 0
  }

  const active = count ?? 0

  await supabase.from("lms_streams").update({ viewer_count: active }).eq("id", streamId)

  return active
}

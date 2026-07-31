import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { DVR_DEFAULT_DUB_LANGS, dvrDownloadUrl } from "@/lib/lms-dvr/config"

const supabase = getSupabaseAdmin()

// GET — lista TODAS as gravações DVR (todos os educadores), com links de download.
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from("lms_dvr_jobs")
    .select(
      "id, stream_id, educator_id, stream_key, status, langs, base_file, multi_file, download_url, size_bytes, duration_s, error, updated_at, educator:lms_educators(display_name)",
    )
    .order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const recordings = (data ?? []).map((j: any) => ({
    id: j.id,
    educator_id: j.educator_id,
    educatorName: j.educator?.display_name || "—",
    streamId: j.stream_id,
    status: j.status,
    langs: j.langs || [],
    // Download do ORIGINAL (PT) — sempre disponível se houver ficheiro base
    baseUrl: j.base_file ? dvrDownloadUrl(j.base_file) : null,
    // Download MULTI-ÁUDIO (PT + dobragens) — quando montado
    multiUrl: j.download_url || (j.multi_file ? dvrDownloadUrl(j.multi_file) : null),
    sizeBytes: j.size_bytes,
    durationS: j.duration_s,
    error: j.error,
    updatedAt: j.updated_at,
  }))

  return NextResponse.json({ recordings, dubLangs: DVR_DEFAULT_DUB_LANGS }, { headers: { "Cache-Control": "no-store" } })
}

// POST — { action: 'prepare' | 'delete', jobId, langs? }
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (authCheck) return authCheck

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")
  const jobId = String(body?.jobId || "")
  if (!jobId) return NextResponse.json({ error: "jobId em falta" }, { status: 400 })

  if (action === "prepare") {
    const requested: string[] = Array.isArray(body?.langs) ? body.langs : [...DVR_DEFAULT_DUB_LANGS]
    const langs = requested.map((l) => String(l).toLowerCase().slice(0, 2)).filter(Boolean)
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({ status: "pending", langs, error: null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "pending" })
  }

  if (action === "delete") {
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({ status: "delete_requested", updated_at: new Date().toISOString() })
      .eq("id", jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "delete_requested" })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { DVR_DEFAULT_DUB_LANGS } from "@/lib/lms-dvr/config"

const supabase = getSupabaseAdmin()

// Uma gravação por educador → um job. Rotas ao nível do educador (sem streamId).

async function authEducator() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  return token ? verifyEducatorToken(token) : null
}

// GET — estado da gravação do educador autenticado.
export async function GET() {
  const educator = await authEducator()
  if (!educator) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: job } = await supabase
    .from("lms_dvr_jobs")
    .select("stream_id, status, langs, base_file, multi_file, download_url, size_bytes, duration_s, error, updated_at")
    .eq("educator_id", educator.educatorId)
    .maybeSingle()

  return NextResponse.json(
    { job: job ?? null, dubLangs: DVR_DEFAULT_DUB_LANGS },
    { headers: { "Cache-Control": "no-store" } },
  )
}

// POST — { action: 'prepare' | 'confirm_delete', langs? }
export async function POST(req: NextRequest) {
  const educator = await authEducator()
  if (!educator) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")

  const { data: job } = await supabase
    .from("lms_dvr_jobs")
    .select("id, status")
    .eq("educator_id", educator.educatorId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: "Sem gravação disponível" }, { status: 404 })

  if (action === "prepare") {
    const requested: string[] = Array.isArray(body?.langs) ? body.langs : [...DVR_DEFAULT_DUB_LANGS]
    const langs = requested.map((l) => String(l).toLowerCase().slice(0, 2)).filter(Boolean)
    const { error } = await supabase
      .from("lms_dvr_jobs")
      .update({ status: "pending", langs, error: null, updated_at: new Date().toISOString() })
      .eq("id", job.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: "pending", langs })
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

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

/**
 * Persistência DURÁVEL do layout do Studio interno, POR EDUCADOR (em lms_educators.studio_layout).
 * Substitui o localStorage: as posições das fontes/cenas ficam guardadas no servidor e voltam em
 * qualquer dispositivo — não fazem reset ao sair do studio. Ver `internal-streaming-studio`.
 *
 * GET → { layout: { layers, sources } | null }
 * PUT (body = { layers, sources }) → grava e devolve { ok: true }
 */

const supabase = getSupabaseAdmin()

async function requireEducator() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  return token ? verifyEducatorToken(token) : null
}

export async function GET() {
  const edu = await requireEducator()
  if (!edu) return NextResponse.json({ authenticated: false }, { status: 401 })
  const { data } = await supabase
    .from("lms_educators")
    .select("studio_layout")
    .eq("id", edu.educatorId)
    .maybeSingle()
  return NextResponse.json({ authenticated: true, layout: (data as { studio_layout?: unknown } | null)?.studio_layout ?? null })
}

export async function PUT(request: NextRequest) {
  const edu = await requireEducator()
  if (!edu) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  const { error } = await supabase
    .from("lms_educators")
    .update({ studio_layout: body })
    .eq("id", edu.educatorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

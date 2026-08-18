import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

/**
 * CURSOS do educador (lms_educator_playlists) — o próprio educador cria/edita/ordena/apaga no Studio.
 * Autenticação pelo cookie de educador (mesmo padrão das restantes rotas educator-auth); cada
 * educador só toca nas SUAS playlists (educator_id vem do token, nunca do body).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TIERS = new Set(["all", "app_member", "premium", "vip"])

async function currentEducatorId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  const educator = token ? verifyEducatorToken(token) : null
  return educator?.educatorId ?? null
}

/** Lista os cursos do educador autenticado. */
export async function GET() {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { data } = await getSupabaseAdmin()
    .from("lms_educator_playlists")
    .select("id, title, url, access_tier, sort_order, is_active")
    .eq("educator_id", educatorId)
    .order("sort_order", { ascending: true })
  return NextResponse.json({ playlists: data ?? [] })
}

/** Cria um curso. Body: { title, url, access_tier?, sort_order? } */
export async function POST(request: NextRequest) {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  const title = String(b?.title || "").trim()
  const url = String(b?.url || "").trim()
  if (!title || !url) return NextResponse.json({ error: "Título e link são obrigatórios" }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Link inválido" }, { status: 400 })
  const tier = TIERS.has(String(b?.access_tier)) ? String(b.access_tier) : "all"
  const { data, error } = await getSupabaseAdmin()
    .from("lms_educator_playlists")
    .insert({
      educator_id: educatorId,
      title: title.slice(0, 120),
      url,
      access_tier: tier,
      sort_order: Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 0,
    })
    .select("id, title, url, access_tier, sort_order, is_active")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ playlist: data })
}

/** Edita um curso do próprio educador. Body: { id, ...campos } */
export async function PATCH(request: NextRequest) {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  const id = String(b?.id || "")
  if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 120)
  if (typeof b.url === "string" && /^https?:\/\//i.test(b.url.trim())) patch.url = b.url.trim()
  if (TIERS.has(String(b?.access_tier))) patch.access_tier = String(b.access_tier)
  if (Number.isFinite(Number(b?.sort_order))) patch.sort_order = Number(b.sort_order)
  if (typeof b.is_active === "boolean") patch.is_active = b.is_active
  const { error } = await getSupabaseAdmin()
    .from("lms_educator_playlists")
    .update(patch)
    .eq("id", id)
    .eq("educator_id", educatorId) // só o dono
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Apaga um curso do próprio educador. Body: { id } */
export async function DELETE(request: NextRequest) {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  const id = String(b?.id || "")
  if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from("lms_educator_playlists")
    .delete()
    .eq("id", id)
    .eq("educator_id", educatorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

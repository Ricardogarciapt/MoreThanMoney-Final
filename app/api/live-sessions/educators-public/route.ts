import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

/**
 * Lista educadores ativos para o lobby (sem email/password).
 * is_live = tem pelo menos um stream com is_live neste momento.
 */
export async function GET() {
  try {
    const { data: educators, error: e1 } = await supabase
      .from("lms_educators")
      .select(
        `
        id,
        display_name,
        bio,
        avatar_url,
        specialty,
        academy_id,
        academy:lms_academies(id, slug, name)
      `
      )
      .eq("is_active", true)
      .order("display_name", { ascending: true })

    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 500 })
    }

    const { data: liveRows, error: e2 } = await supabase
      .from("lms_streams")
      .select("educator_id")
      .eq("is_live", true)

    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 500 })
    }

    const liveSet = new Set((liveRows || []).map((r) => r.educator_id))

    const payload = (educators || []).map((ed: any) => ({
      id: ed.id,
      display_name: ed.display_name,
      bio: ed.bio,
      avatar_url: ed.avatar_url,
      specialty: ed.specialty,
      academy: ed.academy,
      is_live: liveSet.has(ed.id),
    }))

    return NextResponse.json({ success: true, data: payload })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

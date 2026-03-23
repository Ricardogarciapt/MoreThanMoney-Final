import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const academyId = searchParams.get("academyId")
    const educatorId = searchParams.get("educatorId")
    const onlyLive = searchParams.get("live") === "true"

    let query = supabase
      .from("lms_streams")
      .select(`
        *,
        academy:lms_academies(id, slug, name),
        educator:lms_educators(id, display_name, bio, avatar_url, is_active)
      `)
      .order("is_live", { ascending: false })
      .order("updated_at", { ascending: false })

    if (academyId) query = query.eq("academy_id", academyId)
    if (educatorId) query = query.eq("educator_id", educatorId)
    if (onlyLive) query = query.eq("is_live", true)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


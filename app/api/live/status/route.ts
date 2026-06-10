import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("lms_streams")
      .select(`
        id,
        title,
        description,
        thumbnail_url,
        stream_key,
        is_live,
        educator:lms_educators(id, display_name, avatar_url)
      `)
      .eq("is_live", true)
      .order("live_started_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


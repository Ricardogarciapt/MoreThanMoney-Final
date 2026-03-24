import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { sortLmsAcademiesByOfficialOrder } from "@/lib/lms-academies"

const supabase = getSupabaseAdmin()

export async function GET() {
  try {
    const { data, error } = await supabase.from("lms_academies").select("*")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const sorted = sortLmsAcademiesByOfficialOrder(data || [])
    return NextResponse.json({ success: true, data: sorted })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


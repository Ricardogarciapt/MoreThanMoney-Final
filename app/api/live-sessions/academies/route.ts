import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("lms_academies")
      .select("*")
      .order("name", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


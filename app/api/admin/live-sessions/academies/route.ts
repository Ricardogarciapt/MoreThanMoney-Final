import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from("lms_academies")
    .select("*")
    .order("name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const name = String(body.name || "").trim()
    const description = String(body.description || "").trim()
    const slug = String(body.slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")).trim()

    if (!name || !slug) {
      return NextResponse.json({ error: "name e slug são obrigatórios" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("lms_academies")
      .insert({ name, slug, description: description || null })
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


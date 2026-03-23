import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from("lms_educators")
    .select("id, email, display_name, bio, avatar_url, academy_id, is_active, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const display_name = String(body.display_name || "").trim()
    const password = String(body.password || "")
    const bio = String(body.bio || "").trim()
    const avatar_url = String(body.avatar_url || "").trim()
    const academy_id = body.academy_id || null

    if (!email || !display_name || !password) {
      return NextResponse.json({ error: "email, display_name e password são obrigatórios" }, { status: 400 })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from("lms_educators")
      .insert({
        email,
        display_name,
        password_hash,
        bio: bio || null,
        avatar_url: avatar_url || null,
        academy_id,
        is_active: true,
      })
      .select("id, email, display_name, bio, avatar_url, academy_id, is_active, created_at, updated_at")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })

    const updates: Record<string, any> = {}
    if (body.display_name !== undefined) updates.display_name = String(body.display_name || "").trim()
    if (body.bio !== undefined) updates.bio = String(body.bio || "").trim() || null
    if (body.avatar_url !== undefined) updates.avatar_url = String(body.avatar_url || "").trim() || null
    if (body.academy_id !== undefined) updates.academy_id = body.academy_id || null
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)
    if (body.password) {
      updates.password_hash = await bcrypt.hash(String(body.password), 10)
    }

    const { data, error } = await supabase
      .from("lms_educators")
      .update(updates)
      .eq("id", id)
      .select("id, email, display_name, bio, avatar_url, academy_id, is_active, created_at, updated_at")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


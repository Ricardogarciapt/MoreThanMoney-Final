import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

const TIERS = ["free", "all", "app_member", "premium", "vip"]

function normSlot(body: Record<string, unknown>) {
  const weekday = Number(body.weekday)
  const start = String(body.start_time || "").trim()
  const hhmm = /^([01]?\d|2[0-3]):[0-5]\d$/.test(start) ? start : null
  return {
    weekday: weekday >= 1 && weekday <= 7 ? weekday : null,
    start_time: hhmm,
    duration_min:
      body.duration_min === null || body.duration_min === undefined || body.duration_min === ""
        ? null
        : Number(body.duration_min) || null,
    timezone: String(body.timezone || "Europe/Lisbon").trim() || "Europe/Lisbon",
    access_tier: TIERS.includes(String(body.access_tier)) ? String(body.access_tier) : null,
    is_active: body.is_active !== false,
  }
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  const streamId = new URL(request.url).searchParams.get("streamId")
  let q = supabase.from("lms_stream_schedules").select("*").order("weekday").order("start_time")
  if (streamId) q = q.eq("stream_id", streamId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  try {
    const body = await request.json()
    const streamId = String(body.stream_id || "")
    if (!streamId) return NextResponse.json({ error: "stream_id é obrigatório" }, { status: 400 })
    const slot = normSlot(body)
    if (!slot.weekday || !slot.start_time) {
      return NextResponse.json({ error: "weekday (1-7) e start_time (HH:MM) obrigatórios" }, { status: 400 })
    }
    const { data, error } = await supabase
      .from("lms_stream_schedules")
      .insert({ stream_id: streamId, ...slot })
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  try {
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const slot = normSlot(body)
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.weekday !== undefined && slot.weekday) updates.weekday = slot.weekday
    if (body.start_time !== undefined && slot.start_time) updates.start_time = slot.start_time
    if (body.duration_min !== undefined) updates.duration_min = slot.duration_min
    if (body.access_tier !== undefined) updates.access_tier = slot.access_tier
    if (body.is_active !== undefined) updates.is_active = slot.is_active
    const { data, error } = await supabase.from("lms_stream_schedules").update(updates).eq("id", id).select("*").single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  try {
    const id = String((await request.json()).id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const { error } = await supabase.from("lms_stream_schedules").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

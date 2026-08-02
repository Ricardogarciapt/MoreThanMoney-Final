import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()
const TIERS = ["free", "all", "app_member", "premium", "vip"]

async function currentEducatorId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  const edu = token ? verifyEducatorToken(token) : null
  return edu?.educatorId ?? null
}

async function ownsStream(educatorId: string, streamId: string): Promise<boolean> {
  const { data } = await supabase
    .from("lms_streams")
    .select("id")
    .eq("id", streamId)
    .eq("educator_id", educatorId)
    .maybeSingle()
  return Boolean(data)
}

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
    access_tier: TIERS.includes(String(body.access_tier)) ? String(body.access_tier) : null,
    is_active: body.is_active !== false,
  }
}

export async function GET(request: NextRequest) {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const streamId = new URL(request.url).searchParams.get("streamId")
  if (!streamId) return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
  if (!(await ownsStream(educatorId, streamId))) return NextResponse.json({ error: "Canal não pertence a esta conta" }, { status: 403 })
  const { data, error } = await supabase
    .from("lms_stream_schedules")
    .select("*")
    .eq("stream_id", streamId)
    .order("weekday")
    .order("start_time")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(request: NextRequest) {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  try {
    const body = await request.json()
    const streamId = String(body.stream_id || "")
    if (!streamId) return NextResponse.json({ error: "stream_id é obrigatório" }, { status: 400 })
    if (!(await ownsStream(educatorId, streamId))) return NextResponse.json({ error: "Canal não pertence a esta conta" }, { status: 403 })
    const slot = normSlot(body)
    if (!slot.weekday || !slot.start_time) return NextResponse.json({ error: "weekday (1-7) e start_time (HH:MM) obrigatórios" }, { status: 400 })
    const { data, error } = await supabase.from("lms_stream_schedules").insert({ stream_id: streamId, ...slot }).select("*").single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

async function slotOwnedStreamId(id: string): Promise<string | null> {
  const { data } = await supabase.from("lms_stream_schedules").select("stream_id").eq("id", id).maybeSingle()
  return (data?.stream_id as string) ?? null
}

export async function PATCH(request: NextRequest) {
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  try {
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const streamId = await slotOwnedStreamId(id)
    if (!streamId || !(await ownsStream(educatorId, streamId))) return NextResponse.json({ error: "Slot não pertence a esta conta" }, { status: 403 })
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
  const educatorId = await currentEducatorId()
  if (!educatorId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  try {
    const id = String((await request.json()).id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const streamId = await slotOwnedStreamId(id)
    if (!streamId || !(await ownsStream(educatorId, streamId))) return NextResponse.json({ error: "Slot não pertence a esta conta" }, { status: 403 })
    const { error } = await supabase.from("lms_stream_schedules").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

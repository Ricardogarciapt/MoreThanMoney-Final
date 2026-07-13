import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { projectSchedule, type ScheduleSlot } from "@/lib/lms-schedule"

const supabase = getSupabaseAdmin()

export const dynamic = "force-dynamic"

type StreamMini = {
  id: string
  title: string
  access_tier: string | null
  educator_id: string | null
  educator?: { id: string; display_name: string } | { id: string; display_name: string }[] | null
}

function educatorName(e: StreamMini["educator"]): string | null {
  if (!e) return null
  const one = Array.isArray(e) ? e[0] : e
  return one?.display_name ?? null
}

/**
 * Horário unificado das salas: projeta os slots semanais recorrentes
 * (lms_stream_schedules, Europe/Lisbon) e junta os one-offs (scheduled_start_at).
 * Fonte única para a timetable do app-mobile e da /live.
 */
export async function GET(req: NextRequest) {
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 21, 1), 60)
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 14, 1), 60)
  const now = new Date()

  try {
    // 1) Slots recorrentes + metadados da sala
    const { data: slotRows } = await supabase
      .from("lms_stream_schedules")
      .select(
        "id, stream_id, weekday, start_time, duration_min, timezone, access_tier, is_active, " +
          "stream:lms_streams(id, title, access_tier, educator_id, educator:lms_educators(id, display_name))",
      )
      .eq("is_active", true)

    const streamById = new Map<string, StreamMini>()
    const slots: ScheduleSlot[] = []
    for (const r of (slotRows ?? []) as Array<Record<string, unknown>>) {
      const stream = (Array.isArray(r.stream) ? r.stream[0] : r.stream) as StreamMini | undefined
      if (!stream) continue
      streamById.set(stream.id, stream)
      slots.push({
        id: String(r.id),
        stream_id: String(r.stream_id),
        weekday: Number(r.weekday),
        start_time: String(r.start_time),
        duration_min: (r.duration_min as number | null) ?? null,
        timezone: (r.timezone as string | null) ?? null,
        access_tier: (r.access_tier as string | null) ?? null,
        is_active: r.is_active !== false,
      })
    }

    const slotTierByStreamDay = new Map<string, string | null>()
    for (const s of slots) slotTierByStreamDay.set(`${s.stream_id}:${s.weekday}:${s.start_time}`, s.access_tier ?? null)

    const projected = projectSchedule(slots, { from: now, days })
    const recurring = projected.map((p) => {
      const stream = streamById.get(p.streamId)
      // tier do slot (se definido) senão o da sala
      const slot = slots.find((s) => s.stream_id === p.streamId)
      const tier = (slot?.access_tier ?? stream?.access_tier) ?? "all"
      return {
        id: p.id,
        streamId: p.streamId,
        educatorId: stream?.educator_id ?? null,
        title: stream?.title ?? "Sessão",
        educatorName: educatorName(stream?.educator),
        scheduledAt: p.scheduledAt,
        tier,
      }
    })

    // 2) One-offs (scheduled_start_at no futuro) — não duplicar salas já cobertas por recorrência no mesmo instante
    const { data: oneOffRows } = await supabase
      .from("lms_streams")
      .select("id, title, access_tier, scheduled_start_at, educator_id, educator:lms_educators(id, display_name)")
      .eq("is_live", false)
      .gt("scheduled_start_at", now.toISOString())

    const oneOffs = ((oneOffRows ?? []) as Array<Record<string, unknown>>).map((s) => ({
      id: `${s.id}:${s.scheduled_start_at}`,
      streamId: String(s.id),
      educatorId: (s.educator_id as string | null) ?? null,
      title: String(s.title ?? "Sessão"),
      educatorName: educatorName(s.educator as StreamMini["educator"]),
      scheduledAt: String(s.scheduled_start_at),
      tier: (s.access_tier as string | null) ?? "all",
    }))

    const all = [...recurring, ...oneOffs]
    const seen = new Set<string>()
    const merged = all
      .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .slice(0, limit)

    return NextResponse.json({ data: merged })
  } catch (e) {
    return NextResponse.json({ data: [], error: (e as Error).message }, { status: 200 })
  }
}

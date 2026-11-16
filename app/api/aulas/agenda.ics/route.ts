import { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { projectSchedule, type ScheduleSlot } from "@/lib/lms-schedule"
import { gerarIcs, type AulaIcs } from "@/lib/aulas-ics"

export const dynamic = "force-dynamic"

type Educador = { id: string; display_name: string | null }
type Sala = { id: string; title: string | null; access_tier: string | null; educator_id: string | null; educator?: Educador | Educador[] | null }

const um = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null)

/**
 * GET /api/aulas/agenda.ics[?educador=<uuid>]
 *
 * As aulas ao vivo dos próximos 60 dias (horário recorrente + sessões avulsas), como feed iCalendar
 * para subscrever no Google Calendar, no calendário da Apple ou no Outlook. Mesma fonte que
 * /api/live-sessions/schedule. Ver lib/aulas-ics.ts.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const educador = new URL(req.url).searchParams.get("educador")
  const filtro = educador && /^[0-9a-f-]{36}$/i.test(educador) ? educador : null
  const agora = new Date()

  const { data: slotRows } = await supabase
    .from("lms_stream_schedules")
    .select("id, stream_id, weekday, start_time, duration_min, timezone, access_tier, is_active, stream:lms_streams(id, title, access_tier, educator_id, educator:lms_educators(id, display_name))")
    .eq("is_active", true)
    .overrideTypes<Record<string, unknown>[], { merge: false }>()

  const salas = new Map<string, Sala>()
  const slots: ScheduleSlot[] = []
  for (const r of slotRows ?? []) {
    const sala = um(r.stream as Sala | Sala[] | null)
    if (!sala || (filtro && sala.educator_id !== filtro)) continue
    salas.set(sala.id, sala)
    slots.push({
      id: String(r.id),
      stream_id: String(r.stream_id),
      weekday: Number(r.weekday),
      start_time: String(r.start_time),
      duration_min: (r.duration_min as number | null) ?? null,
      timezone: (r.timezone as string | null) ?? null,
      access_tier: (r.access_tier as string | null) ?? null,
      is_active: true,
    })
  }

  const aulas: AulaIcs[] = projectSchedule(slots, { from: agora, days: 60 }).map((p) => {
    const sala = salas.get(p.streamId)
    return {
      id: p.id,
      title: sala?.title ?? "Aula ao vivo",
      educatorName: um(sala?.educator)?.display_name ?? null,
      scheduledAt: p.scheduledAt,
      durationMin: p.durationMin ?? null,
      tier: p.accessTier ?? sala?.access_tier ?? "all",
    }
  })

  let avulsas = supabase
    .from("lms_streams")
    .select("id, title, access_tier, scheduled_start_at, educator_id, educator:lms_educators(id, display_name)")
    .eq("is_live", false)
    .gt("scheduled_start_at", agora.toISOString())
  if (filtro) avulsas = avulsas.eq("educator_id", filtro)
  const { data: avulsaRows } = await avulsas
  for (const s of (avulsaRows ?? []) as Array<Record<string, unknown>>) {
    aulas.push({
      id: `${s.id}:${s.scheduled_start_at}`,
      title: String(s.title ?? "Aula ao vivo"),
      educatorName: um(s.educator as Educador | Educador[] | null)?.display_name ?? null,
      scheduledAt: String(s.scheduled_start_at),
      tier: (s.access_tier as string | null) ?? "all",
    })
  }

  const vistos = new Set<string>()
  const unicas = aulas.filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)))

  return new Response(gerarIcs(unicas), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="morethanmoney-aulas.ics"',
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  })
}

/**
 * Projeção de horários recorrentes das salas (lms_stream_schedules) para
 * ocorrências absolutas, respeitando o fuso (Europe/Lisbon) com DST.
 *
 * Fonte "viva": um slot semanal (dia + hora local) projeta-se para sempre; a
 * timetable partilhada (app-mobile + /live) consome as próximas N ocorrências.
 * Não depende de nenhuma lib de timezone — usa Intl para calcular o offset real.
 */

export interface ScheduleSlot {
  id: string
  stream_id: string
  weekday: number // ISO 1=Seg .. 7=Dom
  start_time: string // "HH:MM" ou "HH:MM:SS" (hora local)
  duration_min?: number | null
  timezone?: string | null
  access_tier?: string | null
  is_active?: boolean | null
}

export interface ProjectedSession {
  /** id único da ocorrência (stream + instante) */
  id: string
  streamId: string
  scheduledAt: string // ISO UTC
  /** minutos, se definido */
  durationMin?: number | null
}

/** Offset (minutos, local-UTC) do fuso `tz` no instante `date`. */
function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value
    return acc
  }, {})
  // '24' em algumas engines para meia-noite → normaliza
  const hour = parts.hour === "24" ? 0 : Number(parts.hour)
  const asLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  )
  return (asLocal - date.getTime()) / 60000
}

/** Converte uma hora de parede (ano/mês/dia/h/m) no fuso `tz` para um instante UTC. */
function zonedWallTimeToUtc(
  year: number,
  month1: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const naiveUtc = Date.UTC(year, month1 - 1, day, hour, minute)
  // 1ª aproximação do offset e correção (resolve DST corretamente na esmagadora maioria dos casos).
  const off1 = tzOffsetMinutes(tz, new Date(naiveUtc))
  const guess = new Date(naiveUtc - off1 * 60000)
  const off2 = tzOffsetMinutes(tz, guess)
  return off2 === off1 ? guess : new Date(naiveUtc - off2 * 60000)
}

/** Data no fuso `tz` (ano/mês/dia + ISO weekday) para um dado instante. */
function zonedDateParts(tz: string, date: Date): { year: number; month1: number; day: number; isoWeekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value
    return acc
  }, {})
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    year: Number(parts.year),
    month1: Number(parts.month),
    day: Number(parts.day),
    isoWeekday: wdMap[parts.weekday] ?? 1,
  }
}

function parseHm(t: string): { h: number; m: number } {
  const [h, m] = t.split(":")
  return { h: Number(h), m: Number(m) || 0 }
}

/**
 * Projeta os slots recorrentes para ocorrências absolutas na janela
 * [from, from+days]. Uma ocorrência por slot por semana dentro da janela.
 */
export function projectSchedule(
  slots: ScheduleSlot[],
  opts: { from?: Date; days?: number } = {},
): ProjectedSession[] {
  const from = opts.from ?? new Date()
  const days = opts.days ?? 21
  const active = slots.filter((s) => s.is_active !== false)
  if (!active.length) return []

  const out: ProjectedSession[] = []
  // Itera dia a dia (no fuso de cada slot pode variar, mas iteramos por instante base e resolvemos o dia local).
  for (let d = 0; d <= days; d++) {
    const dayInstant = new Date(from.getTime() + d * 86400000)
    for (const slot of active) {
      const tz = slot.timezone || "Europe/Lisbon"
      const { year, month1, day, isoWeekday } = zonedDateParts(tz, dayInstant)
      if (isoWeekday !== slot.weekday) continue
      const { h, m } = parseHm(slot.start_time)
      const when = zonedWallTimeToUtc(year, month1, day, h, m, tz)
      if (when.getTime() <= from.getTime()) continue
      if (when.getTime() > from.getTime() + days * 86400000) continue
      out.push({
        id: `${slot.stream_id}:${when.toISOString()}`,
        streamId: slot.stream_id,
        scheduledAt: when.toISOString(),
        durationMin: slot.duration_min ?? null,
      })
    }
  }
  // Dedup (o mesmo instante pode surgir em dias adjacentes por causa do offset) + ordena
  const seen = new Set<string>()
  return out
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
}

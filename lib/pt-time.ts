/**
 * Utilitários de hora "de parede" de Portugal (Europe/Lisbon).
 *
 * Um <input type="datetime-local"> devolve uma string sem fuso (ex.: "2026-07-14T21:00")
 * que representa a hora que o admin vê no ecrã. Se essa string for guardada tal e qual
 * numa coluna timestamptz, o Postgres interpreta-a como UTC — e "21:00" passa a aparecer
 * como 22:00 em Portugal (no horário de verão, UTC+1). Estes helpers garantem que "21:00"
 * significa sempre 21:00 em Portugal, respeitando o DST, independentemente do fuso do
 * browser do admin.
 */

export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Offset (ms) que Europe/Lisbon está à frente do UTC no instante `utcMs`. */
function lisbonOffsetMs(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") map[p.type] = Number(p.value)
  }
  let hour = map.hour
  if (hour === 24) hour = 0 // alguns motores devolvem "24" à meia-noite
  const asIfLocal = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second)
  return asIfLocal - utcMs
}

/**
 * Converte uma hora de parede de Portugal ("YYYY-MM-DDTHH:mm") no instante UTC correto
 * em ISO. Respeita o DST para a data indicada.
 */
export function ptWallTimeToUtcIso(localWall: string): string {
  const s = (localWall || "").trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  if (!m) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? s : d.toISOString()
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const hh = Number(m[4])
  const mi = Number(m[5])
  const utcGuess = Date.UTC(y, mo - 1, da, hh, mi, 0, 0)
  const offsetMs = lisbonOffsetMs(utcGuess)
  return new Date(utcGuess - offsetMs).toISOString()
}

/** Componentes locais de um Date → "YYYY-MM-DDTHH:mm" (hora de parede). */
export function toNaiveLocalWall(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`
}

"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Editor de horário semanal recorrente de uma sala (lms_stream_schedules).
 * Partilhado entre o admin e o studio do educador — muda só o apiBase.
 * A timetable (app-mobile + /live) projeta estes slots automaticamente.
 */

export type ScheduleSlotRow = {
  id: string
  stream_id: string
  weekday: number
  start_time: string
  duration_min: number | null
  access_tier: string | null
  is_active: boolean
}

const WEEKDAYS = [
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
  { v: 7, label: "Dom" },
]

const TIERS = [
  { v: "", label: "Herda da sala" },
  { v: "all", label: "Todos" },
  { v: "app_member", label: "Membro (€35)+" },
  { v: "premium", label: "Premium (€65)" },
  { v: "vip", label: "VIP e Admin" },
]

function weekdayLabel(w: number) {
  return WEEKDAYS.find((d) => d.v === w)?.label ?? "—"
}

export function ScheduleEditor({
  streamId,
  apiBase,
  title = "Horário semanal",
}: {
  streamId: string
  /** ex: /api/admin/live-sessions/schedules OU /api/live-sessions/educator-auth/schedules */
  apiBase: string
  title?: string
}) {
  const [slots, setSlots] = useState<ScheduleSlotRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weekday, setWeekday] = useState(1)
  const [time, setTime] = useState("14:00")
  const [tier, setTier] = useState("")
  const [duration, setDuration] = useState("60")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${apiBase}?streamId=${encodeURIComponent(streamId)}`, { credentials: "same-origin" }).then((x) => x.json())
      setSlots(Array.isArray(r?.data) ? r.data : [])
    } catch {
      setError("Falha a carregar horário.")
    } finally {
      setLoading(false)
    }
  }, [apiBase, streamId])

  useEffect(() => {
    if (streamId) load()
  }, [streamId, load])

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          stream_id: streamId,
          weekday,
          start_time: time,
          duration_min: duration ? Number(duration) : null,
          access_tier: tier || null,
        }),
      }).then((x) => x.json())
      if (r?.error) setError(r.error)
      else await load()
    } catch {
      setError("Falha a adicionar slot.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (row: ScheduleSlotRow) => {
    setBusy(true)
    try {
      await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className="text-[10px] text-gray-500">Hora de Portugal (Europe/Lisbon)</span>
      </div>

      {/* Lista de slots */}
      {loading ? (
        <p className="py-2 text-xs text-gray-500">A carregar…</p>
      ) : slots.length === 0 ? (
        <p className="py-2 text-xs text-gray-500">Sem sessões recorrentes. Adiciona abaixo.</p>
      ) : (
        <ul className="mb-3 divide-y divide-gray-800/70 rounded-lg border border-gray-800/70">
          {slots.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 px-2.5 py-2 text-xs ${s.is_active ? "" : "opacity-50"}`}>
              <span className="w-9 font-bold text-[#D2A63C]">{weekdayLabel(s.weekday)}</span>
              <span className="w-12 font-semibold text-white">{s.start_time.slice(0, 5)}</span>
              <span className="flex-1 text-gray-400">
                {s.duration_min ? `${s.duration_min} min` : ""}
                {s.access_tier ? ` · ${TIERS.find((t) => t.v === s.access_tier)?.label ?? s.access_tier}` : ""}
              </span>
              <button type="button" onClick={() => toggle(s)} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800">
                {s.is_active ? "Pausar" : "Ativar"}
              </button>
              <button type="button" onClick={() => remove(s.id)} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-950/40">
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Adicionar slot */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[10px] text-gray-400">
          Dia
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="mt-0.5 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white">
            {WEEKDAYS.map((d) => (
              <option key={d.v} value={d.v}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-[10px] text-gray-400">
          Hora (PT)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-0.5 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white" />
        </label>
        <label className="flex flex-col text-[10px] text-gray-400">
          Duração
          <input type="number" min={0} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-0.5 w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white" />
        </label>
        <label className="flex flex-col text-[10px] text-gray-400">
          Acesso
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="mt-0.5 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white">
            {TIERS.map((t) => (
              <option key={t.v} value={t.v}>{t.label}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={add} disabled={busy} className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50">
          + Adicionar
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

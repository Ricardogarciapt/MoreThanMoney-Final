"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, CheckCircle2, Rocket, Star, Target } from "lucide-react"

type MentorTask = {
  id: string
  title: string
  description: string
  status: "pending" | "completed" | "skipped"
  phase: string
  due_at?: string | null
}

type MentorOverview = {
  profile: {
    pe_left: number
    pe_right: number
    cv_left: number
    cv_right: number
    current_rank: string
    target_rank: string
  }
  tasks: MentorTask[]
  progressPercent: number
  rankGoals: {
    rising_star: string
    bronze_star: string
  }
}

export default function MentorImmersivePanel({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<MentorOverview | null>(null)
  const [telegramLink, setTelegramLink] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [overviewRes, telegramRes] = await Promise.all([
        fetch("/api/mentor/overview", { cache: "no-store" }),
        fetch("/api/mentor/telegram-link", { cache: "no-store" }),
      ])
      const overviewJson = await overviewRes.json()
      const telegramJson = await telegramRes.json()
      if (overviewJson?.success) setOverview(overviewJson.data)
      if (telegramJson?.success) setTelegramLink(telegramJson.data?.telegram_link || null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const nextTasks = useMemo(
    () => (overview?.tasks || []).filter((t) => t.status !== "completed").slice(0, compact ? 3 : 5),
    [overview, compact]
  )

  const completeTask = async (taskId: string) => {
    setBusyTaskId(taskId)
    try {
      await fetch("/api/mentor/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      })
      await load()
    } finally {
      setBusyTaskId(null)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 text-sm text-gray-300">A preparar o teu mentor automático...</div>
  }

  if (!overview) return null

  return (
    <section className="rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#D2A63C]/80">Mentor Automático</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Execução guiada 72h + plano de ranking</h3>
        </div>
        <div className="rounded-lg border border-[#D2A63C]/25 bg-black/30 px-2 py-1 text-xs text-[#D2A63C]">
          {overview.progressPercent}% concluído
        </div>
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-gray-800">
        <div className="h-2 rounded-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525]" style={{ width: `${overview.progressPercent}%` }} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#D2A63C]/15 bg-black/20 p-3 text-sm text-gray-200">
          <p className="mb-1 flex items-center gap-2 font-medium text-white"><Target className="h-4 w-4 text-[#D2A63C]" /> Rising Star</p>
          <p>{overview.rankGoals.rising_star}</p>
        </div>
        <div className="rounded-xl border border-[#D2A63C]/15 bg-black/20 p-3 text-sm text-gray-200">
          <p className="mb-1 flex items-center gap-2 font-medium text-white"><Star className="h-4 w-4 text-[#D2A63C]" /> Bronze Star</p>
          <p>{overview.rankGoals.bronze_star}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#D2A63C]/15 bg-black/20 p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-white"><Rocket className="h-4 w-4 text-[#D2A63C]" /> Próximas ações</p>
        <div className="space-y-2">
          {nextTasks.map((task) => (
            <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{task.title}</p>
                <p className="text-xs text-gray-300">{task.description}</p>
              </div>
              <button
                type="button"
                disabled={busyTaskId === task.id}
                onClick={() => completeTask(task.id)}
                className="shrink-0 rounded-md border border-[#D2A63C]/40 px-2 py-1 text-xs text-[#D2A63C] hover:bg-[#D2A63C]/10 disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Feito
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-[#D2A63C]/30 bg-black/30 px-2 py-1 text-xs text-gray-200">
          <Bell className="h-3.5 w-3.5 text-[#D2A63C]" />
          Notificações na app-mobile ativas por progresso
        </span>
      </div>
    </section>
  )
}


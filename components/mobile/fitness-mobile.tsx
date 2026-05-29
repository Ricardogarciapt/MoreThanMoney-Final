"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dumbbell,
  Activity,
  Utensils,
  Scale,
  Loader2,
  ExternalLink,
  Plus,
  Calendar,
} from "lucide-react"
import Link from "next/link"

interface WorkoutSession {
  id: string
  date: string
  start_time?: string | null
  duration_minutes?: number | null
  workouts?: { name: string }
}

export default function FitnessMobile() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [workoutsCount, setWorkoutsCount] = useState(0)
  const [sessionsCount, setSessionsCount] = useState(0)
  const [mealsCount, setMealsCount] = useState(0)
  const [lastSession, setLastSession] = useState<WorkoutSession | null>(null)
  const [weightEntries, setWeightEntries] = useState<{ weight: number; date: string }[]>([])
  const [weightForm, setWeightForm] = useState({ weight: "", date: new Date().toISOString().split("T")[0] })
  const [weightSaving, setWeightSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [workoutsRes, sessionsRes, mealsRes, weightRes] = await Promise.all([
        fetch("/api/fitness/workouts", { credentials: "include" }),
        fetch("/api/fitness/workout-sessions?limit=50", { credentials: "include" }),
        fetch("/api/fitness/nutrition/meals?limit=7", { credentials: "include" }),
        fetch("/api/fitness/tracking/weight?limit=5", { credentials: "include" }),
      ])
      if (workoutsRes.ok) {
        const d = await workoutsRes.json()
        setWorkoutsCount((d.workouts || []).length)
      }
      if (sessionsRes.ok) {
        const d = await sessionsRes.json()
        const sessions = d.sessions || []
        setSessionsCount(sessions.length)
        setLastSession(sessions[0] || null)
      }
      if (mealsRes.ok) {
        const d = await mealsRes.json()
        setMealsCount((d.meals || []).length)
      }
      if (weightRes.ok) {
        const d = await weightRes.json()
        setWeightEntries((d.entries || []).map((e: { weight: number; date: string }) => ({ weight: e.weight, date: e.date })))
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    fetch("/api/fitness/bootstrap", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? loadData() : loadData()))
      .catch(() => loadData())
  }, [user?.id, loadData])

  const handleAddWeight = async () => {
    const w = parseFloat(weightForm.weight)
    if (!weightForm.date || isNaN(w) || w <= 0) return
    setWeightSaving(true)
    try {
      const res = await fetch("/api/fitness/tracking/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weight: w, date: weightForm.date }),
      })
      if (res.ok) {
        setWeightForm({ weight: "", date: new Date().toISOString().split("T")[0] })
        loadData()
      }
    } finally {
      setWeightSaving(false)
    }
  }

  return (
    <div className="min-h-[60vh] h-full bg-black text-white p-4">
      <h2 className="text-xl font-bold text-[#D2A63C] mb-4 flex items-center gap-2">
        <Dumbbell className="w-6 h-6" />
        Fitness
      </h2>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-[#D2A63C]" />
                <div>
                  <p className="text-[10px] text-gray-400">Planos</p>
                  <p className="text-lg font-bold text-white">{workoutsCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#D2A63C]" />
                <div>
                  <p className="text-[10px] text-gray-400">Sessões</p>
                  <p className="text-lg font-bold text-white">{sessionsCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-[#D2A63C]" />
                <div>
                  <p className="text-[10px] text-gray-400">Refeições (7d)</p>
                  <p className="text-lg font-bold text-white">{mealsCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#D2A63C]" />
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400">Último treino</p>
                  <p className="text-xs font-semibold text-white truncate">
                    {lastSession?.workouts?.name || "—"}
                  </p>
                  {lastSession?.date && (
                    <p className="text-[10px] text-gray-400">
                      {new Date(lastSession.date).toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-[#D2A63C]/20 mb-4">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-[#D2A63C] flex items-center gap-2 mb-3">
                <Scale className="w-4 h-4" />
                Peso rápido
              </p>
              <div className="flex gap-2 flex-wrap">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="kg"
                  value={weightForm.weight}
                  onChange={(e) => setWeightForm((f) => ({ ...f, weight: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white w-20"
                />
                <Input
                  type="date"
                  value={weightForm.date}
                  onChange={(e) => setWeightForm((f) => ({ ...f, date: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white flex-1 min-w-[120px]"
                />
                <Button
                  size="sm"
                  onClick={handleAddWeight}
                  disabled={weightSaving || !weightForm.weight}
                  className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                >
                  {weightSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              {weightEntries.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Último: {weightEntries[0].weight} kg ({new Date(weightEntries[0].date).toLocaleDateString("pt-PT")})
                </p>
              )}
            </CardContent>
          </Card>

          <Link
            href="/mindset-fitness"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-[#D2A63C] text-black font-semibold hover:bg-[#BB8525] transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Abrir Treinos & Nutrição completo
          </Link>
        </>
      )}
    </div>
  )
}

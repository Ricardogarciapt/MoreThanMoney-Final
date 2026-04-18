"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ProtectedPage from "@/components/protected-page"
import { Dumbbell, Activity, Calendar, Utensils, Scale, Loader2, Plus } from "lucide-react"
import WorkoutManager from "@/components/fitness/workout-manager"
import NutritionManager from "@/components/fitness/nutrition-manager"

interface Workout {
  id: string
  name: string
  description?: string
  workout_type?: string
  difficulty?: string
  duration_minutes?: number
  is_default?: boolean
}

interface WorkoutSession {
  id: string
  workout_id: string
  date: string
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
  rating?: number | null
  workouts?: {
    name: string
  }
}

interface Meal {
  id: string
  meal_date: string
  meal_type: string
  meal_time?: string | null
}

export default function MindsetFitnessPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [weightEntries, setWeightEntries] = useState<{ id: string; weight: number; date: string; notes?: string }[]>([])
  const [weightForm, setWeightForm] = useState({ weight: "", date: new Date().toISOString().split("T")[0], notes: "" })
  const [weightSaving, setWeightSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [workoutsRes, sessionsRes, mealsRes, weightRes] = await Promise.all([
        fetch("/api/fitness/workouts", { credentials: "include" }),
        fetch("/api/fitness/workout-sessions?limit=10", { credentials: "include" }),
        fetch("/api/fitness/nutrition/meals?limit=7", { credentials: "include" }),
        fetch("/api/fitness/tracking/weight?limit=14", { credentials: "include" }),
      ])
      if (workoutsRes.ok) {
        const d = await workoutsRes.json()
        setWorkouts(d.workouts || [])
      }
      if (sessionsRes.ok) {
        const d = await sessionsRes.json()
        setSessions(d.sessions || [])
      }
      if (mealsRes.ok) {
        const d = await mealsRes.json()
        setMeals(d.meals || [])
      }
      if (weightRes.ok) {
        const d = await weightRes.json()
        setWeightEntries(d.entries || [])
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Bootstrap (treinos + refeições padrão) e carregar dados — só quando o user estiver disponível
  useEffect(() => {
    if (!user?.id) return
    const init = async () => {
      try {
        const res = await fetch("/api/fitness/bootstrap", {
          method: "POST",
          credentials: "include",
        })
        if (res.ok) {
          // Recarregar para mostrar os planos padrão criados
          await loadData()
          return
        }
      } catch {
        // Ignorar erros de bootstrap
      }
      loadData()
    }
    init()
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
        body: JSON.stringify({ weight: w, date: weightForm.date, notes: weightForm.notes || undefined }),
      })
      if (res.ok) {
        setWeightForm({ weight: "", date: new Date().toISOString().split("T")[0], notes: "" })
        loadData()
      }
    } finally {
      setWeightSaving(false)
    }
  }

  const totalWorkouts = workouts.length
  const totalSessions = sessions.length
  const lastSession = sessions[0]
  const weeklyMeals = meals.length

  return (
    <ProtectedPage redirectPath="/login?redirect=/mindset-fitness">
      <main className="min-h-screen bg-black text-white px-4 py-8 md:px-8 relative">
        <div className="max-w-6xl mx-auto space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Mindset & Fitness
            </h1>
          </header>

          {/* Resumo rápido */}
          <section className="grid gap-4 md:grid-cols-4">
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-4 flex items-center gap-3">
                <Dumbbell className="w-8 h-8 text-[#D2A63C]" />
                <div>
                  <p className="text-xs text-gray-400">Planos de treino</p>
                  <p className="text-2xl font-bold text-white">{totalWorkouts}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-4 flex items-center gap-3">
                <Activity className="w-8 h-8 text-[#D2A63C]" />
                <div>
                  <p className="text-xs text-gray-400">Sessões registadas</p>
                  <p className="text-2xl font-bold text-white">{totalSessions}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-4 flex items-center gap-3">
                <Utensils className="w-8 h-8 text-[#D2A63C]" />
                <div>
                  <p className="text-xs text-gray-400">Refeições (7 dias)</p>
                  <p className="text-2xl font-bold text-white">{weeklyMeals}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-[#D2A63C]/20">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Último treino
                  </span>
                  <span className="text-xs text-gray-200">
                    {lastSession
                      ? new Date(lastSession.date + (lastSession.start_time ? "T" + lastSession.start_time : "")).toLocaleDateString("pt-PT")
                      : "—"}
                  </span>
                </div>
                <Progress value={lastSession ? 100 : 0} className="h-1.5" />
                <p className="text-xs text-gray-400">
                  {lastSession?.workouts?.name || "Ainda não registaste nenhuma sessão."}
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Tabs principais: Treino, Nutrição, Peso */}
          <section>
            <Tabs defaultValue="workouts" className="w-full">
              <TabsList className="bg-gray-900 border border-gray-800">
                <TabsTrigger value="workouts">Treinos</TabsTrigger>
                <TabsTrigger value="nutrition">Nutrição</TabsTrigger>
                <TabsTrigger value="weight">Peso</TabsTrigger>
              </TabsList>

              <TabsContent value="workouts" className="mt-4 space-y-4">
                <WorkoutManager onRefresh={loadData} />
                
                {/* Histórico de Sessões */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[#D2A63C]" />
                      Últimas Sessões de Treino
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[420px] overflow-y-auto">
                    {loading ? (
                      <p className="text-gray-400 text-sm">A carregar sessões...</p>
                    ) : sessions.length === 0 ? (
                      <p className="text-gray-400 text-sm">
                        Ainda não registaste sessões. Usa a app mobile para iniciar um treino e
                        ele aparecerá aqui.
                      </p>
                    ) : (
                      sessions.map((s) => (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg border border-gray-800 bg-gray-950/60 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-white">
                              {s.workouts?.name || "Treino"}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {new Date(s.date + (s.start_time ? "T" + s.start_time : "")).toLocaleDateString("pt-PT")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            {s.duration_minutes && <span>{s.duration_minutes} min</span>}
                            {s.end_time && <span>Concluído</span>}
                          </div>
                          {s.rating && (
                            <div className="text-[11px] text-[#D2A63C]">
                              {"★".repeat(s.rating)}{" "}
                              {"☆".repeat(Math.max(0, 5 - s.rating))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="nutrition" className="mt-4">
                <NutritionManager onRefresh={loadData} />
              </TabsContent>

              <TabsContent value="weight" className="mt-4 space-y-4">
                <Card className="bg-gray-900 border-[#D2A63C]/20">
                  <CardHeader>
                    <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                      <Scale className="w-5 h-5" />
                      Registo de Peso
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="text-sm text-gray-400 block mb-1">Peso (kg) *</label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Ex: 72.5"
                          value={weightForm.weight}
                          onChange={(e) => setWeightForm((f) => ({ ...f, weight: e.target.value }))}
                          className="bg-gray-800 border-gray-700 text-white w-28"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-400 block mb-1">Data</label>
                        <Input
                          type="date"
                          value={weightForm.date}
                          onChange={(e) => setWeightForm((f) => ({ ...f, date: e.target.value }))}
                          className="bg-gray-800 border-gray-700 text-white w-40"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-sm text-gray-400 block mb-1">Notas</label>
                        <Input
                          placeholder="Opcional"
                          value={weightForm.notes}
                          onChange={(e) => setWeightForm((f) => ({ ...f, notes: e.target.value }))}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                      </div>
                      <Button
                        onClick={handleAddWeight}
                        disabled={weightSaving || !weightForm.weight}
                        className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                      >
                        {weightSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        {weightSaving ? "A guardar..." : "Registar"}
                      </Button>
                    </div>
                    <div className="border-t border-gray-800 pt-4">
                      <p className="text-sm text-gray-400 mb-2">Últimos registos</p>
                      {weightEntries.length === 0 ? (
                        <p className="text-gray-500 text-sm">Ainda não registaste peso.</p>
                      ) : (
                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                          {weightEntries.map((e) => (
                            <li key={e.id} className="flex justify-between items-center py-2 border-b border-gray-800/50 text-sm">
                              <span className="text-white font-medium">{e.weight} kg</span>
                              <span className="text-gray-400">{new Date(e.date).toLocaleDateString("pt-PT")}</span>
                              {e.notes && <span className="text-gray-500 truncate max-w-[120px]">{e.notes}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </ProtectedPage>
  )
}



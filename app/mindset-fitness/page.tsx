"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import ProtectedPage from "@/components/protected-page"
import { Dumbbell, Activity, Calendar, Target, Utensils, TrendingUp } from "lucide-react"
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

  useEffect(() => {
    if (!user?.id || !supabase) return

    const loadData = async () => {
      setLoading(true)
      try {
        // Workouts do utilizador + templates (schema wger-inspired na Supabase)
        const { data: workoutsData } = await supabase
          .from("workouts")
          .select("*")
          .or(`user_id.eq.${user.id},is_template.eq.true`)
          .order("created_at", { ascending: false })

        setWorkouts((workoutsData as any[]) || [])

        // Últimas 10 sessões de treino (Supabase: date, start_time)
        const { data: sessionsData } = await supabase
          .from("workout_sessions")
          .select("*, workouts(name)")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .order("start_time", { ascending: false })
          .limit(10)

        setSessions((sessionsData as any[]) || [])

        // Últimas 7 refeições (Supabase: meals + meal_items)
        const { data: mealsData } = await supabase
          .from("meals")
          .select("id, meal_date, meal_type, meal_time")
          .eq("user_id", user.id)
          .order("meal_date", { ascending: false })
          .limit(7)

        setMeals((mealsData as any[]) || [])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user?.id])

  const totalWorkouts = workouts.length
  const totalSessions = sessions.length
  const lastSession = sessions[0]
  const weeklyMeals = meals.length

  return (
    <ProtectedPage redirectPath="/login?redirect=/mindset-fitness">
      <main className="min-h-screen bg-black text-white px-4 py-8 md:px-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Mindset & Fitness
            </h1>
            <p className="text-gray-400 text-sm md:text-base">
              Gestão integrada de treinos e nutrição, inspirada em plataformas como o wger
              ({` `}<a href="https://github.com/wger-project/wger" target="_blank" rel="noreferrer" className="underline text-[#D2A63C]">
                wger
              </a>
              ).
            </p>
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

          {/* Tabs principais: Treino e Nutrição */}
          <section>
            <Tabs defaultValue="workouts" className="w-full">
              <TabsList className="bg-gray-900 border border-gray-800">
                <TabsTrigger value="workouts">Treinos</TabsTrigger>
                <TabsTrigger value="nutrition">Nutrição</TabsTrigger>
              </TabsList>

              <TabsContent value="workouts" className="mt-4 space-y-4">
                <WorkoutManager />
                
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
                <NutritionManager />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </ProtectedPage>
  )
}



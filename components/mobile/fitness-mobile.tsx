"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dumbbell, Activity, Target, TrendingUp, Play, Clock, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function FitnessMobile() {
  const [workouts, setWorkouts] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'workouts' | 'sessions'>('workouts')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Carregar treinos
      const workoutsResponse = await fetch('/api/mindset-fitness/workouts?include_defaults=true')
      if (workoutsResponse.ok) {
        const workoutsData = await workoutsResponse.json()
        setWorkouts(workoutsData.workouts || [])
        
        // Se não houver treinos padrão, criar
        const hasDefaults = workoutsData.workouts?.some((w: any) => w.is_default)
        if (!hasDefaults && workoutsData.workouts?.length === 0) {
          await fetch('/api/mindset-fitness/workouts/defaults', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          loadData() // Recarregar
          return
        }
      }

      // Carregar sessões
      const sessionsResponse = await fetch('/api/mindset-fitness/workout-sessions?limit=10')
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json()
        setSessions(sessionsData.sessions || [])
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const startWorkout = async (workoutId: string) => {
    try {
      const response = await fetch('/api/mindset-fitness/workout-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout_id: workoutId, completed: false })
      })
      if (response.ok) {
        alert('Treino iniciado! Vai para a aba "Sessões" para completar.')
        loadData()
      }
    } catch (error) {
      console.error('Erro ao iniciar treino:', error)
    }
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="text-center mb-4">
        <Dumbbell className="w-10 h-10 text-[#D2A63C] mx-auto mb-2" />
        <h2 className="text-xl font-bold text-white">Fitness</h2>
        <p className="text-gray-400 text-xs">Treinos e Progresso</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={activeTab === 'workouts' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('workouts')}
          className={activeTab === 'workouts' ? 'bg-[#D2A63C] text-black' : ''}
        >
          Treinos
        </Button>
        <Button
          variant={activeTab === 'sessions' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('sessions')}
          className={activeTab === 'sessions' ? 'bg-[#D2A63C] text-black' : ''}
        >
          Sessões
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">A carregar...</div>
      ) : activeTab === 'workouts' ? (
        workouts.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#D2A63C]" />
                Treinos em breve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 text-xs">
                Os treinos padrão serão criados automaticamente.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {workouts.map((workout) => (
              <Card key={workout.id} className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-white text-sm">{workout.name}</CardTitle>
                    {workout.is_default && (
                      <Badge className="bg-[#D2A63C] text-black text-xs">Padrão</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {workout.description && (
                    <p className="text-gray-300 text-xs">{workout.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{workout.workout_type}</span>
                    <span>{workout.difficulty}</span>
                    {workout.duration_minutes && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {workout.duration_minutes} min
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => startWorkout(workout.id)}
                    size="sm"
                    className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black text-xs"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Iniciar Treino
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        sessions.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#D2A63C]" />
                Sem sessões
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 text-xs">
                Ainda não completaste nenhum treino.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card key={session.id} className="bg-gray-800 border-gray-700">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-white text-sm font-semibold">
                        {session.workouts?.name || 'Treino'}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        {session.duration_minutes && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {session.duration_minutes} min
                          </div>
                        )}
                        {session.completed_at && (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>
                  {session.rating && (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          className={star <= session.rating ? 'text-yellow-400 text-xs' : 'text-gray-600 text-xs'}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-3 text-center">
            <Activity className="w-6 h-6 text-[#D2A63C] mx-auto mb-1" />
            <p className="text-white text-xs font-medium">Treinos</p>
            <p className="text-[#D2A63C] text-lg font-bold">{workouts.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-3 text-center">
            <Target className="w-6 h-6 text-[#D2A63C] mx-auto mb-1" />
            <p className="text-white text-xs font-medium">Sessões</p>
            <p className="text-[#D2A63C] text-lg font-bold">{sessions.length}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


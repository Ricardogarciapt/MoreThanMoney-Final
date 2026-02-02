"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Brain, Dumbbell, Users, TrendingUp, Activity, UtensilsCrossed, MessageCircle } from "lucide-react"

export default function MindsetFitnessManager() {
  const [workouts, setWorkouts] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [meals, setMeals] = useState<any[]>([])
  const [mindsetSessions, setMindsetSessions] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalSessions: 0,
    totalMeals: 0,
    totalMindsetSessions: 0,
    activeUsers: 0
  })
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [users, setUsers] = useState<any[]>([])

  useEffect(() => {
    loadData()
    loadUsers()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Carregar estatísticas gerais
      const [workoutsRes, sessionsRes, mealsRes, mindsetRes] = await Promise.all([
        fetch('/api/mindset-fitness/workouts'),
        fetch('/api/mindset-fitness/workout-sessions?limit=50'),
        fetch('/api/mindset-fitness/meals?limit=50'),
        fetch('/api/mindset-fitness/mindset?limit=50')
      ])

      if (workoutsRes.ok) {
        const data = await workoutsRes.json()
        setWorkouts(data.workouts || [])
        setStats(prev => ({ ...prev, totalWorkouts: data.workouts?.length || 0 }))
      }

      if (sessionsRes.ok) {
        const data = await sessionsRes.json()
        setSessions(data.sessions || [])
        setStats(prev => ({ ...prev, totalSessions: data.sessions?.length || 0 }))
      }

      if (mealsRes.ok) {
        const data = await mealsRes.json()
        setMeals(data.meals || [])
        setStats(prev => ({ ...prev, totalMeals: data.meals?.length || 0 }))
      }

      if (mindsetRes.ok) {
        const data = await mindsetRes.json()
        setMindsetSessions(data.sessions || [])
        setStats(prev => ({ ...prev, totalMindsetSessions: data.sessions?.length || 0 }))
      }

      // Contar users únicos
      const uniqueUsers = new Set([
        ...(workouts.map((w: any) => w.user_id)),
        ...(sessions.map((s: any) => s.user_id)),
        ...(meals.map((m: any) => m.user_id)),
        ...(mindsetSessions.map((ms: any) => ms.user_id))
      ])
      setStats(prev => ({ ...prev, activeUsers: uniqueUsers.size }))
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Erro ao carregar users:', error)
    }
  }

  const createDefaultWorkouts = async () => {
    if (!selectedUserId) {
      alert('Seleciona um utilizador')
      return
    }

    try {
      const response = await fetch('/api/mindset-fitness/workouts/defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUserId })
      })

      if (response.ok) {
        alert('3 treinos padrão criados com sucesso!')
        loadData()
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao criar treinos')
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-[#D2A63C]/10 to-[#BB8525]/5 border-[#D2A63C]/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Dumbbell className="w-5 h-5 text-[#D2A63C]" />
              <p className="text-sm text-gray-400">Treinos</p>
            </div>
            <p className="text-2xl font-bold text-[#D2A63C]">{stats.totalWorkouts}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-blue-400" />
              <p className="text-sm text-gray-400">Sessões</p>
            </div>
            <p className="text-2xl font-bold text-blue-400">{stats.totalSessions}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <UtensilsCrossed className="w-5 h-5 text-green-400" />
              <p className="text-sm text-gray-400">Refeições</p>
            </div>
            <p className="text-2xl font-bold text-green-400">{stats.totalMeals}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-5 h-5 text-purple-400" />
              <p className="text-sm text-gray-400">Mindset</p>
            </div>
            <p className="text-2xl font-bold text-purple-400">{stats.totalMindsetSessions}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-yellow-400" />
              <p className="text-sm text-gray-400">Users Ativos</p>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{stats.activeUsers}</p>
          </CardContent>
        </Card>
      </div>

      {/* Ações Rápidas */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-[#D2A63C]">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 w-64">
                <SelectValue placeholder="Selecionar utilizador..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email} ({u.membership_type || 'member'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={createDefaultWorkouts}
              disabled={!selectedUserId}
              className="bg-[#D2A63C] hover:bg-[#BB8525]"
            >
              Criar 3 Treinos Padrão
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs para diferentes seções */}
      <Tabs defaultValue="workouts" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-900">
          <TabsTrigger value="workouts" className="data-[state=active]:bg-[#D2A63C]">
            <Dumbbell className="w-4 h-4 mr-2" />
            Treinos
          </TabsTrigger>
          <TabsTrigger value="sessions" className="data-[state=active]:bg-[#D2A63C]">
            <Activity className="w-4 h-4 mr-2" />
            Sessões
          </TabsTrigger>
          <TabsTrigger value="meals" className="data-[state=active]:bg-[#D2A63C]">
            <UtensilsCrossed className="w-4 h-4 mr-2" />
            Refeições
          </TabsTrigger>
          <TabsTrigger value="mindset" className="data-[state=active]:bg-[#D2A63C]">
            <Brain className="w-4 h-4 mr-2" />
            Mindset
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workouts" className="mt-4">
          <div className="space-y-3">
            {workouts.slice(0, 20).map((workout) => (
              <Card key={workout.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-white">{workout.name}</h3>
                        {workout.is_default && (
                          <Badge className="bg-[#D2A63C] text-black text-xs">Padrão</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mb-2">{workout.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{workout.workout_type}</span>
                        <span>{workout.difficulty}</span>
                        {workout.duration_minutes && <span>{workout.duration_minutes} min</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <div className="space-y-3">
            {sessions.slice(0, 20).map((session) => (
              <Card key={session.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white mb-2">
                    {session.workouts?.name || 'Treino'}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {session.duration_minutes && <span>{session.duration_minutes} min</span>}
                    {session.rating && <span>⭐ {session.rating}/5</span>}
                    <span>{new Date(session.started_at).toLocaleDateString('pt-PT')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="meals" className="mt-4">
          <div className="space-y-3">
            {meals.slice(0, 20).map((meal) => (
              <Card key={meal.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white mb-2 capitalize">{meal.meal_type}</h3>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{meal.total_calories?.toFixed(0) || 0} kcal</span>
                    <span>{meal.total_protein?.toFixed(1) || 0}g proteína</span>
                    <span>{new Date(meal.meal_date).toLocaleDateString('pt-PT')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="mindset" className="mt-4">
          <div className="space-y-3">
            {mindsetSessions.slice(0, 20).map((session) => (
              <Card key={session.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4 text-[#D2A63C]" />
                    <h3 className="font-semibold text-white capitalize">{session.mentor_type.replace('_', ' ')}</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-2 line-clamp-2">{session.user_message}</p>
                  <p className="text-xs text-gray-500">{new Date(session.created_at).toLocaleDateString('pt-PT')}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}


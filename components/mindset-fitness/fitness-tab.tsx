"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dumbbell, Play, CheckCircle, Calendar, UtensilsCrossed } from "lucide-react"
import WorkoutList from "./workout-list"
import MealJournal from "./meal-journal"
import WorkoutSessions from "./workout-sessions"

export default function FitnessTab() {
  const [workouts, setWorkouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWorkouts()
  }, [])

  const loadWorkouts = async () => {
    try {
      const response = await fetch('/api/mindset-fitness/workouts?include_defaults=true')
      if (response.ok) {
        const data = await response.json()
        setWorkouts(data.workouts || [])
        
        // Se não houver treinos padrão, criar
        const hasDefaults = data.workouts?.some((w: any) => w.is_default)
        if (!hasDefaults) {
          await fetch('/api/mindset-fitness/workouts/defaults', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          loadWorkouts() // Recarregar
        }
      }
    } catch (error) {
      console.error('Erro ao carregar treinos:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tabs defaultValue="workouts" className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-6 bg-gray-900">
        <TabsTrigger value="workouts" className="data-[state=active]:bg-[#D2A63C]">
          <Dumbbell className="w-4 h-4 mr-2" />
          Treinos
        </TabsTrigger>
        <TabsTrigger value="sessions" className="data-[state=active]:bg-[#D2A63C]">
          <Calendar className="w-4 h-4 mr-2" />
          Sessões
        </TabsTrigger>
        <TabsTrigger value="meals" className="data-[state=active]:bg-[#D2A63C]">
          <UtensilsCrossed className="w-4 h-4 mr-2" />
          Refeições
        </TabsTrigger>
      </TabsList>

      <TabsContent value="workouts">
        <WorkoutList workouts={workouts} onWorkoutUpdate={loadWorkouts} />
      </TabsContent>

      <TabsContent value="sessions">
        <WorkoutSessions />
      </TabsContent>

      <TabsContent value="meals">
        <MealJournal />
      </TabsContent>
    </Tabs>
  )
}


"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dumbbell, Activity, Target, TrendingUp } from "lucide-react"

export default function FitnessMobile() {
  const [workouts, setWorkouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Carregar treinos da API
    setLoading(false)
    setWorkouts([])
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="text-center mb-6">
        <Dumbbell className="w-12 h-12 text-[#D2A63C] mx-auto mb-2" />
        <h2 className="text-2xl font-bold text-white">Fitness</h2>
        <p className="text-gray-400 text-sm">Acompanhe seus treinos e progresso</p>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">A carregar...</div>
      ) : workouts.length === 0 ? (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#D2A63C]" />
              Treinos em breve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm">
              Os treinos estarão disponíveis em breve.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {workouts.map((workout) => (
            <Card key={workout.id} className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">{workout.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-sm">{workout.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <Activity className="w-8 h-8 text-[#D2A63C] mx-auto mb-2" />
            <p className="text-white text-sm font-medium">Treinos</p>
            <p className="text-[#D2A63C] text-lg font-bold">0</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <Target className="w-8 h-8 text-[#D2A63C] mx-auto mb-2" />
            <p className="text-white text-sm font-medium">Metas</p>
            <p className="text-[#D2A63C] text-lg font-bold">0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


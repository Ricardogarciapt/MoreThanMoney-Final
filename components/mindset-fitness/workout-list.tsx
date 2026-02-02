"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dumbbell, Play, Clock } from "lucide-react"

interface WorkoutListProps {
  workouts: any[]
  onWorkoutUpdate: () => void
}

export default function WorkoutList({ workouts, onWorkoutUpdate }: WorkoutListProps) {
  const startWorkout = async (workoutId: string) => {
    try {
      const response = await fetch('/api/mindset-fitness/workout-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout_id: workoutId, completed: false })
      })
      if (response.ok) {
        // Redirecionar para página de treino ativo ou mostrar modal
        alert('Treino iniciado! Vai para a aba "Sessões" para completar.')
      }
    } catch (error) {
      console.error('Erro ao iniciar treino:', error)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-500'
      case 'intermediate': return 'bg-yellow-500'
      case 'advanced': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="space-y-4">
      {workouts.length === 0 ? (
        <Card className="bg-gray-900 border-[#D2A63C]/30">
          <CardContent className="py-12 text-center">
            <Dumbbell className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">Ainda não tens treinos. Os treinos padrão serão criados automaticamente.</p>
          </CardContent>
        </Card>
      ) : (
        workouts.map((workout) => (
          <Card key={workout.id} className="bg-gray-900 border-[#D2A63C]/30">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-[#D2A63C] mb-2">{workout.name}</CardTitle>
                  {workout.description && (
                    <p className="text-gray-400 text-sm">{workout.description}</p>
                  )}
                </div>
                {workout.is_default && (
                  <Badge className="bg-[#D2A63C] text-black">Padrão</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Badge className={getDifficultyColor(workout.difficulty)}>
                  {workout.difficulty}
                </Badge>
                <Badge variant="outline">{workout.workout_type}</Badge>
                {workout.duration_minutes && (
                  <div className="flex items-center text-gray-400 text-sm">
                    <Clock className="w-4 h-4 mr-1" />
                    {workout.duration_minutes} min
                  </div>
                )}
              </div>

              {workout.exercises && workout.exercises.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-300 mb-2">Exercícios:</p>
                  <div className="space-y-1">
                    {workout.exercises.slice(0, 3).map((exercise: any, idx: number) => (
                      <div key={idx} className="text-sm text-gray-400">
                        • {exercise.name}
                        {exercise.sets && ` - ${exercise.sets} séries`}
                        {exercise.reps && ` x ${exercise.reps} reps`}
                      </div>
                    ))}
                    {workout.exercises.length > 3 && (
                      <div className="text-sm text-gray-500">
                        + {workout.exercises.length - 3} mais exercícios
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={() => startWorkout(workout.id)}
                className="w-full bg-[#D2A63C] hover:bg-[#BB8525]"
              >
                <Play className="w-4 h-4 mr-2" />
                Iniciar Treino
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}


"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Clock, CheckCircle } from "lucide-react"

export default function WorkoutSessions() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/mindset-fitness/workout-sessions?limit=20')
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Erro ao carregar sessões:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <Card className="bg-gray-900 border-[#D2A63C]/30">
          <CardContent className="py-12 text-center">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">Ainda não completaste nenhum treino.</p>
          </CardContent>
        </Card>
      ) : (
        sessions.map((session) => (
          <Card key={session.id} className="bg-gray-900 border-[#D2A63C]/30">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-[#D2A63C] mb-1">
                    {session.workouts?.name || 'Treino'}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(session.started_at)}
                    </div>
                    {session.duration_minutes && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {session.duration_minutes} min
                      </div>
                    )}
                  </div>
                </div>
                {session.completed_at && (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                )}
              </div>

              {session.rating && (
                <div className="mb-2">
                  <p className="text-sm text-gray-400">Avaliação:</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={star <= session.rating ? 'text-yellow-400' : 'text-gray-600'}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {session.notes && (
                <div className="mt-4">
                  <p className="text-sm text-gray-400 mb-1">Notas:</p>
                  <p className="text-sm text-gray-300">{session.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}


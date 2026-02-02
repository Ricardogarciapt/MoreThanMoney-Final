"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Users, Dumbbell, Plus, Edit, Trash2, X } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Badge } from "@/components/ui/badge"

export default function TrainerDashboard() {
  const { user } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [workouts, setWorkouts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState<any>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [workoutForm, setWorkoutForm] = useState({
    name: '',
    description: '',
    workout_type: 'strength',
    difficulty: 'beginner',
    duration_minutes: 45,
    exercises: [] as any[],
    is_active: true
  })

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    if (selectedUserId) {
      loadUserWorkouts()
    } else {
      setWorkouts([])
    }
  }, [selectedUserId])

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

  const loadUserWorkouts = async () => {
    try {
      const response = await fetch(`/api/mindset-fitness/workouts?trainer_id=${selectedUserId}`)
      if (response.ok) {
        const data = await response.json()
        setWorkouts(data.workouts || [])
      }
    } catch (error) {
      console.error('Erro ao carregar treinos:', error)
    }
  }

  const createDefaultWorkouts = async () => {
    if (!selectedUserId) {
      alert('Seleciona um utilizador')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/mindset-fitness/workouts/defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUserId })
      })

      if (response.ok) {
        alert('3 treinos padrão criados com sucesso!')
        loadUserWorkouts()
      } else {
        alert('Erro ao criar treinos')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao criar treinos')
    } finally {
      setLoading(false)
    }
  }

  const openEditDialog = (workout: any) => {
    setEditingWorkout(workout)
    setWorkoutForm({
      name: workout.name || '',
      description: workout.description || '',
      workout_type: workout.workout_type || 'strength',
      difficulty: workout.difficulty || 'beginner',
      duration_minutes: workout.duration_minutes || 45,
      exercises: workout.exercises || [],
      is_active: workout.is_active !== false
    })
    setShowEditDialog(true)
  }

  const saveWorkout = async () => {
    if (!editingWorkout) return

    setLoading(true)
    try {
      const response = await fetch('/api/mindset-fitness/workouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout_id: editingWorkout.id,
          ...workoutForm
        })
      })

      if (response.ok) {
        alert('Treino atualizado com sucesso!')
        setShowEditDialog(false)
        setEditingWorkout(null)
        loadUserWorkouts()
      } else {
        const error = await response.json()
        alert(error.error || 'Erro ao atualizar treino')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao atualizar treino')
    } finally {
      setLoading(false)
    }
  }

  const deleteWorkout = async (workoutId: string) => {
    if (!confirm('Tens certeza que queres deletar este treino?')) return

    setLoading(true)
    try {
      const response = await fetch(`/api/mindset-fitness/workouts?id=${workoutId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Treino deletado com sucesso!')
        loadUserWorkouts()
      } else {
        const error = await response.json()
        alert(error.error || 'Erro ao deletar treino')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao deletar treino')
    } finally {
      setLoading(false)
    }
  }

  const addExercise = () => {
    setWorkoutForm({
      ...workoutForm,
      exercises: [...workoutForm.exercises, { name: '', sets: 3, reps: 10, rest: 60 }]
    })
  }

  const updateExercise = (index: number, field: string, value: any) => {
    const updated = [...workoutForm.exercises]
    updated[index] = { ...updated[index], [field]: value }
    setWorkoutForm({ ...workoutForm, exercises: updated })
  }

  const removeExercise = (index: number) => {
    setWorkoutForm({
      ...workoutForm,
      exercises: workoutForm.exercises.filter((_, i) => i !== index)
    })
  }

  return (
    <Card className="bg-gray-900 border-[#D2A63C]/30">
      <CardHeader>
        <CardTitle className="text-[#D2A63C] flex items-center gap-2">
          <Users className="w-5 h-5" />
          Painel Personal Trainer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Selecionar Utilizador</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Escolhe um utilizador..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email} ({u.membership_level || 'member'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={createDefaultWorkouts}
            disabled={!selectedUserId || loading}
            className="w-full bg-[#D2A63C] hover:bg-[#BB8525]"
          >
            {loading ? (
              'A criar...'
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Criar 3 Treinos Padrão para Utilizador
              </>
            )}
          </Button>

          {selectedUserId && workouts.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-[#D2A63C] mb-4">Treinos do Utilizador</h3>
              <div className="space-y-3">
                {workouts.map((workout) => (
                  <Card key={workout.id} className="bg-gray-800 border-gray-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-white">{workout.name}</h4>
                            {workout.is_default && (
                              <Badge className="bg-[#D2A63C] text-black text-xs">Padrão</Badge>
                            )}
                            {!workout.is_active && (
                              <Badge variant="outline" className="text-xs">Inativo</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-400 mb-2">{workout.description}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>{workout.workout_type}</span>
                            <span>{workout.difficulty}</span>
                            {workout.duration_minutes && <span>{workout.duration_minutes} min</span>}
                            {workout.exercises && <span>{workout.exercises.length} exercícios</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(workout)}
                            className="text-[#D2A63C] hover:bg-[#D2A63C]/20"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!workout.is_default && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteWorkout(workout.id)}
                              className="text-red-400 hover:bg-red-400/20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Como Personal Trainer (VIP), podes criar, editar e gerir treinos para qualquer utilizador.
          </p>
        </div>

        {/* Dialog de Edição */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="bg-gray-900 border-[#D2A63C]/30 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#D2A63C]">Editar Treino</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Nome do Treino</label>
                <Input
                  value={workoutForm.name}
                  onChange={(e) => setWorkoutForm({ ...workoutForm, name: e.target.value })}
                  className="bg-gray-800"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Descrição</label>
                <Input
                  value={workoutForm.description}
                  onChange={(e) => setWorkoutForm({ ...workoutForm, description: e.target.value })}
                  className="bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Tipo</label>
                  <Select
                    value={workoutForm.workout_type}
                    onValueChange={(v) => setWorkoutForm({ ...workoutForm, workout_type: v })}
                  >
                    <SelectTrigger className="bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strength">Força</SelectItem>
                      <SelectItem value="cardio">Cardio</SelectItem>
                      <SelectItem value="flexibility">Flexibilidade</SelectItem>
                      <SelectItem value="endurance">Resistência</SelectItem>
                      <SelectItem value="hiit">HIIT</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Dificuldade</label>
                  <Select
                    value={workoutForm.difficulty}
                    onValueChange={(v) => setWorkoutForm({ ...workoutForm, difficulty: v })}
                  >
                    <SelectTrigger className="bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Iniciante</SelectItem>
                      <SelectItem value="intermediate">Intermediário</SelectItem>
                      <SelectItem value="advanced">Avançado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Duração (min)</label>
                  <Input
                    type="number"
                    value={workoutForm.duration_minutes}
                    onChange={(e) => setWorkoutForm({ ...workoutForm, duration_minutes: parseInt(e.target.value) || 0 })}
                    className="bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Exercícios</label>
                  <Button variant="outline" size="sm" onClick={addExercise}>
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {workoutForm.exercises.map((exercise, index) => (
                    <div key={index} className="grid grid-cols-5 gap-2 bg-gray-800 p-2 rounded">
                      <Input
                        placeholder="Nome"
                        value={exercise.name || ''}
                        onChange={(e) => updateExercise(index, 'name', e.target.value)}
                        className="bg-gray-700"
                      />
                      <Input
                        type="number"
                        placeholder="Séries"
                        value={exercise.sets || ''}
                        onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value) || 0)}
                        className="bg-gray-700"
                      />
                      <Input
                        type="number"
                        placeholder="Reps"
                        value={exercise.reps || ''}
                        onChange={(e) => updateExercise(index, 'reps', parseInt(e.target.value) || 0)}
                        className="bg-gray-700"
                      />
                      <Input
                        type="number"
                        placeholder="Descanso (s)"
                        value={exercise.rest || ''}
                        onChange={(e) => updateExercise(index, 'rest', parseInt(e.target.value) || 0)}
                        className="bg-gray-700"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExercise(index)}
                        className="text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={workoutForm.is_active}
                  onChange={(e) => setWorkoutForm({ ...workoutForm, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_active" className="text-sm text-gray-400">
                  Treino ativo
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={saveWorkout}
                  disabled={loading}
                  className="flex-1 bg-[#D2A63C] hover:bg-[#BB8525]"
                >
                  {loading ? 'A guardar...' : 'Guardar Alterações'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}


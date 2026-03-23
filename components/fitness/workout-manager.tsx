"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Dumbbell, Loader2, ChevronDown, ChevronRight, Play, Check, Calendar } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Workout {
  id: string
  name: string
  description?: string
  comment?: string
  is_template?: boolean
  is_active?: boolean
  created_at: string
}

interface WorkoutDay {
  id: string
  workout_id: string
  day_number: number
  description?: string
}

interface WorkoutSet {
  id: string
  exercise_id: string
  sets: number
  reps_min?: number
  reps_max?: number
  weight?: number
  duration_seconds?: number
  rest_seconds?: number
  order_index: number
  notes?: string
  exercises?: { id: string; name: string; category?: string; equipment?: string }
}

interface Exercise {
  id: string
  name: string
  category?: string
  equipment?: string
}

interface Props {
  onRefresh?: () => void
}

export default function WorkoutManager({ onRefresh }: Props) {
  const { toast } = useToast()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    comment: "",
    is_template: false
  })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [daysByWorkout, setDaysByWorkout] = useState<Record<string, WorkoutDay[]>>({})
  const [setsByDay, setSetsByDay] = useState<Record<string, WorkoutSet[]>>({})
  const [loadingDays, setLoadingDays] = useState<Record<string, boolean>>({})
  const [loadingSets, setLoadingSets] = useState<Record<string, boolean>>({})
  const [showAddDay, setShowAddDay] = useState<string | null>(null)
  const [dayForm, setDayForm] = useState({ day_number: 1, description: "" })
  const [savingDay, setSavingDay] = useState(false)
  const [showAddSet, setShowAddSet] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [setForm, setSetForm] = useState({
    exercise_id: "",
    sets: 3,
    reps_min: "",
    reps_max: "",
    weight: "",
    rest_seconds: 60,
    notes: ""
  })
  const [savingSet, setSavingSet] = useState(false)
  const [startingSession, setStartingSession] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [completingSession, setCompletingSession] = useState<string | null>(null)
  const [sessionRating, setSessionRating] = useState<Record<string, number>>({})
  const [setsLoadedForDays, setSetsLoadedForDays] = useState<Set<string>>(new Set())

  const loadWorkouts = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/fitness/workouts', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setWorkouts(data.workouts || [])
      }
    } catch (error) {
      console.error('Erro ao carregar workouts:', error)
      toast({ title: "❌ Erro", description: "Erro ao carregar planos de treino", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadWorkouts()
  }, [loadWorkouts])

  const loadDays = async (workoutId: string) => {
    setLoadingDays((p) => ({ ...p, [workoutId]: true }))
    try {
      const res = await fetch(`/api/fitness/workouts/${workoutId}/days`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setDaysByWorkout((p) => ({ ...p, [workoutId]: data.days || [] }))
      }
    } finally {
      setLoadingDays((p) => ({ ...p, [workoutId]: false }))
    }
  }

  const loadSets = useCallback(async (dayId: string) => {
    setLoadingSets((p) => ({ ...p, [dayId]: true }))
    try {
      const res = await fetch(`/api/fitness/workout-days/${dayId}/sets`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSetsByDay((p) => ({ ...p, [dayId]: data.sets || [] }))
        setSetsLoadedForDays((prev) => new Set(prev).add(dayId))
      }
    } finally {
      setLoadingSets((p) => ({ ...p, [dayId]: false }))
    }
  }, [])

  const loadExercises = async () => {
    const res = await fetch('/api/fitness/exercises', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setExercises(data.exercises || [])
    }
  }

  const toggleExpand = (workout: Workout) => {
    const id = workout.id
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!daysByWorkout[id]?.length) loadDays(id)
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({ title: "⚠️ Aviso", description: "Nome é obrigatório", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/fitness/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      })
      if (response.ok) {
        toast({ title: "✅ Sucesso", description: "Plano de treino criado com sucesso" })
        setShowCreateDialog(false)
        setFormData({ name: "", description: "", comment: "", is_template: false })
        loadWorkouts()
        onRefresh?.()
      } else {
        const data = await response.json()
        toast({ title: "❌ Erro", description: data.error || "Erro ao criar plano", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "❌ Erro", description: "Erro ao criar plano", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleAddDay = async (workoutId: string) => {
    setSavingDay(true)
    try {
      const res = await fetch(`/api/fitness/workouts/${workoutId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ day_number: dayForm.day_number, description: dayForm.description || undefined })
      })
      if (res.ok) {
        setShowAddDay(null)
        setDayForm({ day_number: 1, description: "" })
        loadDays(workoutId)
        onRefresh?.()
        toast({ title: "✅ Dia adicionado" })
      } else {
        const d = await res.json()
        toast({ title: "❌ Erro", description: d.error || "Erro ao adicionar dia", variant: "destructive" })
      }
    } finally {
      setSavingDay(false)
    }
  }

  const openAddSet = (dayId: string) => {
    setShowAddSet(dayId)
    if (exercises.length === 0) loadExercises()
    setSetForm({ exercise_id: "", sets: 3, reps_min: "", reps_max: "", weight: "", rest_seconds: 60, notes: "" })
  }

  const handleAddSet = async (dayId: string) => {
    if (!setForm.exercise_id) {
      toast({ title: "⚠️ Escolhe um exercício", variant: "destructive" })
      return
    }
    setSavingSet(true)
    try {
      const res = await fetch(`/api/fitness/workout-days/${dayId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          exercise_id: setForm.exercise_id,
          sets: setForm.sets,
          reps_min: setForm.reps_min ? parseInt(String(setForm.reps_min), 10) : undefined,
          reps_max: setForm.reps_max ? parseInt(String(setForm.reps_max), 10) : undefined,
          weight: setForm.weight ? parseFloat(String(setForm.weight)) : undefined,
          rest_seconds: setForm.rest_seconds,
          notes: setForm.notes || undefined
        })
      })
      if (res.ok) {
        setShowAddSet(null)
        loadSets(dayId)
        onRefresh?.()
        toast({ title: "✅ Set adicionado" })
      } else {
        const d = await res.json()
        toast({ title: "❌ Erro", description: d.error || "Erro ao adicionar set", variant: "destructive" })
      }
    } finally {
      setSavingSet(false)
    }
  }

  const startSession = async (workoutId: string, workoutDayId?: string) => {
    setStartingSession(workoutId)
    try {
      const res = await fetch('/api/fitness/workout-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workout_id: workoutId,
          workout_day_id: workoutDayId || undefined,
          date: new Date().toISOString().split('T')[0],
          start_time: new Date().toISOString()
        })
      })
      if (res.ok) {
        const data = await res.json()
        setActiveSessionId(data.session?.id || null)
        onRefresh?.()
        toast({ title: "✅ Sessão iniciada!" })
      } else {
        const d = await res.json()
        toast({ title: "❌ Erro", description: d.error || "Erro ao iniciar sessão", variant: "destructive" })
      }
    } finally {
      setStartingSession(null)
    }
  }

  const completeSession = async (sessionId: string) => {
    setCompletingSession(sessionId)
    try {
      const res = await fetch('/api/fitness/workout-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: sessionId,
          end_time: new Date().toISOString(),
          duration_minutes: null,
          rating: sessionRating[sessionId] || undefined
        })
      })
      if (res.ok) {
        setActiveSessionId(null)
        setSessionRating((p) => {
          const next = { ...p }
          delete next[sessionId]
          return next
        })
        onRefresh?.()
        toast({ title: "✅ Sessão concluída!" })
      }
    } finally {
      setCompletingSession(null)
    }
  }

  const dayLabels: Record<number, string> = {
    1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 7: "Domingo"
  }

  // Carregar sets de cada dia quando o plano está expandido e os dias já foram carregados
  useEffect(() => {
    if (!expandedId) return
    const days = daysByWorkout[expandedId] || []
    days.forEach((day) => {
      if (setsLoadedForDays.has(day.id)) return
      loadSets(day.id)
    })
  }, [expandedId, daysByWorkout, setsLoadedForDays, loadSets])

  return (
    <Card className="bg-gray-900 border-[#D2A63C]/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#D2A63C] flex items-center gap-2">
            <Dumbbell className="w-5 h-5" />
            Planos de Treino
          </CardTitle>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                <Plus className="w-4 h-4 mr-2" />
                Novo Plano
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-[#D2A63C]">Criar Plano de Treino</DialogTitle>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Nome *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Ex: Treino de Força"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Descrição</label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Descrição do plano..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Notas</label>
                  <Textarea
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Notas pessoais..."
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_template"
                    checked={formData.is_template}
                    onChange={(e) => setFormData({ ...formData, is_template: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_template" className="text-sm text-gray-400">
                    Tornar este plano um template público
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreate}
                    disabled={saving || !formData.name.trim()}
                    className="flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {saving ? "A criar..." : "Criar"}
                  </Button>
                  <Button
                    onClick={() => setShowCreateDialog(false)}
                    variant="outline"
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
          </div>
        ) : workouts.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            Ainda não tens planos de treino. Cria o teu primeiro plano!
          </p>
        ) : (
          <div className="space-y-3">
            {workouts.map((workout) => {
              const expanded = expandedId === workout.id
              const days = daysByWorkout[workout.id] || []
              const loadingD = loadingDays[workout.id]
              return (
                <div
                  key={workout.id}
                  className="rounded-lg border border-gray-800 bg-gray-950/60 overflow-hidden"
                >
                  <div
                    className="p-4 flex items-start justify-between cursor-pointer hover:bg-gray-950/80 transition-colors"
                    onClick={() => toggleExpand(workout)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {expanded ? (
                        <ChevronDown className="w-5 h-5 text-[#D2A63C] shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-white">{workout.name}</h3>
                          {workout.is_template && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D2A63C] text-black">
                              Template
                            </span>
                          )}
                        </div>
                        {workout.description && (
                          <p className="text-sm text-gray-400 truncate">{workout.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(workout.created_at).toLocaleDateString('pt-PT')}
                        </p>
                      </div>
                    </div>
                    {!workout.is_template && (
                      <Button
                        size="sm"
                        className="bg-[#D2A63C] text-black hover:bg-[#BB8525] shrink-0 ml-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          startSession(workout.id)
                        }}
                        disabled={!!startingSession}
                      >
                        {startingSession === workout.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            Iniciar
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {expanded && (
                    <div className="border-t border-gray-800 px-4 pb-4 pt-2">
                      {loadingD ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-gray-400">Dias do plano</span>
                            {!workout.is_template && (
                              <Dialog open={showAddDay === workout.id} onOpenChange={(o) => !o && setShowAddDay(null)}>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-gray-700 text-gray-300"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setShowAddDay(workout.id)
                                      setDayForm({ day_number: 1, description: "" })
                                    }}
                                  >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Adicionar dia
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white">
                                  <DialogHeader>
                                    <DialogTitle className="text-[#D2A63C]">Adicionar dia</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4 mt-4">
                                    <div>
                                      <label className="text-sm text-gray-400 block mb-1">Dia da semana (1–7)</label>
                                      <Select
                                        value={String(dayForm.day_number)}
                                        onValueChange={(v) => setDayForm((f) => ({ ...f, day_number: parseInt(v, 10) }))}
                                      >
                                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                              {dayLabels[n]}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-sm text-gray-400 block mb-1">Descrição (opcional)</label>
                                      <Input
                                        value={dayForm.description}
                                        onChange={(e) => setDayForm((f) => ({ ...f, description: e.target.value }))}
                                        className="bg-gray-800 border-gray-700 text-white"
                                        placeholder="Ex: Peito e tríceps"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        onClick={() => handleAddDay(workout.id)}
                                        disabled={savingDay}
                                        className="bg-[#D2A63C] text-black"
                                      >
                                        {savingDay ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                        Guardar
                                      </Button>
                                      <Button variant="outline" onClick={() => setShowAddDay(null)} className="border-gray-700">
                                        Cancelar
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>

                          {days.length === 0 ? (
                            <p className="text-sm text-gray-500 py-2">
                              Nenhum dia definido. Adiciona dias e depois exercícios a cada dia.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {days.map((day) => {
                                const sets = setsByDay[day.id] || []
                                const loadingS = loadingSets[day.id]
                                return (
                                  <div key={day.id} className="rounded border border-gray-800 bg-gray-900/60 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-white">
                                        {dayLabels[day.day_number] || `Dia ${day.day_number}`}
                                        {day.description ? ` — ${day.description}` : ""}
                                      </span>
                                      {!workout.is_template && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-[#D2A63C] hover:bg-[#D2A63C]/10"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              startSession(workout.id, day.id)
                                            }}
                                            disabled={!!startingSession}
                                          >
                                            <Play className="w-4 h-4 mr-1" />
                                            Iniciar este dia
                                          </Button>
                                          <Dialog open={showAddSet === day.id} onOpenChange={(o) => !o && setShowAddSet(null)}>
                                            <DialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-gray-700"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  openAddSet(day.id)
                                                }}
                                              >
                                                <Plus className="w-4 h-4 mr-1" />
                                                Set
                                              </Button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white max-h-[90vh] overflow-y-auto">
                                              <DialogHeader>
                                                <DialogTitle className="text-[#D2A63C]">Adicionar exercício ao dia</DialogTitle>
                                              </DialogHeader>
                                              <div className="space-y-4 mt-4">
                                                <div>
                                                  <label className="text-sm text-gray-400 block mb-1">Exercício *</label>
                                                  <Select
                                                    value={setForm.exercise_id}
                                                    onValueChange={(v) => setSetForm((f) => ({ ...f, exercise_id: v }))}
                                                  >
                                                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                                                      <SelectValue placeholder="Escolher exercício" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {exercises.map((ex) => (
                                                        <SelectItem key={ex.id} value={ex.id}>
                                                          {ex.name}
                                                          {ex.category ? ` (${ex.category})` : ""}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                  <div>
                                                    <label className="text-sm text-gray-400 block mb-1">Sets</label>
                                                    <Input
                                                      type="number"
                                                      min={1}
                                                      value={setForm.sets}
                                                      onChange={(e) => setSetForm((f) => ({ ...f, sets: parseInt(e.target.value, 10) || 3 }))}
                                                      className="bg-gray-800 border-gray-700 text-white"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="text-sm text-gray-400 block mb-1">Reps min</label>
                                                    <Input
                                                      type="number"
                                                      placeholder="—"
                                                      value={setForm.reps_min}
                                                      onChange={(e) => setSetForm((f) => ({ ...f, reps_min: e.target.value }))}
                                                      className="bg-gray-800 border-gray-700 text-white"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="text-sm text-gray-400 block mb-1">Reps max</label>
                                                    <Input
                                                      type="number"
                                                      placeholder="—"
                                                      value={setForm.reps_max}
                                                      onChange={(e) => setSetForm((f) => ({ ...f, reps_max: e.target.value }))}
                                                      className="bg-gray-800 border-gray-700 text-white"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="text-sm text-gray-400 block mb-1">Peso (kg)</label>
                                                    <Input
                                                      type="number"
                                                      step="0.1"
                                                      placeholder="—"
                                                      value={setForm.weight}
                                                      onChange={(e) => setSetForm((f) => ({ ...f, weight: e.target.value }))}
                                                      className="bg-gray-800 border-gray-700 text-white"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="text-sm text-gray-400 block mb-1">Descanso (s)</label>
                                                    <Input
                                                      type="number"
                                                      value={setForm.rest_seconds}
                                                      onChange={(e) => setSetForm((f) => ({ ...f, rest_seconds: parseInt(e.target.value, 10) || 60 }))}
                                                      className="bg-gray-800 border-gray-700 text-white"
                                                    />
                                                  </div>
                                                </div>
                                                <div>
                                                  <label className="text-sm text-gray-400 block mb-1">Notas</label>
                                                  <Input
                                                    value={setForm.notes}
                                                    onChange={(e) => setSetForm((f) => ({ ...f, notes: e.target.value }))}
                                                    className="bg-gray-800 border-gray-700 text-white"
                                                    placeholder="Opcional"
                                                  />
                                                </div>
                                                <div className="flex gap-2">
                                                  <Button
                                                    onClick={() => handleAddSet(day.id)}
                                                    disabled={savingSet || !setForm.exercise_id}
                                                    className="bg-[#D2A63C] text-black"
                                                  >
                                                    {savingSet ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                                    Adicionar
                                                  </Button>
                                                  <Button variant="outline" onClick={() => setShowAddSet(null)} className="border-gray-700">
                                                    Cancelar
                                                  </Button>
                                                </div>
                                              </div>
                                            </DialogContent>
                                          </Dialog>
                                        </>
                                      )}
                                    </div>
                                    {loadingS ? (
                                      <div className="flex justify-center py-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-[#D2A63C]" />
                                      </div>
                                    ) : sets.length === 0 ? (
                                      <p className="text-sm text-gray-500">Nenhum exercício neste dia.</p>
                                    ) : (
                                      <ul className="space-y-1.5">
                                        {sets.map((s) => (
                                          <li
                                            key={s.id}
                                            className="flex justify-between items-center text-sm py-1.5 border-b border-gray-800/50 last:border-0"
                                          >
                                            <span className="text-white">{s.exercises?.name || "Exercício"}</span>
                                            <span className="text-gray-400">
                                              {s.sets}× {s.reps_min != null || s.reps_max != null
                                                ? `${s.reps_min ?? "?"}-${s.reps_max ?? "?"} reps`
                                                : s.duration_seconds
                                                  ? `${s.duration_seconds}s`
                                                  : "—"}
                                              {s.weight ? ` @ ${s.weight} kg` : ""}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Dumbbell, Edit, Trash2, Loader2 } from "lucide-react"
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

export default function WorkoutManager() {
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

  useEffect(() => {
    loadWorkouts()
  }, [])

  const loadWorkouts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/fitness/workouts?include_templates=true', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setWorkouts(data.workouts || [])
      }
    } catch (error) {
      console.error('Erro ao carregar workouts:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao carregar planos de treino",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "⚠️ Aviso",
        description: "Nome é obrigatório",
        variant: "destructive"
      })
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
        toast({
          title: "✅ Sucesso",
          description: "Plano de treino criado com sucesso",
        })
        setShowCreateDialog(false)
        setFormData({ name: "", description: "", comment: "", is_template: false })
        loadWorkouts()
      } else {
        const data = await response.json()
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao criar plano de treino",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao criar workout:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao criar plano de treino",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

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
            <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white">
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
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        A criar...
                      </>
                    ) : (
                      "Criar"
                    )}
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
            {workouts.map((workout) => (
              <div
                key={workout.id}
                className="p-4 rounded-lg border border-gray-800 bg-gray-950/60 hover:bg-gray-950/80 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">{workout.name}</h3>
                      {workout.is_template && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D2A63C] text-black">
                          Template
                        </span>
                      )}
                    </div>
                    {workout.description && (
                      <p className="text-sm text-gray-400 mb-2">{workout.description}</p>
                    )}
                    {workout.comment && (
                      <p className="text-xs text-gray-500 italic">{workout.comment}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(workout.created_at).toLocaleDateString('pt-PT')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



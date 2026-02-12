"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Utensils, Loader2, Calendar } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Meal {
  id: string
  meal_type: string
  meal_date: string
  meal_time?: string
  notes?: string
  total_calories?: number
  total_protein?: number
  total_carbs?: number
  total_fat?: number
  meal_items?: Array<{
    id: string
    amount: number
    unit: string
    ingredient: {
      id: string
      name: string
      energy_kcal?: number
      protein?: number
      carbs?: number
      fat?: number
    }
  }>
}

export default function NutritionManager() {
  const { toast } = useToast()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [formData, setFormData] = useState({
    meal_type: "breakfast",
    meal_date: new Date().toISOString().split('T')[0],
    meal_time: new Date().toTimeString().slice(0, 5),
    notes: ""
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadMeals()
  }, [])

  const loadMeals = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/fitness/nutrition/meals?limit=20', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setMeals(data.meals || [])
      }
    } catch (error) {
      console.error('Erro ao carregar refeições:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao carregar refeições",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.meal_type || !formData.meal_date) {
      toast({
        title: "⚠️ Aviso",
        description: "Tipo e data são obrigatórios",
        variant: "destructive"
      })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/fitness/nutrition/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast({
          title: "✅ Sucesso",
          description: "Refeição registada com sucesso",
        })
        setShowCreateDialog(false)
        setFormData({
          meal_type: "breakfast",
          meal_date: new Date().toISOString().split('T')[0],
          meal_time: new Date().toTimeString().slice(0, 5),
          notes: ""
        })
        loadMeals()
      } else {
        const data = await response.json()
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao registar refeição",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao criar refeição:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao registar refeição",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const getMealTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      breakfast: "Pequeno-almoço",
      lunch: "Almoço",
      dinner: "Jantar",
      snack: "Lanche",
      other: "Outro"
    }
    return labels[type] || type
  }

  return (
    <Card className="bg-gray-900 border-[#D2A63C]/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#D2A63C] flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            Registo de Refeições
          </CardTitle>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                <Plus className="w-4 h-4 mr-2" />
                Nova Refeição
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white">
              <DialogHeader>
                <DialogTitle className="text-[#D2A63C]">Registar Refeição</DialogTitle>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Tipo de Refeição *</label>
                  <Select
                    value={formData.meal_type}
                    onValueChange={(value) => setFormData({ ...formData, meal_type: value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Pequeno-almoço</SelectItem>
                      <SelectItem value="lunch">Almoço</SelectItem>
                      <SelectItem value="dinner">Jantar</SelectItem>
                      <SelectItem value="snack">Lanche</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Data *</label>
                    <Input
                      type="date"
                      value={formData.meal_date}
                      onChange={(e) => setFormData({ ...formData, meal_date: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Hora</label>
                    <Input
                      type="time"
                      value={formData.meal_time}
                      onChange={(e) => setFormData({ ...formData, meal_time: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Notas</label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Notas sobre a refeição..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreate}
                    disabled={saving}
                    className="flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        A registar...
                      </>
                    ) : (
                      "Registar"
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
        ) : meals.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            Ainda não registaste refeições. Começa a registar as tuas refeições!
          </p>
        ) : (
          <div className="space-y-3">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className="p-4 rounded-lg border border-gray-800 bg-gray-950/60 hover:bg-gray-950/80 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-white">
                        {new Date(meal.meal_date).toLocaleDateString('pt-PT')}
                      </span>
                      {meal.meal_time && (
                        <span className="text-sm text-gray-400">
                          {meal.meal_time}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#D2A63C] font-medium">
                      {getMealTypeLabel(meal.meal_type)}
                    </p>
                  </div>
                </div>
                {meal.total_calories !== undefined && (
                  <div className="mt-2 pt-2 border-t border-gray-800">
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">Cal:</span>
                        <span className="text-white ml-1">{meal.total_calories}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Prot:</span>
                        <span className="text-white ml-1">{meal.total_protein?.toFixed(1) || 0}g</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Carbs:</span>
                        <span className="text-white ml-1">{meal.total_carbs?.toFixed(1) || 0}g</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Gord:</span>
                        <span className="text-white ml-1">{meal.total_fat?.toFixed(1) || 0}g</span>
                      </div>
                    </div>
                  </div>
                )}
                {meal.notes && (
                  <p className="text-xs text-gray-500 italic mt-2">{meal.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



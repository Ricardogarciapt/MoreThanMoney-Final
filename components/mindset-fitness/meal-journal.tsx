"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UtensilsCrossed, Plus, Brain } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export default function MealJournal() {
  const [meals, setMeals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [newMeal, setNewMeal] = useState({
    meal_type: 'breakfast',
    meal_date: new Date().toISOString().split('T')[0],
    meal_time: new Date().toTimeString().slice(0, 5),
    foods: [{ name: '', quantity: 1, unit: 'porção', calories: 0, protein: 0, carbs: 0, fats: 0 }],
    notes: ''
  })

  useEffect(() => {
    loadMeals()
  }, [])

  const loadMeals = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch(`/api/mindset-fitness/meals?date=${today}`)
      if (response.ok) {
        const data = await response.json()
        setMeals(data.meals || [])
      }
    } catch (error) {
      console.error('Erro ao carregar refeições:', error)
    } finally {
      setLoading(false)
    }
  }

  const addFood = () => {
    setNewMeal({
      ...newMeal,
      foods: [...newMeal.foods, { name: '', quantity: 1, unit: 'porção', calories: 0, protein: 0, carbs: 0, fats: 0 }]
    })
  }

  const updateFood = (index: number, field: string, value: any) => {
    const updatedFoods = [...newMeal.foods]
    updatedFoods[index] = { ...updatedFoods[index], [field]: value }
    setNewMeal({ ...newMeal, foods: updatedFoods })
  }

  const saveMeal = async () => {
    try {
      const response = await fetch('/api/mindset-fitness/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMeal)
      })

      if (response.ok) {
        setShowAddMeal(false)
        setNewMeal({
          meal_type: 'breakfast',
          meal_date: new Date().toISOString().split('T')[0],
          meal_time: new Date().toTimeString().slice(0, 5),
          foods: [{ name: '', quantity: 1, unit: 'porção', calories: 0, protein: 0, carbs: 0, fats: 0 }],
          notes: ''
        })
        loadMeals()
      }
    } catch (error) {
      console.error('Erro ao salvar refeição:', error)
    }
  }

  const getMealTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      breakfast: 'Pequeno-almoço',
      lunch: 'Almoço',
      dinner: 'Jantar',
      snack: 'Lanche',
      other: 'Outro'
    }
    return labels[type] || type
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-[#D2A63C]">Journal de Refeições</h3>
        <Dialog open={showAddMeal} onOpenChange={setShowAddMeal}>
          <DialogTrigger asChild>
            <Button className="bg-[#D2A63C] hover:bg-[#BB8525]">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Refeição
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-[#D2A63C]/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#D2A63C]">Nova Refeição</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Tipo</label>
                  <Select value={newMeal.meal_type} onValueChange={(v) => setNewMeal({ ...newMeal, meal_type: v })}>
                    <SelectTrigger className="bg-gray-800">
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
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Data</label>
                  <Input
                    type="date"
                    value={newMeal.meal_date}
                    onChange={(e) => setNewMeal({ ...newMeal, meal_date: e.target.value })}
                    className="bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Alimentos</label>
                {newMeal.foods.map((food, index) => (
                  <div key={index} className="grid grid-cols-4 gap-2 mb-2">
                    <Input
                      placeholder="Nome do alimento"
                      value={food.name}
                      onChange={(e) => updateFood(index, 'name', e.target.value)}
                      className="bg-gray-800"
                    />
                    <Input
                      type="number"
                      placeholder="Quantidade"
                      value={food.quantity}
                      onChange={(e) => updateFood(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="bg-gray-800"
                    />
                    <Input
                      placeholder="Calorias"
                      type="number"
                      value={food.calories}
                      onChange={(e) => updateFood(index, 'calories', parseFloat(e.target.value) || 0)}
                      className="bg-gray-800"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = newMeal.foods.filter((_, i) => i !== index)
                        setNewMeal({ ...newMeal, foods: updated })
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button variant="outline" onClick={addFood} className="w-full mt-2">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Alimento
                </Button>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Notas</label>
                <Input
                  value={newMeal.notes}
                  onChange={(e) => setNewMeal({ ...newMeal, notes: e.target.value })}
                  placeholder="Notas sobre a refeição..."
                  className="bg-gray-800"
                />
              </div>

              <Button onClick={saveMeal} className="w-full bg-[#D2A63C] hover:bg-[#BB8525]">
                Salvar Refeição
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {meals.length === 0 ? (
        <Card className="bg-gray-900 border-[#D2A63C]/30">
          <CardContent className="py-12 text-center">
            <UtensilsCrossed className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">Ainda não registaste refeições hoje.</p>
          </CardContent>
        </Card>
      ) : (
        meals.map((meal) => (
          <Card key={meal.id} className="bg-gray-900 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C]">
                {getMealTypeLabel(meal.meal_type)}
                {meal.meal_time && ` - ${meal.meal_time}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-400">Calorias</p>
                  <p className="text-lg font-semibold">{meal.total_calories?.toFixed(0) || 0} kcal</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Proteína</p>
                  <p className="text-lg font-semibold">{meal.total_protein?.toFixed(1) || 0}g</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Carboidratos</p>
                  <p className="text-lg font-semibold">{meal.total_carbs?.toFixed(1) || 0}g</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Gorduras</p>
                  <p className="text-lg font-semibold">{meal.total_fats?.toFixed(1) || 0}g</p>
                </div>
              </div>

              {meal.ai_analysis && (
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-[#D2A63C]" />
                    <p className="text-sm font-semibold text-[#D2A63C]">Análise IA</p>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{meal.ai_analysis}</p>
                </div>
              )}

              {meal.foods && meal.foods.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-300 mb-2">Alimentos:</p>
                  <div className="space-y-1">
                    {meal.foods.map((food: any, idx: number) => (
                      <div key={idx} className="text-sm text-gray-400">
                        • {food.name} ({food.quantity} {food.unit || 'porção'})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}


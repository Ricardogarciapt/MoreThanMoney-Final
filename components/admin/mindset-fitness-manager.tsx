"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, Dumbbell } from "lucide-react"

export default function MindsetFitnessManager() {

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-200">Resumo Mindset & Fitness</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-gray-800/50 border-purple-500/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/20">
              <Dumbbell className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Treinos</p>
              <p className="text-2xl font-bold text-purple-300">—</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800/50 border-purple-500/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/20">
              <Brain className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Sessões de treino</p>
              <p className="text-2xl font-bold text-purple-300">—</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-purple-500/20 bg-gray-800/30 p-4">
        <p className="text-sm text-gray-400">
          Gestão detalhada de treinos, refeições e sessões de mindset através das APIs{" "}
          <code className="text-purple-300">/api/mindset-fitness/*</code>. Utilizadores gerem os seus dados na área de membros.
        </p>
        <Badge variant="secondary" className="mt-2 bg-purple-500/20 text-purple-300 border-purple-500/40">
          Conectado ao Supabase
        </Badge>
      </div>
    </div>
  )
}

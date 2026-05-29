"use client"

import { Brain, ExternalLink, Sparkles } from "lucide-react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

export default function MindsetMobile() {
  return (
    <div className="min-h-[60vh] h-full bg-black text-white p-4">
      <h2 className="text-xl font-bold text-[#D2A63C] mb-4 flex items-center gap-2">
        <Brain className="w-6 h-6" />
        Mindset
      </h2>

      <Card className="bg-gray-900 border-[#D2A63C]/20 mb-4">
        <CardContent className="p-4">
          <p className="text-gray-300 text-sm mb-3">
            O mindset é a base para resultados duradouros: na vida e nos mercados.
          </p>
          <p className="text-gray-400 text-sm">
            Trabalha a mentalidade, define objetivos e acompanha o teu progresso na área Mindset & Fitness.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2 mb-6">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/80 border border-gray-800">
          <Sparkles className="w-5 h-5 text-[#D2A63C] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-white">Foco e disciplina</p>
            <p className="text-xs text-gray-400">Treino mental tão importante como o físico.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/80 border border-gray-800">
          <Sparkles className="w-5 h-5 text-[#D2A63C] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-white">Objetivos e sessões</p>
            <p className="text-xs text-gray-400">Regista metas e reflexões na plataforma completa.</p>
          </div>
        </div>
      </div>

      <Link
        href="/mindset-fitness"
        className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-[#D2A63C] text-black font-semibold hover:bg-[#BB8525] transition-colors"
      >
        <ExternalLink className="w-5 h-5" />
        Abrir Mindset & Fitness completo
      </Link>
    </div>
  )
}

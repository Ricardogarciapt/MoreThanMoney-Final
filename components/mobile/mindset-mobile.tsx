"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Brain, BookOpen, Target, TrendingUp } from "lucide-react"

export default function MindsetMobile() {
  const [content, setContent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Carregar conteúdo de mindset da API
    setLoading(false)
    setContent([])
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="text-center mb-6">
        <Brain className="w-12 h-12 text-[#D2A63C] mx-auto mb-2" />
        <h2 className="text-2xl font-bold text-white">Mindset</h2>
        <p className="text-gray-400 text-sm">Desenvolva sua mentalidade de sucesso</p>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">A carregar...</div>
      ) : content.length === 0 ? (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#D2A63C]" />
              Conteúdo em breve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm">
              O conteúdo de mindset estará disponível em breve.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {content.map((item) => (
            <Card key={item.id} className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-sm">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <Target className="w-8 h-8 text-[#D2A63C] mx-auto mb-2" />
            <p className="text-white text-sm font-medium">Metas</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-8 h-8 text-[#D2A63C] mx-auto mb-2" />
            <p className="text-white text-sm font-medium">Progresso</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


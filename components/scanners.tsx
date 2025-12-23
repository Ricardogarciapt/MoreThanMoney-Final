"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import TradingViewWidget from "./trading-view-widget"
import { Loader2 } from "lucide-react"

interface ScannerContent {
  mtmVideoId: string
  mtmDescription: string
}

export default function Scanners() {
  const [content, setContent] = useState<ScannerContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchContent()
  }, [])

  const fetchContent = async () => {
    try {
      const response = await fetch("/api/content/scanner")
      if (!response.ok) throw new Error("Erro ao carregar conteúdo")
      const data = await response.json()
      setContent(data)
    } catch (error) {
      console.error("Erro ao carregar conteúdo:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Scanner MTM */}
      <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600">
              Scanner MTM ao Vivo
            </h3>
            <p className="text-gray-300 max-w-3xl mx-auto">
              {content?.mtmDescription || "Visualiza em tempo real as estruturas de mercado com base no nosso indicador exclusivo 'MoreThanMoney Scanner V3.4'. Ideal para iniciantes – sem complicações, só sinais claros."}
            </p>
          </div>

          <div className="mt-8 rounded-lg overflow-hidden border border-gold-500/30">
            <TradingViewWidget />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import TradingViewWidget from "@/components/trading-view-widget"
import ProtectedPage from "@/components/protected-page"
import { useToast } from "@/hooks/use-toast"
import { 
  House,
  ChevronRight,
  BarChart3,
  Save,
  FolderOpen,
  Copy,
  Trash2,
  Star,
  Zap,
  Loader2,
  X,
  Plus,
  Sparkles,
} from "lucide-react"
import { MTMChartLayout, ScannerKey } from "@/types/layout"
import { loadLayouts, createLayout, deleteLayout, duplicateLayout, updateLayout } from "@/lib/layoutStorage"
import { useRouter } from "next/navigation"

export default function IQCharts2Page() {
  const [mounted, setMounted] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const [showScreener, setShowScreener] = useState(false)
  const [savedLayouts, setSavedLayouts] = useState<MTMChartLayout[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [layoutNameToSave, setLayoutNameToSave] = useState("")
  const [selectedLayout, setSelectedLayout] = useState<MTMChartLayout | null>(null)

  // Estados do gráfico (serão passados para o TradingViewWidget)
  const [selectedSymbol, setSelectedSymbol] = useState("OANDA:XAUUSD")
  const [selectedTimeframe, setSelectedTimeframe] = useState("60")
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">("dark")
  const [selectedStudies, setSelectedStudies] = useState<ScannerKey[]>(["KillShot"])

  useEffect(() => {
    setMounted(true)
    setSavedLayouts(loadLayouts())
  }, [])

  // Presets rápidos (estilo IQ Charts Ideas)
  const quickPresets: Array<{ name: string; icon: any; scanners: ScannerKey[]; symbol: string; timeframe: string }> = [
    { name: "Golden Zone Setup", icon: Star, scanners: ["GoldenZone"], symbol: "OANDA:XAUUSD", timeframe: "60" },
    { name: "Momentum Breakout", icon: Zap, scanners: ["Momentum", "Winzone"], symbol: "OANDA:EURUSD", timeframe: "15" },
    { name: "Kill Shot Entry", icon: Sparkles, scanners: ["KillShot", "Nexus"], symbol: "OANDA:XAUUSD", timeframe: "240" },
    { name: "Smart Money Flow", icon: BarChart3, scanners: ["Smartmonics", "Sinergy"], symbol: "BINANCE:BTCUSDT", timeframe: "60" },
  ]

  const handleQuickPreset = (preset: typeof quickPresets[0]) => {
    setSelectedSymbol(preset.symbol)
    setSelectedTimeframe(preset.timeframe)
    setSelectedStudies(preset.scanners)
    toast({
      title: "✅ Preset Aplicado",
      description: `Layout "${preset.name}" carregado`,
    })
  }

  const handleSaveLayout = () => {
    if (!layoutNameToSave.trim()) {
      toast({
        title: "❌ Erro",
        description: "Insere um nome para o layout",
        variant: "destructive",
      })
      return
    }

    try {
      const layout: MTMChartLayout = {
        version: "1.0",
        id: crypto.randomUUID(),
        name: layoutNameToSave,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chart: {
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
          theme: selectedTheme,
        },
        scanners: {
          active: selectedStudies,
        },
        ui: {
          favoriteTimeframe: selectedTimeframe,
        },
      }

      createLayout(layout)
      setSavedLayouts(loadLayouts())
      setLayoutNameToSave("")
      setShowSaveDialog(false)

      toast({
        title: "✅ Layout Salvo",
        description: `Layout "${layout.name}" guardado com sucesso`,
      })
    } catch (e: any) {
      if (e.message === "LIMIT_REACHED") {
        toast({
          title: "❌ Limite Atingido",
          description: "Limite de 20 layouts atingido. Elimina um layout antigo.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "❌ Erro",
          description: "Erro ao guardar layout",
          variant: "destructive",
        })
      }
    }
  }

  const handleLoadLayout = (layout: MTMChartLayout) => {
    try {
      setSelectedSymbol(layout.chart.symbol)
      setSelectedTimeframe(layout.chart.timeframe)
      setSelectedTheme(layout.chart.theme)
      setSelectedStudies(layout.scanners.active)
      setShowLoadDialog(false)

      toast({
        title: "✅ Layout Carregado",
        description: `Layout "${layout.name}" carregado com sucesso`,
      })
    } catch {
      toast({
        title: "❌ Erro",
        description: "Erro ao carregar layout",
        variant: "destructive",
      })
    }
  }

  const handleDeleteLayout = (id: string) => {
    if (!confirm("Tens certeza que queres eliminar este layout?")) return
    
    deleteLayout(id)
    setSavedLayouts(loadLayouts())
    
    toast({
      title: "✅ Layout Eliminado",
      description: "Layout eliminado com sucesso",
    })
  }

  const handleDuplicateLayout = (id: string) => {
    const duplicated = duplicateLayout(id)
    if (duplicated) {
      setSavedLayouts(loadLayouts())
      toast({
        title: "✅ Layout Duplicado",
        description: `Layout "${duplicated.name}" criado`,
      })
    } else {
      toast({
        title: "❌ Erro",
        description: "Erro ao duplicar layout",
        variant: "destructive",
      })
    }
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-400">A carregar...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/iqcharts2" loadingMessage="A verificar acesso...">
      <main>
        {/* Breadcrumb */}
        <nav className="bg-black/50 border-b border-[#D2A63C]/10">
          <div className="container mx-auto px-4 py-2">
            <ol className="flex items-center space-x-2 text-sm">
              <li className="flex items-center">
                <a href="/" className="text-gray-400 hover:text-[#D2A63C] flex items-center">
                  <House className="h-3 w-3 mr-1" />
                  <span className="sr-only">Início</span>
                </a>
              </li>
              <li className="flex items-center">
                <ChevronRight className="h-4 w-4 text-gray-500 mx-1" />
                <span className="text-[#D2A63C]">IQ Charts 2.0</span>
              </li>
            </ol>
          </div>
        </nav>

        <main className="min-h-screen bg-black text-white">
          {/* Header */}
          <div className="container mx-auto px-4 py-6 md:py-12">
            <div className="text-center mb-8 md:mb-12">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                IQ Charts 2.0 - Layout Engine
              </h1>
              <p className="text-base md:text-lg lg:text-xl text-[#F3F3E6] max-w-3xl mx-auto mb-4 md:mb-8 px-2">
                Sistema avançado de persistência de layouts estilo IQ Charts / TradingView
              </p>
            </div>
          </div>

          {/* Presets Rápidos */}
          <div className="container mx-auto px-4 mb-6">
            <Card className="bg-gradient-to-br from-[#BB8525]/20 to-[#D2A63C]/10 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-lg md:text-xl font-semibold text-[#F3F3E6] flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-[#D2A63C]" />
                  Presets Rápidos (1 Clique)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {quickPresets.map((preset, index) => {
                    const Icon = preset.icon
                    return (
                      <Button
                        key={index}
                        onClick={() => handleQuickPreset(preset)}
                        className="h-auto py-3 px-4 bg-gray-800/50 hover:bg-[#D2A63C]/20 border border-[#D2A63C]/30 text-white flex flex-col items-start gap-2"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Icon className="h-4 w-4 text-[#D2A63C]" />
                          <span className="text-sm font-semibold">{preset.name}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {preset.scanners.join(" + ")} • {preset.symbol}
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TradingView Widget + Screener */}
          <div className="w-full px-2 md:px-4 mb-8 md:mb-12">
            <div className="max-w-[98%] mx-auto bg-gradient-to-br from-[#BB8525]/20 to-[#D2A63C]/10 rounded-lg border border-[#D2A63C]/30 p-3 md:p-6 backdrop-blur-sm hover:border-[#F3F3E6]/50 transition-all duration-300">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 md:mb-6">
                <h2 className="text-lg md:text-2xl font-semibold text-[#F3F3E6] flex items-center">
                  <span className="mr-2">📊</span>
                  Chart Layout Engine
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant={showScreener ? "default" : "outline"}
                    className={
                      showScreener
                        ? "bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                        : "border-[#D2A63C]/60 text-[#D2A63C] hover:bg-[#D2A63C]/10"
                    }
                    onClick={() => setShowScreener((prev) => !prev)}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    {showScreener ? "Esconder Screener" : "Mostrar Screener"}
                  </Button>
                  
                  {/* Salvar Layout */}
                  <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Layout
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-900 border-[#D2A63C]/30">
                      <DialogHeader>
                        <DialogTitle className="text-[#D2A63C]">Salvar Layout</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Guarda o estado atual do gráfico como um layout reutilizável
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label className="text-gray-300">Nome do Layout</Label>
                          <Input
                            value={layoutNameToSave}
                            onChange={(e) => setLayoutNameToSave(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleSaveLayout()
                              }
                            }}
                            placeholder="Ex: XAU/USD - Golden Zone Setup"
                            className="bg-gray-800 border-gray-700 text-white mt-2"
                            autoFocus
                          />
                        </div>
                        <div className="text-xs text-gray-400">
                          Layouts guardados: {savedLayouts.length}/20
                        </div>
                        <Button
                          onClick={handleSaveLayout}
                          className="w-full bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Guardar Layout
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Carregar Layout */}
                  <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-[#D2A63C]/60 text-[#D2A63C] hover:bg-[#D2A63C]/10">
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Carregar Layout
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border-[#D2A63C]/30">
                      <DialogHeader>
                        <DialogTitle className="text-[#D2A63C]">Carregar Layout</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Seleciona um layout guardado para carregar
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        {savedLayouts.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            Nenhum layout guardado
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {savedLayouts.map((layout) => (
                              <div
                                key={layout.id}
                                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
                              >
                                <div className="flex-1">
                                  <div className="font-medium text-white">{layout.name}</div>
                                  <div className="text-xs text-gray-400 mt-1">
                                    {layout.chart.symbol} • {layout.chart.timeframe} • {layout.scanners.active.length} scanners
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {new Date(layout.createdAt).toLocaleDateString("pt-BR")}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => handleLoadLayout(layout)}
                                    size="sm"
                                    className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                                  >
                                    Carregar
                                  </Button>
                                  <Button
                                    onClick={() => handleDuplicateLayout(layout.id)}
                                    size="sm"
                                    variant="outline"
                                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteLayout(layout.id)}
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <TradingViewWidget 
                showScreener={showScreener}
                externalSymbol={selectedSymbol}
                externalTimeframe={selectedTimeframe}
                externalTheme={selectedTheme}
                externalStudies={selectedStudies}
                onSymbolChange={setSelectedSymbol}
                onTimeframeChange={setSelectedTimeframe}
                onThemeChange={setSelectedTheme}
                onStudiesChange={setSelectedStudies}
              />
            </div>
          </div>

          {/* Info Card */}
          <div className="container mx-auto px-4 mb-12">
            <Card className="bg-gradient-to-br from-[#BB8525]/20 to-[#D2A63C]/10 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-[#F3F3E6] flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-[#D2A63C]" />
                  Funcionalidades do Layout Engine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6 text-gray-300">
                  <div>
                    <h3 className="text-lg font-semibold text-[#D2A63C] mb-3">✨ Persistência Completa</h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start">
                        <span className="text-green-400 mr-2">✓</span>
                        <span>Estado completo do gráfico (símbolo, timeframe, tema)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-400 mr-2">✓</span>
                        <span>Scanners ativos preservados</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-400 mr-2">✓</span>
                        <span>Configurações de UI guardadas</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#D2A63C] mb-3">🚀 Próximos Passos</h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start">
                        <span className="text-blue-400 mr-2">→</span>
                        <span>Cloud Save (Supabase / API)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-400 mr-2">→</span>
                        <span>Compartilhar layouts via link</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-400 mr-2">→</span>
                        <span>Scanner Sets pré-configurados</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </main>
    </ProtectedPage>
  )
}


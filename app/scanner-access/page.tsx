"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import TradingViewWidget, { TradingViewWidgetRef } from "@/components/trading-view-widget"
import ProtectedPage from "@/components/protected-page"
import PositionCalculator from "@/components/position-calculator"
import TradingJournalCalendar from "@/components/trading-journal-calendar"
import TradingJournal from "@/components/trading-journal"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { 
  House,
  ChevronRight,
  Brain,
  RefreshCw,
  Clock,
  Target,
  Shield,
  TrendingUp,
  ChartColumn,
  BarChart3,
  Zap,
  ExternalLink,
  Settings,
  Save,
  FolderOpen,
  Maximize2,
  Copy,
  Crown,
  Waves,
  Skull,
  Loader2,
  FileText,
  X,
  BookOpen,
  Download,
  Share2,
  MessageCircle
} from "lucide-react"

interface ChecklistItem {
  id: string
  label: string
  checked: boolean
}

interface ChecklistSection {
  title: string
  icon: any
  color: string
  bgColor: string
  borderColor: string
  items: ChecklistItem[]
}

export default function ScannerAccessPage() {
  const [mounted, setMounted] = useState(false)
  const { toast } = useToast()
  const { user, isAdmin } = useAuth()
  const tradingViewWidgetRef = useRef<TradingViewWidgetRef>(null)
  const [showTradingPlanModal, setShowTradingPlanModal] = useState(false)
  const [showJournalCalendar, setShowJournalCalendar] = useState(false)
  const [showTradingJournal, setShowTradingJournal] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [exportingPlan, setExportingPlan] = useState(false)
  const [showScreener, setShowScreener] = useState(false)
  const [showShareToGroup, setShowShareToGroup] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  const [sharingChart, setSharingChart] = useState(false)
  
  // Trading Plan Form State
  const [tradingPlan, setTradingPlan] = useState({
    plan_name: 'Meu Plano de Trading',
    trader_name: '',
    trading_style: 'swing',
    favorite_pairs: [] as string[],
    trading_sessions: {
      london: false,
      new_york: false,
      tokyo: false,
      asian: false
    },
    max_risk_per_trade: 1,
    max_daily_loss: 500,
    max_concurrent_positions: 3,
    daily_profit_target: 0,
    weekly_profit_target: 0,
    monthly_profit_target: 0,
    min_risk_reward_ratio: 1.5,
    max_risk_reward_ratio: 3,
    entry_rules: '',
    exit_rules: '',
    stop_loss_rules: '',
    take_profit_rules: '',
    additional_rules: ''
  })

  // Checklist Trading
  const [checklistSections, setChecklistSections] = useState<ChecklistSection[]>([
    {
      title: "Rotina Pre-Trading",
      icon: Clock,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/30",
      items: [
        { id: "1", label: "Verificar notícias económicas do dia", checked: false },
        { id: "2", label: "Analisar calendário económico", checked: false },
        { id: "3", label: "Verificar correlações entre mercados", checked: false },
        { id: "4", label: "Revisar posições abertas", checked: false }
      ]
    },
    {
      title: "Estratégia de Saída",
      icon: Target,
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      items: [
        { id: "5", label: "Definir stop loss para cada posição", checked: false },
        { id: "6", label: "Estabelecer take profit targets", checked: false },
        { id: "7", label: "Planificar saída parcial", checked: false }
      ]
    },
    {
      title: "Gestão de Risco",
      icon: Shield,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      items: [
        { id: "8", label: "Calcular risco por trade (1-2% do capital)", checked: false },
        { id: "9", label: "Verificar exposição total do portfólio", checked: false },
        { id: "10", label: "Confirmar posição sizing correto", checked: false }
      ]
    },
    {
      title: "Estratégia de Entrada",
      icon: TrendingUp,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/30",
      items: [
        { id: "11", label: "Identificar setups de entrada válidos", checked: false },
        { id: "12", label: "Confirmar confirmação de sinal", checked: false },
        { id: "13", label: "Verificar alinhamento com tendência", checked: false }
      ]
    },
    {
      title: "Gestão da Trade",
      icon: ChartColumn,
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30",
      items: [
        { id: "14", label: "Monitorizar posições abertas", checked: false },
        { id: "15", label: "Ajustar stops se necessário", checked: false },
        { id: "16", label: "Registar resultados e aprendizagens", checked: false }
      ]
    }
  ])
  
  const handleCheckboxChange = (sectionIndex: number, itemIndex: number) => {
    setChecklistSections(prev => {
      const newSections = [...prev]
      newSections[sectionIndex].items[itemIndex].checked = !newSections[sectionIndex].items[itemIndex].checked
      return newSections
    })
  }
  
  const handleResetChecklist = () => {
    setChecklistSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item => ({ ...item, checked: false }))
    })))
  }
  
  const totalItems = checklistSections.reduce((sum, section) => sum + section.items.length, 0)
  const completedItems = checklistSections.reduce((sum, section) => 
    sum + section.items.filter(item => item.checked).length, 0
  )
  const progressPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  useEffect(() => {
    setMounted(true)
    loadChecklistProgress()
  }, [])

  // Carregar progresso da checklist do Supabase
  const loadChecklistProgress = async () => {
    try {
      const response = await fetch('/api/checklist', {
        credentials: 'include',
        cache: 'no-store'
      })
      const data = await response.json()
      
      if (data.success && data.progress && data.progress.checklist_data?.sections) {
        // Restaurar estado da checklist
        setChecklistSections(data.progress.checklist_data.sections)
      }
    } catch (error) {
      console.error('Erro ao carregar checklist:', error)
      // Continuar com estado padrão se falhar
    }
  }

  // Salvar progresso da checklist no Supabase
  const saveChecklistProgress = async (sections: ChecklistSection[]) => {
    try {
      const totalItems = sections.reduce((acc, section) => acc + section.items.length, 0)
      const completedItems = sections.reduce(
        (acc, section) => acc + section.items.filter(item => item.checked).length,
        0
      )

      await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          checklist_data: {
            sections: sections
          },
          total_items: totalItems,
          completed_items: completedItems
        })
      })
    } catch (error) {
      console.error('Erro ao salvar checklist:', error)
    }
  }

  // Adicionar XP quando página é visualizada (apenas uma vez por sessão)
  useEffect(() => {
    if (mounted) {
      const viewedKey = 'scanner_access_viewed'
      if (!sessionStorage.getItem(viewedKey)) {
        fetch('/api/xp/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action_type: 'scanner_access_view',
            action_description: 'Visualizou página Scanner Access'
          })
        }).catch(err => console.error('Erro ao adicionar XP:', err))
        sessionStorage.setItem(viewedKey, 'true')
      }
    }
  }, [mounted])

  // Load trading plan when modal opens
  useEffect(() => {
    if (showTradingPlanModal) {
      loadTradingPlan()
    }
  }, [showTradingPlanModal])

  const loadTradingPlan = async () => {
    setLoadingPlan(true)
    try {
      const response = await fetch('/api/trading-plans', {
        credentials: 'include',
        cache: 'no-store'
      })
      const data = await response.json()
      
      if (data.success && data.plan) {
        setTradingPlan(data.plan)
      }
    } catch (error) {
      console.error('Erro ao carregar plano:', error)
    } finally {
      setLoadingPlan(false)
    }
  }

  const saveTradingPlan = async () => {
    setLoadingPlan(true)
    try {
      const response = await fetch('/api/trading-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradingPlan),
        credentials: 'include',
        cache: 'no-store'
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "✅ Plano Salvo!",
          description: "O teu plano de trading foi guardado com sucesso."
        })
        setShowTradingPlanModal(false)
      } else {
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao guardar plano de trading",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao guardar plano:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao guardar plano de trading",
        variant: "destructive"
      })
    } finally {
      setLoadingPlan(false)
    }
  }

  const handleExportPlan = async () => {
    setExportingPlan(true)
    try {
      const response = await fetch('/api/trading-plans/export', {
        credentials: 'include',
        cache: 'no-store'
      })

      const contentType = response.headers.get('content-type') ?? ''

      if (!response.ok) {
        let errorMessage = "Erro ao exportar plano de trading"

        if (contentType.includes('application/json')) {
          try {
            const data = await response.json()
            errorMessage = data.error || errorMessage
          } catch (jsonError) {
            console.error('Erro ao interpretar resposta JSON:', jsonError)
          }
        }

        throw new Error(errorMessage)
      }

      if (contentType.includes('application/pdf')) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'plano-trading.pdf'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({
          title: "✅ PDF Gerado!",
          description: "O teu plano de trading foi exportado com sucesso."
        })
      } else {
        throw new Error("Resposta inesperada ao gerar PDF")
      }
    } catch (error: any) {
      console.error('Erro ao exportar plano:', error)
      toast({
        title: "❌ Erro",
        description: error?.message || "Erro ao exportar plano de trading",
        variant: "destructive"
      })
    } finally {
      setExportingPlan(false)
    }
  }

  const handleCheckboxChangeWithSave = async (sectionIndex: number, itemIndex: number) => {
    const wasChecked = checklistSections[sectionIndex].items[itemIndex].checked
    
    // Atualizar estado
    handleCheckboxChange(sectionIndex, itemIndex)
    
    // Aguardar atualização do estado e depois salvar
    setTimeout(async () => {
      const newSections = [...checklistSections]
      newSections[sectionIndex].items[itemIndex].checked = !wasChecked
      
      // Salvar no Supabase
      await saveChecklistProgress(newSections)
      
      // Adicionar XP quando item é marcado (não quando desmarcado)
      if (!wasChecked) {
        // Adicionar XP para item da checklist
        fetch('/api/xp/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action_type: 'scanner_checklist_item',
            action_description: `Item marcado: ${newSections[sectionIndex].items[itemIndex].label}`
          })
        }).catch(err => console.error('Erro ao adicionar XP:', err))
        
        // Verificar se checklist completa e adicionar XP bônus
        const totalItems = newSections.reduce((acc, section) => acc + section.items.length, 0)
        const completedItems = newSections.reduce(
          (acc, section) => acc + section.items.filter(item => item.checked).length,
          0
        )
        
        if (completedItems === totalItems && totalItems > 0) {
          // Checklist completa - adicionar XP bônus
          fetch('/api/xp/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              action_type: 'scanner_complete_checklist',
              action_description: 'Checklist completa!'
            })
          }).catch(err => console.error('Erro ao adicionar XP bônus:', err))
        }
      }
    }, 100)
  }

  const handleReset = () => {
    handleResetChecklist()
    const resetSections = checklistSections.map(section => ({
      ...section,
      items: section.items.map(item => ({ ...item, checked: false }))
    }))
    // Salvar estado resetado
    saveChecklistProgress(resetSections)
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-mtm-primary mx-auto mb-4" />
          <p className="text-gray-400">A carregar...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/scanner-access" loadingMessage="A verificar acesso ao scanner...">
      <main className="min-h-screen bg-black text-white">
        {/* Breadcrumb */}
        <nav className="bg-black/50 border-b border-gold-500/10">
          <div className="container mx-auto px-4 py-2">
            <ol className="flex items-center space-x-2 text-sm">
              <li className="flex items-center">
                <a href="/" className="text-gray-400 hover:text-gold-400 flex items-center">
                  <House className="h-3 w-3 mr-1" />
                  <span className="sr-only">Início</span>
                </a>
              </li>
              <li className="flex items-center">
                <ChevronRight className="h-4 w-4 text-gray-500 mx-1" />
                <span className="text-gold-400">Scanner Access</span>
              </li>
            </ol>
          </div>
        </nav>
        {/* Header */}
        <div className="container mx-auto px-4 py-6 md:py-12">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Scanners IA MoreThanMoney
            </h1>
            <p className="text-base md:text-lg lg:text-xl text-[#F3F3E6] max-w-3xl mx-auto mb-4 md:mb-8 px-2">
              Ferramentas avançadas de análise técnica para maximizar os seus resultados
            </p>
          </div>
        </div>

        {/* TradingView Widget + Screener - Full Width */}
        <div className="w-full px-2 md:px-4 mb-8 md:mb-12">
          <div className="max-w-[98%] mx-auto bg-gradient-to-br from-[#BB8525]/20 to-[#D2A63C]/10 rounded-lg border border-[#D2A63C]/30 p-3 md:p-6 backdrop-blur-sm hover:border-[#F3F3E6]/50 transition-all duration-300">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 md:mb-6">
              <h2 className="text-lg md:text-2xl font-semibold text-[#F3F3E6] flex items-center">
                <span className="mr-2">🔍</span>
                Scanner MoreThanMoney ao Vivo
              </h2>
              <div className="flex items-center gap-2">
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
                  {showScreener ? "Esconder Screener" : "Mostrar Screener / Heatmap"}
                </Button>
              </div>
            </div>
            <TradingViewWidget showScreener={showScreener} widgetRef={tradingViewWidgetRef} />
          </div>
        </div>

        <div className="container mx-auto px-4">

          {/* Checklist de Trading */}
          <div className="mb-12">
            <Card className="bg-black/50 border-amber-500/30">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl md:text-2xl font-bold text-white flex items-center">
                      <Brain className="h-5 w-5 md:h-6 md:w-6 mr-2 text-amber-400" />
                      Checklist de Trading
                    </CardTitle>
                    <p className="text-xs md:text-sm text-gray-300 mt-2">
                      Complete todos os passos antes de iniciar uma nova trade para maximizar as suas hipóteses de sucesso
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs md:text-sm">
                      {completedItems}/{totalItems} Completo
                    </Badge>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="border-amber-500 text-amber-400 hover:bg-amber-500/10 bg-black/50 text-xs md:text-sm"
                    >
                      <RefreshCw className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                      <span className="hidden md:inline">Reset</span>
                      <span className="md:hidden">↺</span>
                    </Button>
                  </div>
                </div>
                <div className="w-full bg-black/50 rounded-full h-3 mt-4">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 md:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {checklistSections.map((section, sectionIndex) => {
                    const SectionIcon = section.icon
                    const sectionProgress = (section.items.filter(item => item.checked).length / section.items.length) * 100
                    
                    return (
                      <Card key={sectionIndex} className={`${section.bgColor} ${section.borderColor} border-2`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 flex-1 min-w-0">
                              <SectionIcon className={`h-4 w-4 md:h-5 md:w-5 ${section.color} flex-shrink-0`} />
                              <CardTitle className={`text-base md:text-lg font-semibold ${section.color} truncate`}>
                                {section.title}
                              </CardTitle>
                            </div>
                            <Badge className="bg-white/10 text-white border-white/20 text-xs ml-2 flex-shrink-0">
                              {section.items.filter(item => item.checked).length}/{section.items.length}
                            </Badge>
                          </div>
                          <div className="w-full bg-[#1a1a1a] rounded-full h-2 mt-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                sectionProgress === 0 ? 'bg-red-500' : 
                                sectionProgress === 100 ? 'bg-green-500' : 'bg-yellow-500'
                              }`}
                              style={{ width: `${sectionProgress}%` }}
                            ></div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {section.items.map((item, itemIndex) => (
                              <div key={item.id} className="flex items-start space-x-3">
                                <Checkbox
                                  id={item.id}
                                  checked={item.checked}
                                  onCheckedChange={() => handleCheckboxChangeWithSave(sectionIndex, itemIndex)}
                                  className="mt-1"
                                />
                                <label
                                  htmlFor={item.id}
                                  className="text-sm leading-relaxed cursor-pointer transition-colors text-gray-200 hover:text-white"
                                >
                                  {item.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Calculadora de Posição */}
                <PositionCalculator />

                {/* Plano de Trading */}
                <Card className="bg-gradient-to-r from-[#1a1a1a] to-[#2d2d2d] border-2 border-purple-500/50">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-purple-400 flex items-center">
                      <Zap className="h-5 w-5 mr-2" />
                      📋 Plano de Trading
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 mb-4">
                      Cria e gere o teu plano de trading profissional. Defines as tuas estratégias, regras de risco e objetivos.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {/* 1. Criar/Editar Plano */}
                      <Dialog open={showTradingPlanModal} onOpenChange={setShowTradingPlanModal}>
                        <DialogTrigger asChild>
                          <Button className="bg-purple-600 hover:bg-purple-700 text-white border border-purple-500/50">
                            <FileText className="h-4 w-4 mr-2" />
                            Criar/Editar Plano
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-purple-500/30">
                          <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-purple-400 flex items-center">
                              <FileText className="h-6 w-6 mr-2" />
                              Plano de Trading Profissional
                            </DialogTitle>
                            <DialogDescription className="text-gray-400">
                              Define as tuas regras de trading, gestão de risco e objetivos
                            </DialogDescription>
                          </DialogHeader>
                          
                          {loadingPlan ? (
                            <div className="flex items-center justify-center py-12">
                              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                          ) : (
                            <div className="space-y-6 mt-4">
                              {/* Informações Básicas */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                                  Informações Básicas
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label htmlFor="plan_name" className="text-gray-300">Nome do Plano</Label>
                                    <Input
                                      id="plan_name"
                                      value={tradingPlan.plan_name}
                                      onChange={(e) => setTradingPlan({...tradingPlan, plan_name: e.target.value})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="trader_name" className="text-gray-300">Nome do Trader</Label>
                                    <Input
                                      id="trader_name"
                                      value={tradingPlan.trader_name}
                                      onChange={(e) => setTradingPlan({...tradingPlan, trader_name: e.target.value})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Label htmlFor="trading_style" className="text-gray-300">Estilo de Trading</Label>
                                    <Select value={tradingPlan.trading_style} onValueChange={(value) => setTradingPlan({...tradingPlan, trading_style: value})}>
                                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-gray-800 border-gray-700">
                                        <SelectItem value="scalping">Scalping</SelectItem>
                                        <SelectItem value="day_trading">Day Trading</SelectItem>
                                        <SelectItem value="swing">Swing</SelectItem>
                                        <SelectItem value="position">Position Trading</SelectItem>
                                        <SelectItem value="algorithmic">Algorithmic</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>

                              {/* Gestão de Risco */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                                  Gestão de Risco
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <Label htmlFor="max_risk_per_trade" className="text-gray-300">Risco Máx. por Trade (%)</Label>
                                    <Input
                                      id="max_risk_per_trade"
                                      type="number"
                                      step="0.1"
                                      value={tradingPlan.max_risk_per_trade}
                                      onChange={(e) => setTradingPlan({...tradingPlan, max_risk_per_trade: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="max_daily_loss" className="text-gray-300">Perda Máx. Diária ($)</Label>
                                    <Input
                                      id="max_daily_loss"
                                      type="number"
                                      step="0.01"
                                      value={tradingPlan.max_daily_loss}
                                      onChange={(e) => setTradingPlan({...tradingPlan, max_daily_loss: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="max_concurrent_positions" className="text-gray-300">Posições Simultâneas</Label>
                                    <Input
                                      id="max_concurrent_positions"
                                      type="number"
                                      value={tradingPlan.max_concurrent_positions}
                                      onChange={(e) => setTradingPlan({...tradingPlan, max_concurrent_positions: parseInt(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="min_risk_reward" className="text-gray-300">R:R Mínimo</Label>
                                    <Input
                                      id="min_risk_reward"
                                      type="number"
                                      step="0.1"
                                      value={tradingPlan.min_risk_reward_ratio}
                                      onChange={(e) => setTradingPlan({...tradingPlan, min_risk_reward_ratio: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="max_risk_reward" className="text-gray-300">R:R Máximo</Label>
                                    <Input
                                      id="max_risk_reward"
                                      type="number"
                                      step="0.1"
                                      value={tradingPlan.max_risk_reward_ratio}
                                      onChange={(e) => setTradingPlan({...tradingPlan, max_risk_reward_ratio: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Objetivos */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                                  Objetivos de Profit
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <Label htmlFor="daily_target" className="text-gray-300">Target Diário ($)</Label>
                                    <Input
                                      id="daily_target"
                                      type="number"
                                      step="0.01"
                                      value={tradingPlan.daily_profit_target}
                                      onChange={(e) => setTradingPlan({...tradingPlan, daily_profit_target: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="weekly_target" className="text-gray-300">Target Semanal ($)</Label>
                                    <Input
                                      id="weekly_target"
                                      type="number"
                                      step="0.01"
                                      value={tradingPlan.weekly_profit_target}
                                      onChange={(e) => setTradingPlan({...tradingPlan, weekly_profit_target: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="monthly_target" className="text-gray-300">Target Mensal ($)</Label>
                                    <Input
                                      id="monthly_target"
                                      type="number"
                                      step="0.01"
                                      value={tradingPlan.monthly_profit_target}
                                      onChange={(e) => setTradingPlan({...tradingPlan, monthly_profit_target: parseFloat(e.target.value)})}
                                      className="bg-gray-800 border-gray-700 text-white"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Regras de Entrada */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                                  Regras de Entrada
                                </h3>
                                <div>
                                  <Label htmlFor="entry_rules" className="text-gray-300">Condições de Entrada</Label>
                                  <Textarea
                                    id="entry_rules"
                                    value={tradingPlan.entry_rules}
                                    onChange={(e) => setTradingPlan({...tradingPlan, entry_rules: e.target.value})}
                                    className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                                    placeholder="Ex: Aguardar confirmação no suporte/resistência, volume acima da média..."
                                  />
                                </div>
                              </div>

                              {/* Regras de Saída */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                                  Regras de Saída
                                </h3>
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="exit_rules" className="text-gray-300">Condições de Saída</Label>
                                    <Textarea
                                      id="exit_rules"
                                      value={tradingPlan.exit_rules}
                                      onChange={(e) => setTradingPlan({...tradingPlan, exit_rules: e.target.value})}
                                      className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                                      placeholder="Ex: Saída parcial em 50% TP, mover stop loss para BE..."
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="stop_loss_rules" className="text-gray-300">Regras de Stop Loss</Label>
                                    <Textarea
                                      id="stop_loss_rules"
                                      value={tradingPlan.stop_loss_rules}
                                      onChange={(e) => setTradingPlan({...tradingPlan, stop_loss_rules: e.target.value})}
                                      className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                                      placeholder="Ex: Stop loss mínimo 10 pips, nunca sem stop loss..."
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="take_profit_rules" className="text-gray-300">Regras de Take Profit</Label>
                                    <Textarea
                                      id="take_profit_rules"
                                      value={tradingPlan.take_profit_rules}
                                      onChange={(e) => setTradingPlan({...tradingPlan, take_profit_rules: e.target.value})}
                                      className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                                      placeholder="Ex: TP1 em 1.5R, TP2 em 2.5R, TP3 em 4R..."
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Regras Adicionais */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                                  Regras Adicionais
                                </h3>
                                <div>
                                  <Textarea
                                    value={tradingPlan.additional_rules}
                                    onChange={(e) => setTradingPlan({...tradingPlan, additional_rules: e.target.value})}
                                    className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                                    placeholder="Ex: Não negociar durante notícias importantes, respeitar max 3 trades por dia..."
                                  />
                                </div>
                              </div>

                              {/* Botões de Ação */}
                              <div className="flex justify-end gap-3 pt-4 border-t border-purple-500/30">
                                <Button
                                  variant="outline"
                                  onClick={() => setShowTradingPlanModal(false)}
                                  className="border-gray-700 text-gray-300 hover:text-white"
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Cancelar
                                </Button>
                                <Button
                                  onClick={saveTradingPlan}
                                  disabled={loadingPlan}
                                  className="bg-purple-600 hover:bg-purple-700 text-white"
                                >
                                  {loadingPlan ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      A guardar...
                                    </>
                                  ) : (
                                    <>
                                      <Save className="h-4 w-4 mr-2" />
                                      Guardar Plano
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>

                      {/* Exportar Plano */}
                      <Button 
                        onClick={handleExportPlan}
                        disabled={exportingPlan}
                        className="bg-orange-600 hover:bg-orange-700 text-white border-0"
                      >
                        {exportingPlan ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            A exportar...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Exportar PDF
                          </>
                        )}
                      </Button>
                      
                      {/* 2. Trading Journal */}
                      <Dialog open={showTradingJournal} onOpenChange={setShowTradingJournal}>
                        <DialogTrigger asChild>
                          <Button className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white border-0">
                            <BookOpen className="h-4 w-4 mr-2" />
                            Trading Journal
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-900 border-green-500/30">
                          <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-green-400 flex items-center">
                              <BookOpen className="h-6 w-6 mr-2" />
                              Trading Journal
                            </DialogTitle>
                            <DialogDescription className="text-gray-400">
                              Regista e analisa os teus trades com journaling profissional
                            </DialogDescription>
                          </DialogHeader>
                          <TradingJournal />
                        </DialogContent>
                      </Dialog>

                      {/* 3. Ver Desempenho */}
                      <Dialog open={showJournalCalendar} onOpenChange={setShowJournalCalendar}>
                        <DialogTrigger asChild>
                          <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0">
                            <ChartColumn className="h-4 w-4 mr-2" />
                            Ver Desempenho
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-900 border-purple-500/30">
                          <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-purple-400 flex items-center">
                              <ChartColumn className="h-6 w-6 mr-2" />
                              Calendário de Desempenho
                            </DialogTitle>
                            <DialogDescription className="text-gray-400">
                              Acompanhe as tuas métricas principais de trading
                            </DialogDescription>
                          </DialogHeader>
                          <TradingJournalCalendar />
                        </DialogContent>
                      </Dialog>

                      {/* 4. Ver Template Notion */}
                      <a
                        href="https://harmonious-comma-e85.notion.site/Meu-Jornal-de-Trading-a8b62109707c455483a4453fdcf97f6c"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver Template Notion
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>

                {/* Dicas */}
                <div className="bg-[#1a1a1a] p-6 rounded-lg border border-pink-500/30">
                  <h3 className="text-lg font-semibold text-pink-400 mb-4 flex items-center">
                    <span className="mr-2">💡</span>
                    Dicas para Trading de Sucesso
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4 text-gray-300 text-sm">
                    <div>
                      <strong className="text-white">🎯 Consistência:</strong> Siga sempre o mesmo processo para cada trade
                    </div>
                    <div>
                      <strong className="text-white">📊 Gestão de Risco:</strong> Nunca arrisque mais de 2% do seu capital
                    </div>
                    <div>
                      <strong className="text-white">⏰ Timing:</strong> Aguarde pela confirmação antes de entrar
                    </div>
                    <div>
                      <strong className="text-white">📈 Tendência:</strong> Trade sempre na direção da tendência dominante
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Descrição Detalhada */}
          <div className="bg-gradient-to-br from-[#BB8525]/20 to-[#D2A63C]/10 rounded-lg border border-[#D2A63C]/30 p-8 backdrop-blur-sm hover:border-[#F3F3E6]/50 transition-all duration-300">
            <h2 className="text-2xl font-semibold text-[#F3F3E6] mb-6 flex items-center">
              <span className="mr-2">📊</span>
              Descrição Detalhada dos Scanners
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300 mb-6 text-lg leading-relaxed">
                Os Scanners MoreThanMoney são algoritmos de análise de mercado por IA, implementando estratégias avançadas como Key Level - Goldenzone, Suporte e Resistência SR MTM, Momentum de Mercado, Price Trap, Smart Money e KillShot.
              </p>
              <div className="grid md:grid-cols-2 gap-8 mt-8">
                <div>
                  <h3 className="text-xl font-medium text-amber-400 mb-4 flex items-center">
                    <span className="mr-2">⚡</span>
                    Funcionalidades Principais
                  </h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      <div>
                        <strong className="text-white">Estruturas de Mercado:</strong> Identifica automaticamente níveis de suporte e resistência baseados no comportamento histórico do preço.
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      <div>
                        <strong className="text-white">Análise de Volatilidade (ATR):</strong> Utiliza o ATR para ajustar os sinais de acordo com a volatilidade atual do mercado.
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      <div>
                        <strong className="text-white">Filtros de Tendência:</strong> Incorpora filtros para evitar sinais contra a tendência dominante, aumentando a taxa de acerto.
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      <div>
                        <strong className="text-white">Múltiplos Timeframes:</strong> Funciona em diversos timeframes, desde gráficos de 5min a diário.
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      <div>
                        <strong className="text-white">Alertas Personalizáveis:</strong> Configure alertas para ser notificado quando surgir uma nova oportunidade de trading.
                      </div>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-blue-400 mb-4 flex items-center">
                    <span className="mr-2">🎯</span>
                    Configuração e Uso
                  </h3>
                  <div className="space-y-4 text-gray-300">
                    <div className="bg-black/50 p-4 rounded-lg border border-blue-500/30">
                      <h4 className="font-semibold text-blue-400 mb-2">Timeframes Recomendados:</h4>
                      <p>15min a 4h para melhor precisão e gestão de risco</p>
                    </div>
                    <div className="bg-black/50 p-4 rounded-lg border border-green-500/30">
                      <h4 className="font-semibold text-green-400 mb-2">Acesso Exclusivo:</h4>
                      <p>Disponível apenas para membros MoreThanMoney ativos</p>
                    </div>
                    <div className="bg-black/50 p-4 rounded-lg border border-purple-500/30">
                      <h4 className="font-semibold text-purple-400 mb-2">Suporte Técnico:</h4>
                      <p>Assistência especializada para configuração e otimização</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </ProtectedPage>
  )
}

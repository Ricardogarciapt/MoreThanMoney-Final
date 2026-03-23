"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  TrendingDown,
  TrendingUp,
  Loader2,
  AlertCircle,
  Target,
  Shield,
  Zap,
  RefreshCw,
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight
} from "lucide-react"

interface DCAOpportunity {
  symbol: string
  name: string
  current_price: number
  avg_price_last_7d: number
  avg_price_last_30d: number
  discount_percent: number
  recommendation: 'Forte Compra' | 'Compra' | 'Aguardar' | 'Não Reforçar'
  suggested_amount: number
  /** Percentagem do reforço sugerida (0–25). */
  suggested_percent?: number
  rationale: string
  confidence: number
  entry_zones: {
    optimal: number
    good: number
    fair: number
  }
  take_profits: number[]
  stop_loss: number
}

export default function DCAOpportunities() {
  const [loading, setLoading] = useState(true)
  const [opportunities, setOpportunities] = useState<DCAOpportunity[]>([])
  const [categorized, setCategorized] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)

  const CARDS_PER_SLIDE = 3
  const totalSlides = Math.max(1, Math.ceil(opportunities.length / CARDS_PER_SLIDE))

  useEffect(() => {
    loadOpportunities()
    
    // Atualizar a cada 2 minutos
    const interval = setInterval(loadOpportunities, 120000)
    return () => clearInterval(interval)
  }, [])

  const loadOpportunities = async () => {
    try {
      console.log('📊 [DCA OPPORTUNITIES] Carregando...')
      setLoading(true)
      setLoadError(null)
      
      const response = await fetch('/api/portfolio/dca-smart?type=crypto')
      const result = await response.json()
      
      console.log('📦 [DCA OPPORTUNITIES] Resposta:', {
        ok: response.ok,
        success: result.success,
        opportunities_count: result.data?.opportunities?.length || 0,
        strong_buy: result.data?.summary?.strong_buy_count || 0,
        buy: result.data?.summary?.buy_count || 0
      })
      
      if (!response.ok) {
        setLoadError(result?.error || result?.details || `Erro ${response.status}. Tenta novamente.`)
        setOpportunities([])
        setCategorized({ strong_buys: [], buys: [], waits: [], no_reinforce: [] })
        setSummary({ total_assets_analyzed: 0, strong_buy_count: 0, buy_count: 0, total_suggested_investment: 0 })
        return
      }
      
      if (result.success) {
        const opps = result.data.opportunities || []
        console.log(`✅ [DCA OPPORTUNITIES] ${opps.length} oportunidades carregadas`)
        
        setOpportunities(opps)
        setCategorized(result.data.categorized || {
          strong_buys: [],
          buys: [],
          waits: [],
          no_reinforce: []
        })
        setSummary(result.data.summary || {
          total_assets_analyzed: 0,
          strong_buy_count: 0,
          buy_count: 0,
          total_suggested_investment: 0
        })
      } else {
        console.error('❌ [DCA OPPORTUNITIES] API retornou erro:', result.error)
        setLoadError(result?.error || 'Erro ao analisar oportunidades.')
        setOpportunities([])
        setCategorized({ strong_buys: [], buys: [], waits: [], no_reinforce: [] })
        setSummary({
          total_assets_analyzed: 0,
          strong_buy_count: 0,
          buy_count: 0,
          total_suggested_investment: 0
        })
      }
    } catch (error) {
      console.error('❌ [DCA OPPORTUNITIES] Erro ao carregar:', error)
      setLoadError('Não foi possível carregar a análise. Verifica a ligação e tenta novamente.')
      setOpportunities([])
      setCategorized({ strong_buys: [], buys: [], waits: [], no_reinforce: [] })
      setSummary({
        total_assets_analyzed: 0,
        strong_buy_count: 0,
        buy_count: 0,
        total_suggested_investment: 0
      })
    } finally {
      setLoading(false)
    }
  }

  const createAlert = async (symbol: string, type: string, value: number, opportunityName?: string) => {
    try {
      const response = await fetch('/api/notifications/dca-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          alert_type: type,
          target_value: value
        })
      })

      const result = await response.json()

      if (response.ok && result.alert) {
        const alertMessage = type === 'dca_opportunity'
          ? `✅ Alerta DCA criado!\n\n${opportunityName || symbol}\nPreço Ideal: $${value.toFixed(4)}\n\nSerás notificado quando o preço atingir a zona de entrada ideal!`
          : `✅ Alerta criado para ${symbol}!\n\nPreço Target: $${value.toFixed(4)}\n\nSerás notificado quando atingir este valor!`
        
        alert(alertMessage)
        console.log(`✅ [DCA] Alerta criado: ${symbol} - ${type} - $${value}`)
      } else {
        throw new Error(result.error || 'Erro ao criar alerta')
      }
    } catch (error: any) {
      console.error('❌ [DCA] Erro ao criar alerta:', error)
      alert(`❌ Erro ao criar alerta:\n${error.message || 'Verifica a conexão'}\n\nCertifica-te que:\n1. Estás autenticado\n2. A tabela price_alerts existe no Supabase`)
    }
  }

  // Navegação do Carousel
  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides)
  }

  const goToSlide = (index: number) => {
    setCurrentSlide(index)
  }

  // Touch handlers para swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 75) {
      // Swipe left
      nextSlide()
    }

    if (touchStart - touchEnd < -75) {
      // Swipe right
      prevSlide()
    }
  }

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'Forte Compra':
        return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'Compra':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      case 'Aguardar':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      case 'Não Reforçar':
        return 'bg-red-500/20 text-red-400 border-red-500/50'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
  }

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'Forte Compra':
        return <Zap className="h-5 w-5 text-green-400" />
      case 'Compra':
        return <TrendingDown className="h-5 w-5 text-blue-400" />
      case 'Aguardar':
        return <Shield className="h-5 w-5 text-yellow-400" />
      case 'Não Reforçar':
        return <AlertCircle className="h-5 w-5 text-red-400" />
      default:
        return <Target className="h-5 w-5 text-gray-400" />
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  }

  if (loading && opportunities.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Premium Ultra-Moderno */}
      <Card className="relative overflow-hidden border-none shadow-2xl">
        {/* Background Gradient Animado */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#D2A63C] via-[#BB8525] to-gray-900 opacity-90"></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent animate-pulse"></div>
        
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}></div>
        
        <CardContent className="relative z-10 p-8">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">
            {/* Left Side - Title & Stats */}
            <div className="space-y-6 flex-1">
              <div className="flex items-start gap-5">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-black/40 to-black/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/20 shadow-2xl">
                  <Zap className="h-10 w-10 text-white animate-pulse" />
                </div>
                <div>
                  <h2 className="text-4xl font-black text-white mb-2 tracking-tight drop-shadow-lg">
                    DCA Inteligente
                  </h2>
                  <p className="text-white/90 text-base flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/30">
                      <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-lg shadow-white/50"></div>
                      <span className="font-bold">{summary?.total_assets_analyzed || 0}</span> ativos monitorizados
                    </span>
                    {summary?.strong_buy_count > 0 && (
                      <span className="inline-flex items-center gap-2 bg-green-500/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-green-400/50 font-bold text-white">
                        🚀 {summary.strong_buy_count} Forte Compra
                      </span>
                    )}
                    {summary?.buy_count > 0 && (
                      <span className="inline-flex items-center gap-2 bg-blue-500/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-blue-400/50 font-bold text-white">
                        ⚡ {summary.buy_count} Compra
                      </span>
                    )}
                    {(!summary?.strong_buy_count && !summary?.buy_count) && (
                      <span className="inline-flex items-center gap-2 bg-yellow-500/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-yellow-400/50 font-bold text-white">
                        📊 Mercado Estável
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Quick Stats Grid - Redesenhado */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group relative overflow-hidden bg-gradient-to-br from-green-500/20 to-green-900/20 backdrop-blur-sm border-2 border-green-400/40 rounded-2xl p-4 hover:border-green-400 transition-all duration-300 hover:scale-105">
                  <div className="absolute -top-4 -right-4 text-6xl opacity-10">🚀</div>
                  <div className="relative z-10">
                    <div className="text-[11px] text-green-200 uppercase tracking-wider mb-2 font-bold">Forte Compra</div>
                    <div className="text-3xl font-black text-white">{summary?.strong_buy_count || 0}</div>
                  </div>
                </div>
                <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500/20 to-blue-900/20 backdrop-blur-sm border-2 border-blue-400/40 rounded-2xl p-4 hover:border-blue-400 transition-all duration-300 hover:scale-105">
                  <div className="absolute -top-4 -right-4 text-6xl opacity-10">⚡</div>
                  <div className="relative z-10">
                    <div className="text-[11px] text-blue-200 uppercase tracking-wider mb-2 font-bold">Compra</div>
                    <div className="text-3xl font-black text-white">{summary?.buy_count || 0}</div>
                  </div>
                </div>
                <div className="group relative overflow-hidden bg-gradient-to-br from-yellow-500/20 to-yellow-900/20 backdrop-blur-sm border-2 border-yellow-400/40 rounded-2xl p-4 hover:border-yellow-400 transition-all duration-300 hover:scale-105">
                  <div className="absolute -top-4 -right-4 text-6xl opacity-10">⏸️</div>
                  <div className="relative z-10">
                    <div className="text-[11px] text-yellow-200 uppercase tracking-wider mb-2 font-bold">Aguardar</div>
                    <div className="text-3xl font-black text-white">
                      {(summary?.total_assets_analyzed || 0) - (summary?.strong_buy_count || 0) - (summary?.buy_count || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Side - Sugestão por percentagem (sem valores numéricos) */}
            <div className="flex flex-col items-stretch xl:items-end gap-5">
              <div className="relative overflow-hidden bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-md rounded-3xl p-8 shadow-2xl border-2 border-white/20 min-w-[280px]">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <div className="text-xs text-white/80 uppercase tracking-widest mb-3 font-black">💎 Sugestão de alocação</div>
                  <div className="text-sm text-white/90 space-y-1.5 mb-2">
                    <p><strong className="text-green-400">Forte Compra:</strong> até 20% do reforço</p>
                    <p><strong className="text-blue-400">Compra:</strong> até 15% do reforço</p>
                    <p><strong className="text-yellow-400">Aguardar:</strong> até 5% do reforço</p>
                  </div>
                  <div className="text-xs text-white/70 font-medium">Percentagens indicativas por ativo</div>
                </div>
              </div>
              
              <Button
                onClick={loadOpportunities}
                disabled={loading}
                size="lg"
                className="bg-gradient-to-r from-white via-gray-100 to-white hover:from-gray-50 hover:via-white hover:to-gray-50 text-black font-black shadow-2xl hover:shadow-white/20 transition-all duration-300 h-16 px-10 rounded-2xl text-base border-2 border-white/30"
              >
                <RefreshCw className={`h-6 w-6 mr-3 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'A Analisar Mercado...' : 'Atualizar Análise'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mensagem de erro da API */}
      {loadError && !loading && (
        <Card className="bg-gradient-to-br from-red-900/20 to-gray-900 border-red-500/30">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Erro ao carregar DCA Inteligente</h3>
                <p className="text-sm text-gray-400 mt-1">{loadError}</p>
              </div>
            </div>
            <Button
              onClick={loadOpportunities}
              disabled={loading}
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mensagem se não há oportunidades (sem erro) */}
      {opportunities.length === 0 && !loading && !loadError && (
        <Card className="bg-gradient-to-br from-blue-900/20 to-gray-900 border-blue-500/30">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center">
                <Target className="h-10 w-10 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">A analisar mercado...</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  O sistema está a analisar os {summary?.total_assets_analyzed || 21} ativos configurados no Admin Panel.
                  As oportunidades DCA aparecerão aqui quando houver descontos significativos (≥10%).
                </p>
                <p className="text-sm text-blue-400 mt-3">
                  💡 Dica: Quando não há oportunidades, significa que os preços estão próximos ou acima das médias.
                  Continue com o plano DCA regular!
                </p>
              </div>
              <Button
                onClick={loadOpportunities}
                disabled={loading}
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Recarregar Análise
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Carousel Container */}
      {opportunities.length > 0 && (
      <div className="relative">
        {/* Navigation Buttons */}
        {totalSlides > 1 && (
          <>
            <Button
              onClick={prevSlide}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-gray-900/90 hover:bg-[#D2A63C] border border-[#D2A63C]/30 w-12 h-12 rounded-full shadow-xl -ml-6"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              onClick={nextSlide}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-gray-900/90 hover:bg-[#D2A63C] border border-[#D2A63C]/30 w-12 h-12 rounded-full shadow-xl -mr-6"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Carousel Wrapper */}
        <div 
          ref={carouselRef}
          className="overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {Array.from({ length: totalSlides }).map((_, slideIndex) => (
              <div key={slideIndex} className="min-w-full">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-1">
                  {opportunities
                    .slice(slideIndex * CARDS_PER_SLIDE, (slideIndex + 1) * CARDS_PER_SLIDE)
                    .map((opp, index) => (
          <Card 
            key={index} 
            className={`group relative overflow-hidden border-3 transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl hover:-translate-y-1 ${
              opp.recommendation === 'Forte Compra' 
                ? 'bg-gradient-to-br from-green-900/40 via-gray-900 to-black border-green-400/70 hover:border-green-300 shadow-xl shadow-green-500/30' 
                : opp.recommendation === 'Compra'
                ? 'bg-gradient-to-br from-blue-900/40 via-gray-900 to-black border-blue-400/60 hover:border-blue-300 shadow-xl shadow-blue-500/30'
                : opp.recommendation === 'Aguardar'
                ? 'bg-gradient-to-br from-yellow-900/40 via-gray-900 to-black border-yellow-400/50 hover:border-yellow-300 shadow-xl shadow-yellow-500/30'
                : 'bg-gradient-to-br from-red-900/40 via-gray-900 to-black border-red-400/50 hover:border-red-300 shadow-xl shadow-red-500/30'
            }`}
          >
            {/* Glow Effect Premium */}
            <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl opacity-0 group-hover:opacity-40 transition-all duration-700 ${
              opp.recommendation === 'Forte Compra' ? 'bg-green-500' :
              opp.recommendation === 'Compra' ? 'bg-blue-500' :
              opp.recommendation === 'Aguardar' ? 'bg-yellow-500' : 'bg-red-500'
            }`}></div>
            
            {/* Shimmer Effect Melhorado */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1200"></div>
            
            {/* Dot Pattern */}
            <div className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
              backgroundSize: '20px 20px'
            }}></div>

            <CardContent className="p-6 relative z-10">
              {/* Header com Badge Flutuante */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    opp.recommendation === 'Forte Compra' ? 'bg-green-500/20' :
                    opp.recommendation === 'Compra' ? 'bg-blue-500/20' :
                    opp.recommendation === 'Aguardar' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                  }`}>
                    {getRecommendationIcon(opp.recommendation)}
                  </div>
                  <div>
                    <h3 className="font-black text-white text-lg">{opp.name}</h3>
                    <p className="text-sm text-gray-500 font-mono">{opp.symbol}</p>
                  </div>
                </div>
                <Badge className={`${getRecommendationBadge(opp.recommendation)} text-xs font-bold px-3 py-1 animate-pulse`}>
                  {opp.recommendation}
                </Badge>
              </div>

              {/* Preço Atual - Destaque Ultra Premium */}
              <div className="relative bg-gradient-to-br from-black/80 via-black/60 to-black/80 backdrop-blur-lg p-6 rounded-3xl mb-5 border-2 border-white/20 shadow-2xl overflow-hidden">
                {/* Animated Background */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse"></div>
                
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{
                    backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                    backgroundSize: '28px 28px'
                  }}></div>
                </div>
                
                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[11px] text-white/70 uppercase tracking-widest font-black">💰 Preço Atual</div>
                      <div className="h-1 flex-1 bg-gradient-to-r from-white/30 to-transparent rounded-full"></div>
                    </div>
                    <div className="text-5xl font-black text-white tracking-tighter mb-2">${opp.current_price.toFixed(4)}</div>
                    <div className="text-xs text-white/60 font-semibold">vs Média Semanal CoinGecko</div>
                  </div>
                  <div className="text-right">
                    <div className={`relative inline-flex items-center gap-3 px-5 py-4 rounded-2xl border-3 transition-all duration-300 ${
                      opp.discount_percent >= 15 ? 'bg-gradient-to-br from-green-500/30 to-green-900/30 border-green-400/60 shadow-lg shadow-green-500/30' :
                      opp.discount_percent >= 10 ? 'bg-gradient-to-br from-blue-500/30 to-blue-900/30 border-blue-400/60 shadow-lg shadow-blue-500/30' :
                      opp.discount_percent >= 5 ? 'bg-gradient-to-br from-yellow-500/30 to-yellow-900/30 border-yellow-400/60 shadow-lg shadow-yellow-500/30' : 'bg-gradient-to-br from-gray-500/30 to-gray-900/30 border-gray-400/60'
                    }`}>
                      <div>
                        <div className={`text-[11px] uppercase tracking-wider mb-1.5 font-bold ${
                          opp.discount_percent >= 15 ? 'text-green-200' :
                          opp.discount_percent >= 10 ? 'text-blue-200' :
                          opp.discount_percent >= 5 ? 'text-yellow-200' : 'text-gray-200'
                        }`}>Desconto</div>
                        <div className={`text-4xl font-black ${
                          opp.discount_percent >= 15 ? 'text-green-300' :
                          opp.discount_percent >= 10 ? 'text-blue-300' :
                          opp.discount_percent >= 5 ? 'text-yellow-300' : 'text-gray-300'
                        }`}>
                          {opp.discount_percent >= 0 ? '+' : ''}{opp.discount_percent.toFixed(1)}%
                        </div>
                      </div>
                      {opp.discount_percent >= 15 && <div className="text-3xl animate-bounce">🔥</div>}
                      {opp.discount_percent >= 10 && opp.discount_percent < 15 && <div className="text-3xl animate-pulse">⚡</div>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sugestão (percentagem) e Confiança */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gradient-to-br from-[#D2A63C]/20 to-[#BB8525]/20 p-4 rounded-lg border border-[#D2A63C]/40">
                  <div className="text-xs text-gray-400 uppercase mb-1.5">Sugestão de investimento</div>
                  <div className="text-xl font-black text-[#D2A63C]">
                    {opp.suggested_percent != null ? `${opp.suggested_percent}% do reforço` : '—'}
                  </div>
                </div>
                <div className="bg-white/5 p-4 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 uppercase mb-1.5">Confiança</div>
                  <div className="text-xl font-black text-white">{opp.confidence}%</div>
                </div>
              </div>

              {/* Target e SL - Linha */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1 bg-green-500/10 px-4 py-3 rounded-lg border border-green-500/30">
                  <div className="text-[10px] text-green-300 uppercase mb-1">Target</div>
                  <div className="text-base font-bold text-green-400">${opp.take_profits[1].toFixed(4)}</div>
                </div>
                <div className="flex-1 bg-red-500/10 px-4 py-3 rounded-lg border border-red-500/30">
                  <div className="text-[10px] text-red-300 uppercase mb-1">Stop Loss</div>
                  <div className="text-base font-bold text-red-400">${opp.stop_loss.toFixed(4)}</div>
                </div>
              </div>

              {/* Botão de Alerta - Call to Action Premium */}
              <Button
                onClick={() => createAlert(opp.symbol, 'dca_opportunity', opp.entry_zones.optimal, opp.name)}
                className={`relative w-full h-14 text-lg font-black transition-all duration-500 shadow-2xl overflow-hidden group/btn ${
                  opp.recommendation === 'Forte Compra'
                    ? 'bg-gradient-to-r from-green-600 via-green-500 to-green-600 hover:from-green-500 hover:via-green-400 hover:to-green-500 text-white shadow-green-500/60 animate-pulse border-2 border-green-300/50'
                    : 'bg-gradient-to-r from-[#D2A63C] via-[#BB8525] to-[#D2A63C] hover:from-[#BB8525] hover:via-[#D2A63C] hover:to-[#BB8525] text-black shadow-[#D2A63C]/60 border-2 border-[#D2A63C]/50'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                <div className="relative flex items-center justify-center gap-3">
                  <Bell className="h-6 w-6 animate-swing" />
                  {opp.recommendation === 'Forte Compra' ? '🚀 Alerta Urgente!' : 'Criar Alerta de Preço'}
                </div>
              </Button>
            </CardContent>
          </Card>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Indicators (Bolinhas) */}
        {totalSlides > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {Array.from({ length: totalSlides }).map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`transition-all duration-300 rounded-full ${
                  currentSlide === index
                    ? 'w-8 h-3 bg-gradient-to-r from-[#D2A63C] to-[#BB8525]'
                    : 'w-3 h-3 bg-gray-600 hover:bg-gray-500'
                }`}
                aria-label={`Ir para slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Info Box */}
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p className="font-medium text-amber-500 mb-2">Como Funciona o DCA Inteligente:</p>
              <ul className="space-y-1 text-xs">
                <li>• <strong>Forte Compra</strong>: Desconto ≥15% → Reforçar 2x o planeado</li>
                <li>• <strong>Compra</strong>: Desconto 10-15% → Reforçar 1.5x o planeado</li>
                <li>• <strong>Aguardar</strong>: Desconto 5-10% → Reforçar 50% do planeado</li>
                <li>• <strong>Não Reforçar</strong>: Preço acima da média → Aguardar correção</li>
              </ul>
              <p className="mt-2 text-xs text-gray-400">
                Os preços são atualizados via CoinGecko. Análise baseada em médias móveis semanais e análise de volume.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


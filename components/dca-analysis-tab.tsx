"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  Target,
  BarChart3,
  AlertCircle,
  Brain,
  Newspaper
} from "lucide-react"

interface DCAAnalysis {
  symbol: string
  timestamp: string
  currentPrice: string
  technical_indicators: {
    rsi_1d: string
    sma20: string
    sma50: string
    sma200: string
    volume_ratio: string
  }
  sentiment: {
    shortTermSentiment: {
      category: string
      score: number
      rationale: string
    }
    longTermSentiment: {
      category: string
      score: number
      rationale: string
    }
  }
  recommendations: {
    curto_prazo: {
      acao: string
      entradas: string
      stop_loss: string
      take_profit: string[]
      justificacao: string
      confidence: number
    }
    longo_prazo: {
      acao: string
      entradas: string
      stop_loss: string
      take_profit: string[]
      justificacao: string
      confidence: number
    }
  }
  dca_zones: Array<{
    price_range: string
    allocation: string
    reason: string
  }>
  news_analyzed: number
}

interface DCAAnalysisTabProps {
  cryptoAssets: Array<{ symbol: string; name: string }>
}

export default function DCAAnalysisTab({ cryptoAssets }: DCAAnalysisTabProps) {
  const [selectedAsset, setSelectedAsset] = useState(cryptoAssets[0]?.symbol || 'BTC')
  const [dcaData, setDcaData] = useState<DCAAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedAsset) {
      loadDCAAnalysis(selectedAsset)
    }
  }, [selectedAsset])

  const loadDCAAnalysis = async (symbol: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/portfolio/dca-analysis?symbol=${symbol}`)
      const result = await response.json()
      
      if (result.success) {
        setDcaData(result.data)
      }
    } catch (error) {
      console.error('Erro ao carregar análise DCA:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSentimentColor = (score: number) => {
    if (score > 0.3) return 'text-green-500'
    if (score < -0.3) return 'text-red-500'
    return 'text-yellow-500'
  }

  const getSentimentBadge = (category: string) => {
    if (category === 'Positive') return 'bg-green-500/20 text-green-400 border-green-500/50'
    if (category === 'Negative') return 'bg-red-500/20 text-red-400 border-red-500/50'
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
  }

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 75) return 'bg-green-500/20 text-green-400 border-green-500/50'
    if (confidence >= 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    return 'bg-red-500/20 text-red-400 border-red-500/50'
  }

  return (
    <div className="space-y-6">
      {/* Header com seleção de ativo */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Análise DCA Inteligente</h2>
          <p className="text-gray-400">Recomendações baseadas em análise técnica e sentiment</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={selectedAsset} onValueChange={setSelectedAsset}>
            <SelectTrigger className="w-[200px] bg-gray-900 border-[#D2A63C]/30">
              <SelectValue placeholder="Selecione um ativo" />
            </SelectTrigger>
            <SelectContent>
              {cryptoAssets.map(asset => (
                <SelectItem key={asset.symbol} value={asset.symbol}>
                  {asset.name} ({asset.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={() => loadDCAAnalysis(selectedAsset)}
            disabled={loading}
            className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
          </Button>
        </div>
      </div>

      {loading && !dcaData ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
        </div>
      ) : dcaData ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Indicadores Técnicos + Sentiment */}
          <div className="space-y-6">
            {/* Preço Atual */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Preço Atual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">${dcaData.currentPrice}</div>
                <div className="text-sm text-gray-400 mt-1">
                  {new Date(dcaData.timestamp).toLocaleString('pt-PT')}
                </div>
              </CardContent>
            </Card>

            {/* Indicadores Técnicos */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-lg text-[#D2A63C]">Indicadores Técnicos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">RSI (1D)</span>
                  <span className="font-medium text-white">{dcaData.technical_indicators.rsi_1d}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">SMA 20</span>
                  <span className="font-medium text-white">${dcaData.technical_indicators.sma20}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">SMA 50</span>
                  <span className="font-medium text-white">${dcaData.technical_indicators.sma50}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">SMA 200</span>
                  <span className="font-medium text-white">${dcaData.technical_indicators.sma200}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Volume Ratio</span>
                  <span className="font-medium text-white">{dcaData.technical_indicators.volume_ratio}x</span>
                </div>
              </CardContent>
            </Card>

            {/* Análise de Sentiment */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
                  <Newspaper className="h-5 w-5" />
                  Análise de Sentiment
                </CardTitle>
                <p className="text-xs text-gray-400">{dcaData.news_analyzed} notícias analisadas</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Curto Prazo</span>
                    <Badge className={getSentimentBadge(dcaData.sentiment.shortTermSentiment.category)}>
                      {dcaData.sentiment.shortTermSentiment.category}
                    </Badge>
                  </div>
                  <div className={`text-2xl font-bold mb-2 ${getSentimentColor(dcaData.sentiment.shortTermSentiment.score)}`}>
                    {dcaData.sentiment.shortTermSentiment.score.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-400">{dcaData.sentiment.shortTermSentiment.rationale}</p>
                </div>

                <div className="border-t border-gray-800 pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Longo Prazo</span>
                    <Badge className={getSentimentBadge(dcaData.sentiment.longTermSentiment.category)}>
                      {dcaData.sentiment.longTermSentiment.category}
                    </Badge>
                  </div>
                  <div className={`text-2xl font-bold mb-2 ${getSentimentColor(dcaData.sentiment.longTermSentiment.score)}`}>
                    {dcaData.sentiment.longTermSentiment.score.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-400">{dcaData.sentiment.longTermSentiment.rationale}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna 2: Recomendações */}
          <div className="space-y-6">
            {/* Curto Prazo */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Curto Prazo
                  </CardTitle>
                  <Badge className={getConfidenceBadge(dcaData.recommendations.curto_prazo.confidence)}>
                    {dcaData.recommendations.curto_prazo.confidence}% confiança
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Ação Recomendada</div>
                  <div className="text-xl font-bold text-white">{dcaData.recommendations.curto_prazo.acao}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-1">Zona de Entrada</div>
                  <div className="font-medium text-white">${dcaData.recommendations.curto_prazo.entradas}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Stop Loss</div>
                    <div className="font-medium text-red-400">${dcaData.recommendations.curto_prazo.stop_loss}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Take Profit</div>
                    <div className="font-medium text-green-400">
                      {dcaData.recommendations.curto_prazo.take_profit.map((tp, i) => (
                        <div key={i}>${tp}</div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-4">
                  <div className="text-sm text-gray-400 mb-2">Justificação</div>
                  <p className="text-xs text-gray-300">{dcaData.recommendations.curto_prazo.justificacao}</p>
                </div>
              </CardContent>
            </Card>

            {/* Longo Prazo */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Longo Prazo
                  </CardTitle>
                  <Badge className={getConfidenceBadge(dcaData.recommendations.longo_prazo.confidence)}>
                    {dcaData.recommendations.longo_prazo.confidence}% confiança
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Ação Recomendada</div>
                  <div className="text-xl font-bold text-white">{dcaData.recommendations.longo_prazo.acao}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-1">Zona de Entrada</div>
                  <div className="font-medium text-white">${dcaData.recommendations.longo_prazo.entradas}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Stop Loss</div>
                    <div className="font-medium text-red-400">${dcaData.recommendations.longo_prazo.stop_loss}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Take Profits</div>
                    <div className="font-medium text-green-400">
                      {dcaData.recommendations.longo_prazo.take_profit.map((tp, i) => (
                        <div key={i}>${tp}</div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-4">
                  <div className="text-sm text-gray-400 mb-2">Justificação</div>
                  <p className="text-xs text-gray-300">{dcaData.recommendations.longo_prazo.justificacao}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna 3: Zonas DCA */}
          <div className="space-y-6">
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-lg text-[#D2A63C] flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Estratégia DCA Inteligente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-[#D2A63C]/10 p-4 rounded-lg border border-[#D2A63C]/30">
                  <h4 className="font-medium text-white mb-2">O que é DCA?</h4>
                  <p className="text-xs text-gray-300">
                    Dollar Cost Averaging (DCA) é uma estratégia de investimento que envolve a compra regular de um ativo em intervalos fixos, independentemente do preço.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-white mb-4">Zonas de Compra Recomendadas</h4>
                  <div className="space-y-3">
                    {dcaData.dca_zones.map((zone, index) => (
                      <div key={index} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-white">Zona {index + 1}</span>
                          <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/50">
                            {zone.allocation}
                          </Badge>
                        </div>
                        <div className="text-lg font-bold text-white mb-1">${zone.price_range}</div>
                        <p className="text-xs text-gray-400">{zone.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-500/10 p-4 rounded-lg border border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-gray-300">
                      <p className="font-medium text-amber-500 mb-1">Importante:</p>
                      <p>
                        Estas recomendações são baseadas em análise técnica e sentiment, mas não constituem aconselhamento financeiro. 
                        Sempre faça sua própria pesquisa e invista apenas o que pode perder.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="bg-gray-900/50 border-[#D2A63C]/30">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-gray-400">Selecione um ativo para ver a análise DCA</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  PieChart,
  RefreshCw,
  Calendar,
  AlertCircle,
  Info,
  Download,
  ExternalLink,
  Clock,
} from "lucide-react"
import { fetchPortfolioData } from "@/lib/portfolio-service"

// Tipos para os dados do portfólio
interface Asset {
  name: string
  ticker: string
  allocation: number
  trend: "up" | "down" | "neutral"
  change: number
  price?: number
  reason?: string
}

interface Portfolio {
  id: string
  name: string
  type: "crypto" | "stocks" | "mixed"
  description: string
  riskLevel: "low" | "medium" | "high"
  assets: Asset[]
  performance: {
    daily: number
    weekly: number
    monthly: number
    yearly: number
  }
  lastUpdated: string
  nextUpdate: string
}

export function PortfoliosIntelligent() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null)
  const [showAssetDetails, setShowAssetDetails] = useState<number | null>(null)

  // Função para atualizar preços em tempo real
  const updatePrices = async () => {
    if (portfolios.length === 0) return
    
    try {
      // Coletar todos os símbolos únicos de todos os portfolios
      const allSymbols = new Set<string>()
      const assetTypes = new Map<string, string>()
      
      portfolios.forEach(portfolio => {
        portfolio.assets.forEach(asset => {
          allSymbols.add(asset.ticker)
          assetTypes.set(asset.ticker, portfolio.type === 'crypto' ? 'crypto' : 'stock')
        })
      })
      
      const assets = Array.from(allSymbols).map(symbol => ({
        symbol,
        type: assetTypes.get(symbol) || 'crypto'
      }))
      
      const response = await fetch('/api/prices/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets })
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Atualizar portfolios com novos preços
        const updatedPortfolios = portfolios.map(portfolio => ({
          ...portfolio,
          assets: portfolio.assets.map(asset => ({
            ...asset,
            price: data.prices[asset.ticker] || asset.price
          }))
        }))
        
        setPortfolios(updatedPortfolios)
        
        // Atualizar portfolio selecionado se houver
        if (selectedPortfolio) {
          const updated = updatedPortfolios.find(p => p.id === selectedPortfolio.id)
          if (updated) {
            setSelectedPortfolio(updated)
          }
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar preços:", error)
    }
  }

  // Função para buscar dados dos portfólios
  useEffect(() => {
    async function loadPortfolios() {
      try {
        setLoading(true)
        // Em produção, isso buscaria dados da API do Notion ou de um backend
        const data = await fetchPortfolioData()
        setPortfolios(data)
        if (data.length > 0) {
          setSelectedPortfolio(data[0])
        }
        
        // Atualizar preços imediatamente após carregar
        setTimeout(() => updatePrices(), 1000)
      } catch (error) {
        console.error("Erro ao carregar portfólios:", error)
      } finally {
        setLoading(false)
      }
    }

    loadPortfolios()

    // Configurar atualização automática semanal (a cada 7 dias)
    const updateInterval = setInterval(
      () => {
        loadPortfolios()
      },
      7 * 24 * 60 * 60 * 1000,
    )
    
    // Atualizar preços a cada 60 segundos
    const priceInterval = setInterval(
      () => {
        updatePrices()
      },
      60000,
    )

    return () => {
      clearInterval(updateInterval)
      clearInterval(priceInterval)
    }
  }, [])

  // Função para formatar a data
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
    return new Date(dateString).toLocaleDateString("pt-BR", options)
  }

  // Função para calcular dias até a próxima atualização
  const getDaysUntilNextUpdate = (nextUpdateDate: string) => {
    const today = new Date()
    const nextUpdate = new Date(nextUpdateDate)
    const diffTime = nextUpdate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  // Renderizar estado de carregamento
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500 mb-4"></div>
        <p className="text-amber-500">Carregando portfólios inteligentes...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-amber-500 mb-2">Portfólios Inteligentes MoreThanMoney</h1>
          <p className="text-gray-300 max-w-3xl">
            Acompanhe nossos portfólios gerenciados por especialistas e atualizados semanalmente. Use estas alocações
            como referência para suas próprias estratégias de investimento.
          </p>
        </div>
        <div className="flex items-center bg-amber-500/10 rounded-lg p-2 text-amber-400">
          <RefreshCw className="h-5 w-5 mr-2" />
          <span className="text-sm">Atualização semanal</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-black/50 border-amber-500/30 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-amber-500">Selecione um Portfólio</CardTitle>
              <CardDescription>Escolha um dos nossos portfólios gerenciados para ver detalhes</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {portfolios.map((portfolio) => (
                  <button
                    key={portfolio.id}
                    onClick={() => setSelectedPortfolio(portfolio)}
                    className={`w-full text-left p-3 rounded-lg transition-all flex justify-between items-center ${
                      selectedPortfolio?.id === portfolio.id
                        ? "bg-amber-500/20 border border-amber-500/50"
                        : "bg-gray-900/50 hover:bg-gray-800/50 border border-transparent"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{portfolio.name}</span>
                      <span className="text-xs text-gray-400">Risco: {getRiskLabel(portfolio.riskLevel)}</span>
                    </div>
                    <Badge className={getPerformanceColor(portfolio.performance.weekly)}>
                      {portfolio.performance.weekly > 0 ? "+" : ""}
                      {portfolio.performance.weekly.toFixed(2)}%
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
            <CardFooter className="border-t border-gray-800 pt-4 flex justify-between">
              <div className="text-xs text-gray-400">
                <Calendar className="h-3 w-3 inline mr-1" />
                Última atualização: {selectedPortfolio ? formatDate(selectedPortfolio.lastUpdated) : ""}
              </div>
              <Button variant="link" size="sm" className="text-amber-500 p-0">
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
            </CardFooter>
          </Card>

          {selectedPortfolio && (
            <Card className="bg-black/50 border-amber-500/30 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl text-amber-500">Desempenho</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Diário</span>
                    <span className={getPerformanceColor(selectedPortfolio.performance.daily)}>
                      {selectedPortfolio.performance.daily > 0 ? "+" : ""}
                      {selectedPortfolio.performance.daily.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Semanal</span>
                    <span className={getPerformanceColor(selectedPortfolio.performance.weekly)}>
                      {selectedPortfolio.performance.weekly > 0 ? "+" : ""}
                      {selectedPortfolio.performance.weekly.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Mensal</span>
                    <span className={getPerformanceColor(selectedPortfolio.performance.monthly)}>
                      {selectedPortfolio.performance.monthly > 0 ? "+" : ""}
                      {selectedPortfolio.performance.monthly.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Anual</span>
                    <span className={getPerformanceColor(selectedPortfolio.performance.yearly)}>
                      {selectedPortfolio.performance.yearly > 0 ? "+" : ""}
                      {selectedPortfolio.performance.yearly.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/30">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-300">
                <p className="mb-2">
                  <strong className="text-amber-500">Importante:</strong> Estes portfólios são atualizados semanalmente
                  pelos especialistas da MoreThanMoney.
                </p>
                <p>
                  As alocações são sugestões de investimento e não constituem aconselhamento financeiro personalizado.
                  Invista de acordo com seu perfil de risco e objetivos.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedPortfolio ? (
            <div className="space-y-6">
              <Card className="bg-black/50 border-amber-500/30 backdrop-blur-sm overflow-hidden">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl text-amber-500">{selectedPortfolio.name}</CardTitle>
                      <CardDescription className="mt-1">{selectedPortfolio.description}</CardDescription>
                    </div>
                    <Badge className={getRiskBadgeColor(selectedPortfolio.riskLevel)}>
                      Risco {getRiskLabel(selectedPortfolio.riskLevel)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-medium text-amber-400">Alocação Atual</h3>
                      <div className="flex items-center text-xs text-gray-400">
                        <Clock className="h-3 w-3 mr-1" />
                        Próxima atualização em {getDaysUntilNextUpdate(selectedPortfolio.nextUpdate)} dias
                      </div>
                    </div>

                    <div className="space-y-3">
                      {selectedPortfolio.assets.map((asset, index) => (
                        <div key={index} className="relative">
                          <div
                            className="flex justify-between items-center p-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition-all cursor-pointer"
                            onClick={() => {
                              if (showAssetDetails === index) {
                                setShowAssetDetails(null)
                              } else {
                                setShowAssetDetails(index)
                              }
                            }}
                          >
                            <div className="flex items-center">
                              {asset.trend === "up" && <TrendingUp className="h-4 w-4 text-green-500 mr-2" />}
                              {asset.trend === "down" && <TrendingDown className="h-4 w-4 text-red-500 mr-2" />}
                              {asset.trend === "neutral" && <BarChart2 className="h-4 w-4 text-gray-400 mr-2" />}
                              <div>
                                <span className="font-medium">{asset.name}</span>
                                <span className="text-xs text-gray-400 ml-2">{asset.ticker}</span>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <span className="font-mono mr-4">{asset.allocation}%</span>
                              <span
                                className={`text-sm ${asset.change > 0 ? "text-green-500" : asset.change < 0 ? "text-red-500" : "text-gray-400"}`}
                              >
                                {asset.change > 0 ? "+" : ""}
                                {asset.change.toFixed(2)}%
                              </span>
                              <Info className="h-4 w-4 text-amber-500 ml-2 cursor-pointer" />
                            </div>
                          </div>

                          {showAssetDetails === index && (
                            <div className="mt-1 p-3 rounded-lg bg-gray-900/70 border border-amber-500/20">
                              <p className="text-sm text-gray-300 mb-2">
                                {asset.reason ||
                                  `Justificativa para alocação de ${asset.allocation}% em ${asset.name}.`}
                              </p>
                              {asset.price && (
                                <div className="flex justify-between text-xs text-gray-400">
                                  <span>Preço atual: ${asset.price.toFixed(2)}</span>
                                  <Button variant="link" size="sm" className="text-amber-500 p-0 h-auto">
                                    <ExternalLink className="h-3 w-3 mr-1" /> Ver análise
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-800">
                    <h3 className="text-lg font-medium text-amber-400 mb-3">Visualização da Alocação</h3>
                    <div className="h-12 w-full bg-gray-900 rounded-lg overflow-hidden flex">
                      {selectedPortfolio.assets.map((asset, index) => (
                        <div
                          key={index}
                          className="h-full flex items-center justify-center text-xs font-medium"
                          style={{
                            width: `${asset.allocation}%`,
                            backgroundColor: getAssetColor(index),
                          }}
                          title={`${asset.name}: ${asset.allocation}%`}
                        >
                          {asset.allocation >= 10 ? `${asset.allocation}%` : ""}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedPortfolio.assets.map((asset, index) => (
                        <div key={index} className="flex items-center text-xs">
                          <div
                            className="w-3 h-3 rounded-full mr-1"
                            style={{ backgroundColor: getAssetColor(index) }}
                          ></div>
                          <span>{asset.ticker}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-gray-800 pt-4 flex justify-between">
                  <Button variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
                    <PieChart className="h-4 w-4 mr-2" /> Ver Análise Completa
                  </Button>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-black"
                    onClick={() =>
                      window.open(
                        "https://harmonious-comma-e85.notion.site/Portefolio-Cripto-e-Stocks-76557dddfbc348aba2f6e24ea1f5133e?source=copy_link",
                        "_blank",
                      )
                    }
                  >
                    Ver Portfólio Completo
                  </Button>
                </CardFooter>
              </Card>

              <Card className="bg-black/50 border-amber-500/30 backdrop-blur-sm overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-xl text-amber-500">Histórico de Atualizações</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-2 border-amber-500 pl-4 pb-6 relative">
                      <div className="absolute w-3 h-3 bg-amber-500 rounded-full -left-[7px] top-0"></div>
                      <h4 className="font-medium">{formatDate(selectedPortfolio.lastUpdated)}</h4>
                      <p className="text-sm text-gray-300 mt-1">
                        Atualização semanal com ajustes na alocação baseados nas condições atuais de mercado.
                        {selectedPortfolio.type === "crypto" &&
                          " Aumento na exposição a Bitcoin devido à aprovação do ETF."}
                        {selectedPortfolio.type === "stocks" &&
                          " Redução na exposição a tecnologia devido a resultados trimestrais abaixo do esperado."}
                      </p>
                    </div>

                    <div className="border-l-2 border-gray-700 pl-4 pb-6 relative">
                      <div className="absolute w-3 h-3 bg-gray-700 rounded-full -left-[7px] top-0"></div>
                      <h4 className="font-medium">
                        {formatDate(
                          new Date(
                            new Date(selectedPortfolio.lastUpdated).getTime() - 7 * 24 * 60 * 60 * 1000,
                          ).toString(),
                        )}
                      </h4>
                      <p className="text-sm text-gray-400 mt-1">
                        Ajustes menores na alocação para otimizar o desempenho do portfólio.
                        {selectedPortfolio.type === "crypto" &&
                          " Redução na exposição a altcoins de menor capitalização."}
                        {selectedPortfolio.type === "stocks" && " Aumento na exposição a setores defensivos."}
                      </p>
                    </div>

                    <div className="border-l-2 border-gray-700 pl-4 relative">
                      <div className="absolute w-3 h-3 bg-gray-700 rounded-full -left-[7px] top-0"></div>
                      <h4 className="font-medium">
                        {formatDate(
                          new Date(
                            new Date(selectedPortfolio.lastUpdated).getTime() - 14 * 24 * 60 * 60 * 1000,
                          ).toString(),
                        )}
                      </h4>
                      <p className="text-sm text-gray-400 mt-1">
                        Rebalanceamento trimestral com revisão completa da estratégia.
                        {selectedPortfolio.type === "crypto" &&
                          " Inclusão de novos projetos promissores no setor DeFi."}
                        {selectedPortfolio.type === "stocks" &&
                          " Rotação setorial para capturar tendências emergentes."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-gray-900/50 rounded-lg border border-gray-800 p-8">
              <PieChart className="h-16 w-16 text-amber-500/50 mb-4" />
              <h3 className="text-xl font-medium text-amber-500 mb-2">Selecione um Portfólio</h3>
              <p className="text-gray-400 text-center max-w-md">
                Escolha um dos nossos portfólios inteligentes no painel à esquerda para visualizar sua composição e
                desempenho.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Funções auxiliares
function getRiskLabel(risk: string) {
  switch (risk) {
    case "low":
      return "Baixo"
    case "medium":
      return "Médio"
    case "high":
      return "Alto"
    default:
      return "Médio"
  }
}

function getRiskBadgeColor(risk: string) {
  switch (risk) {
    case "low":
      return "bg-green-500/20 text-green-500"
    case "medium":
      return "bg-amber-500/20 text-amber-500"
    case "high":
      return "bg-red-500/20 text-red-500"
    default:
      return "bg-amber-500/20 text-amber-500"
  }
}

function getPerformanceColor(value: number) {
  if (value > 0) return "bg-green-500/20 text-green-500"
  if (value < 0) return "bg-red-500/20 text-red-500"
  return "bg-gray-500/20 text-gray-400"
}

function getAssetColor(index: number) {
  const colors = [
    "#F59E0B", // amber-500
    "#10B981", // emerald-500
    "#3B82F6", // blue-500
    "#8B5CF6", // violet-500
    "#EC4899", // pink-500
    "#F97316", // orange-500
    "#14B8A6", // teal-500
    "#6366F1", // indigo-500
    "#D946EF", // fuchsia-500
    "#EF4444", // red-500
  ]
  return colors[index % colors.length]
}

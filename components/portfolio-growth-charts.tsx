"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { TrendingUp, BarChart3, PieChart, Loader2, RefreshCw } from "lucide-react"

interface PortfolioGrowthChartsProps {
  cryptoAssets?: any[]
  etfAssets?: any[]
}

export default function PortfolioGrowthCharts({ cryptoAssets = [], etfAssets = [] }: PortfolioGrowthChartsProps) {
  const [realTimeData, setRealTimeData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRealTimeData()
    
    // Auto-sincronização a cada 2 minutos
    const interval = setInterval(loadRealTimeData, 120000)
    return () => clearInterval(interval)
  }, [])

  const loadRealTimeData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/portfolio/mtm?type=all')
      const result = await response.json()
      
      if (result.success) {
        setRealTimeData(result.data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calcular valores reais atuais baseados nos dados da API
  const cryptoTotals = realTimeData?.crypto?.totals || {}
  const etfTotals = realTimeData?.etf?.totals || {}
  
  // Valores reais de investimento
  const cryptoInitialInvestment = cryptoTotals.investimento_total || 775
  const cryptoMonthlyDCA = cryptoTotals.reforco_mensal || 280
  const cryptoAnnualDCA = cryptoTotals.reforco_anual || 3360
  const cryptoCurrentValue = cryptoAssets.reduce((sum, asset) => {
    return sum + (asset.current_value || asset.total_invested || 0)
  }, 0)
  const cryptoTotalInvested = cryptoAssets.reduce((sum, asset) => {
    return sum + (asset.total_invested || 0)
  }, 0) || cryptoInitialInvestment

  const etfInitialInvestment = etfTotals.investimento_total || 100
  const etfWeeklyDCA = etfTotals.reforco_semanal || 25
  const etfAnnualDCA = (etfWeeklyDCA * 52) || 1300
  const etfCurrentValue = etfAssets.reduce((sum, asset) => {
    return sum + (asset.current_value || asset.total_invested || 0)
  }, 0)
  const etfTotalInvested = etfAssets.reduce((sum, asset) => {
    return sum + (asset.total_invested || 0)
  }, 0) || etfInitialInvestment

  // Calcular crescimento real atual baseado nos dados da API
  const cryptoGrowthRate = cryptoTotalInvested > 0 
    ? ((cryptoCurrentValue - cryptoTotalInvested) / cryptoTotalInvested) 
    : 0
  const etfGrowthRate = etfTotalInvested > 0 
    ? ((etfCurrentValue - etfTotalInvested) / etfTotalInvested) 
    : 0

  // Usar taxa de crescimento potencial se disponível, senão usar taxa real ou fallback conservador
  const cryptoPotentialGrowth = cryptoTotals.crescimento_potencial || 0
  const cryptoPotentialRate = cryptoTotalInvested > 0 && cryptoPotentialGrowth > 0
    ? (cryptoPotentialGrowth / cryptoTotalInvested) / 5 // Taxa anual para 5 anos
    : cryptoGrowthRate > 0 
      ? cryptoGrowthRate * 0.8 // 80% da taxa atual (conservador)
      : 0.3 // Fallback 30% ao ano

  const etfPotentialGrowth = etfTotals.crescimento_esperado || 0
  const etfPotentialRate = etfTotalInvested > 0 && etfPotentialGrowth > 0
    ? (etfPotentialGrowth / etfTotalInvested) / 5 // Taxa anual para 5 anos
    : etfGrowthRate > 0
      ? etfGrowthRate * 0.8 // 80% da taxa atual (conservador)
      : 0.25 // Fallback 25% ao ano

  // Dados de crescimento para Crypto (5 anos) - baseado em dados reais do DCA
  const calculateCryptoGrowthData = () => {
    const initial = cryptoInitialInvestment
    const monthly = cryptoMonthlyDCA
    const annualRate = cryptoPotentialRate
    
    let invested = initial
    let value = cryptoCurrentValue > 0 ? cryptoCurrentValue : initial * (1 + annualRate)
    
    const data = [
      { 
        year: 'Mar 2025', 
        investido: Math.round(invested), 
        valor: Math.round(value), 
        crescimento: Math.round(value - invested) 
      }
    ]
    
    // Projeção para 5 anos com DCA mensal
    for (let year = 1; year <= 5; year++) {
      // Adicionar reforço anual (12 meses)
      const annualDCA = monthly * 12
      invested += annualDCA
      
      // Aplicar crescimento composto: valor existente cresce + novo investimento cresce parcialmente
      value = value * (1 + annualRate) + (annualDCA * (1 + annualRate * 0.5))
      
      const growth = value - invested
      data.push({
        year: `Ano ${year}`,
        investido: Math.round(invested),
        valor: Math.round(value),
        crescimento: Math.round(growth)
      })
    }
    
    return data
  }

  const cryptoGrowthData = calculateCryptoGrowthData()

  // Dados de crescimento para ETF (5 anos) - baseado em dados reais do DCA
  const calculateETFGrowthData = () => {
    const initial = etfInitialInvestment
    const weekly = etfWeeklyDCA
    const annualRate = etfPotentialRate
    
    let invested = initial
    let value = etfCurrentValue > 0 ? etfCurrentValue : initial * (1 + annualRate)
    
    const data = [
      { 
        year: 'Ano 0', 
        investido: Math.round(invested), 
        valor: Math.round(value), 
        crescimento: Math.round(value - invested) 
      }
    ]
    
    // Projeção para 5 anos com DCA semanal
    for (let year = 1; year <= 5; year++) {
      // Adicionar reforço anual (52 semanas)
      const annualDCA = weekly * 52
      invested += annualDCA
      
      // Aplicar crescimento composto: valor existente cresce + novo investimento cresce parcialmente
      value = value * (1 + annualRate) + (annualDCA * (1 + annualRate * 0.5))
      
      const growth = value - invested
      data.push({
        year: `Ano ${year}`,
        investido: Math.round(invested),
        valor: Math.round(value),
        crescimento: Math.round(growth)
      })
    }
    
    return data
  }

  const etfGrowthData = calculateETFGrowthData()

  // Dados de DCA mensal para Crypto - baseado em dados reais
  const cryptoDCAData = (() => {
    const monthly = cryptoMonthlyDCA
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    let acumulado = 0
    
    return months.map((mes, index) => {
      acumulado += monthly
      return {
        mes,
        reforco: monthly,
        acumulado: Math.round(acumulado)
      }
    })
  })()

  // Dados de DCA semanal para ETF (primeiro ano) - baseado em dados reais
  const etfDCAData = (() => {
    const weekly = etfWeeklyDCA
    const weeks = ['S1-4', 'S5-8', 'S9-12', 'S13-16', 'S17-20', 'S21-24', 'S25-28', 'S29-32', 'S33-36', 'S37-40', 'S41-44', 'S45-48', 'S49-52']
    let acumulado = 0
    
    return weeks.map((semana) => {
      acumulado += weekly * 4 // 4 semanas por período
      return {
        semana,
        reforco: weekly * 4,
        acumulado: Math.round(acumulado)
      }
    })
  })()

  return (
    <div className="space-y-6">
      <Tabs defaultValue="crypto" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-gray-900 border-[#D2A63C]/30">
          <TabsTrigger value="crypto" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
            Crescimento Crypto
          </TabsTrigger>
          <TabsTrigger value="etf" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
            Crescimento ETF
          </TabsTrigger>
        </TabsList>

        {/* Crypto Charts */}
        <TabsContent value="crypto" className="space-y-6 mt-6">
          {/* Gráfico de Crescimento 5 Anos */}
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Projeção de Crescimento Crypto (5 Anos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cryptoGrowthData}>
                  <defs>
                    <linearGradient id="colorInvestido" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D2A63C" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#D2A63C" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="year" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #D2A63C' }}
                    formatter={(value: number) => `€${value.toFixed(0)}`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="investido" stroke="#D2A63C" fillOpacity={1} fill="url(#colorInvestido)" name="Investido" />
                  <Area type="monotone" dataKey="valor" stroke="#10b981" fillOpacity={1} fill="url(#colorValor)" name="Valor Estimado" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-gray-400">Total Investido</div>
                  <div className="text-lg font-bold text-[#D2A63C]">
                    €{cryptoGrowthData[cryptoGrowthData.length - 1]?.investido?.toLocaleString('pt-PT') || '0'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Valor Estimado</div>
                  <div className="text-lg font-bold text-green-400">
                    €{cryptoGrowthData[cryptoGrowthData.length - 1]?.valor?.toLocaleString('pt-PT') || '0'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Crescimento</div>
                  <div className="text-lg font-bold text-white">
                    €{cryptoGrowthData[cryptoGrowthData.length - 1]?.crescimento?.toLocaleString('pt-PT') || '0'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico de DCA Mensal */}
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Reforços Mensais DCA (Ano 1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cryptoDCAData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="mes" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #D2A63C' }}
                    formatter={(value: number) => `€${value}`}
                  />
                  <Legend />
                  <Bar dataKey="reforco" fill="#D2A63C" name="Reforço Mensal" />
                  <Bar dataKey="acumulado" fill="#BB8525" name="Total Acumulado" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 text-center">
                <div className="text-xs text-gray-400">Reforço Mensal Recomendado</div>
                <div className="text-2xl font-bold text-[#D2A63C]">€{cryptoMonthlyDCA}/mês</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ETF Charts */}
        <TabsContent value="etf" className="space-y-6 mt-6">
          {/* Gráfico de Crescimento 5 Anos */}
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Projeção de Crescimento ETF (5 Anos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={etfGrowthData}>
                  <defs>
                    <linearGradient id="colorInvestidoETF" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D2A63C" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#D2A63C" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorValorETF" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="year" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #D2A63C' }}
                    formatter={(value: number) => `€${value.toFixed(0)}`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="investido" stroke="#D2A63C" fillOpacity={1} fill="url(#colorInvestidoETF)" name="Investido" />
                  <Area type="monotone" dataKey="valor" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValorETF)" name="Valor Estimado" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-gray-400">Total Investido</div>
                  <div className="text-lg font-bold text-[#D2A63C]">
                    €{etfGrowthData[etfGrowthData.length - 1]?.investido?.toLocaleString('pt-PT') || '0'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Valor Estimado</div>
                  <div className="text-lg font-bold text-blue-400">
                    €{etfGrowthData[etfGrowthData.length - 1]?.valor?.toLocaleString('pt-PT') || '0'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Crescimento</div>
                  <div className="text-lg font-bold text-white">
                    €{etfGrowthData[etfGrowthData.length - 1]?.crescimento?.toLocaleString('pt-PT') || '0'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico de DCA Semanal */}
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Reforços Semanais DCA (Ano 1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={etfDCAData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="semana" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #D2A63C' }}
                    formatter={(value: number) => `€${value}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="acumulado" stroke="#3b82f6" strokeWidth={3} name="Total Acumulado" />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 text-center">
                <div className="text-xs text-gray-400">Reforço Semanal Recomendado</div>
                <div className="text-2xl font-bold text-[#D2A63C]">€{etfWeeklyDCA}/semana</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Comparação Total */}
      <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-[#D2A63C]/50">
        <CardHeader>
          <CardTitle className="text-[#D2A63C] flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Resumo Total do Portfólio (5 Anos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Total Investido</div>
              <div className="text-3xl font-bold text-[#D2A63C]">
                €{((cryptoGrowthData[cryptoGrowthData.length - 1]?.investido || 0) + (etfGrowthData[etfGrowthData.length - 1]?.investido || 0)).toLocaleString('pt-PT')}
              </div>
              <div className="text-xs text-gray-500 mt-1">Crypto + ETF</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Crescimento Projetado</div>
              <div className="text-3xl font-bold text-green-400">
                €{((cryptoGrowthData[cryptoGrowthData.length - 1]?.valor || 0) + (etfGrowthData[etfGrowthData.length - 1]?.valor || 0)).toLocaleString('pt-PT')}
              </div>
              <div className="text-xs text-gray-500 mt-1">Projeção baseada em dados reais</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Multiplicação</div>
              <div className="text-3xl font-bold text-white">
                ~{((((cryptoGrowthData[cryptoGrowthData.length - 1]?.valor || 0) + (etfGrowthData[etfGrowthData.length - 1]?.valor || 0)) / 
                   ((cryptoGrowthData[cryptoGrowthData.length - 1]?.investido || 1) + (etfGrowthData[etfGrowthData.length - 1]?.investido || 1))).toFixed(1))}x
              </div>
              <div className="text-xs text-gray-500 mt-1">Em 5 anos</div>
            </div>
          </div>

          <div className="mt-6 bg-[#D2A63C]/10 p-4 rounded-lg border border-[#D2A63C]/30">
            <p className="text-sm text-gray-300 text-center">
              <strong className="text-[#D2A63C]">Together we go further.</strong><br />
              Seguindo o plano com disciplina, esta projeção aproxima-nos do objetivo de liberdade financeira compartilhada.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


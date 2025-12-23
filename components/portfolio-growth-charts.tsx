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

  // Calcular valores reais atuais
  const currentCryptoValue = cryptoAssets.reduce((sum, asset) => {
    return sum + (asset.current_price || 0) * (asset.allocation_percent || 0)
  }, 0)

  const currentETFValue = etfAssets.reduce((sum, asset) => {
    return sum + (asset.current_price || 0) * (asset.allocation_percent || 0)
  }, 0)
  // Dados de crescimento simulado para Crypto (5 anos)
  // Base: Investimento inicial €775 + €280/mês × 12 meses × 5 anos = €17.575
  // Crescimento potencial total: €22.810
  const cryptoGrowthData = [
    { year: 'Mar 2025', investido: 775, valor: 775, crescimento: 0 },
    { year: 'Ano 1', investido: 4135, valor: 6500, crescimento: 2365 },
    { year: 'Ano 2', investido: 7495, valor: 12000, crescimento: 4505 },
    { year: 'Ano 3', investido: 10855, valor: 16500, crescimento: 5645 },
    { year: 'Ano 4', investido: 14215, valor: 19800, crescimento: 5585 },
    { year: 'Ano 5', investido: 17575, valor: 22810, crescimento: 5235 },
  ]

  // Dados de crescimento para ETF (5 anos)
  const etfGrowthData = [
    { year: 'Ano 0', investido: 100, valor: 100, crescimento: 0 },
    { year: 'Ano 1', investido: 1400, valor: 1800, crescimento: 400 },
    { year: 'Ano 2', investido: 2700, valor: 4500, crescimento: 1800 },
    { year: 'Ano 3', investido: 4000, valor: 8200, crescimento: 4200 },
    { year: 'Ano 4', investido: 5300, valor: 13500, crescimento: 8200 },
    { year: 'Ano 5', investido: 6600, valor: 20150, crescimento: 13550 },
  ]

  // Dados de DCA mensal para Crypto
  const cryptoDCAData = [
    { mes: 'Jan', reforco: 280, acumulado: 280 },
    { mes: 'Fev', reforco: 280, acumulado: 560 },
    { mes: 'Mar', reforco: 280, acumulado: 840 },
    { mes: 'Abr', reforco: 280, acumulado: 1120 },
    { mes: 'Mai', reforco: 280, acumulado: 1400 },
    { mes: 'Jun', reforco: 280, acumulado: 1680 },
    { mes: 'Jul', reforco: 280, acumulado: 1960 },
    { mes: 'Ago', reforco: 280, acumulado: 2240 },
    { mes: 'Set', reforco: 280, acumulado: 2520 },
    { mes: 'Out', reforco: 280, acumulado: 2800 },
    { mes: 'Nov', reforco: 280, acumulado: 3080 },
    { mes: 'Dez', reforco: 280, acumulado: 3360 },
  ]

  // Dados de DCA semanal para ETF (primeiro ano)
  const etfDCAData = [
    { semana: 'S1-4', reforco: 100, acumulado: 100 },
    { semana: 'S5-8', reforco: 100, acumulado: 200 },
    { semana: 'S9-12', reforco: 100, acumulado: 300 },
    { semana: 'S13-16', reforco: 100, acumulado: 400 },
    { semana: 'S17-20', reforco: 100, acumulado: 500 },
    { semana: 'S21-24', reforco: 100, acumulado: 600 },
    { semana: 'S25-28', reforco: 100, acumulado: 700 },
    { semana: 'S29-32', reforco: 100, acumulado: 800 },
    { semana: 'S33-36', reforco: 100, acumulado: 900 },
    { semana: 'S37-40', reforco: 100, acumulado: 1000 },
    { semana: 'S41-44', reforco: 100, acumulado: 1100 },
    { semana: 'S45-48', reforco: 100, acumulado: 1200 },
    { semana: 'S49-52', reforco: 100, acumulado: 1300 },
  ]

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
                  <div className="text-lg font-bold text-[#D2A63C]">€18.975</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Valor Estimado</div>
                  <div className="text-lg font-bold text-green-400">€22.810</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Crescimento</div>
                  <div className="text-lg font-bold text-white">€3.835</div>
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
                <div className="text-2xl font-bold text-[#D2A63C]">€280/mês</div>
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
                  <div className="text-lg font-bold text-[#D2A63C]">€6.600</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Valor Estimado</div>
                  <div className="text-lg font-bold text-blue-400">€20.150</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Crescimento</div>
                  <div className="text-lg font-bold text-white">€13.550</div>
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
                <div className="text-2xl font-bold text-[#D2A63C]">€25/semana</div>
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
              <div className="text-3xl font-bold text-[#D2A63C]">€10.275</div>
              <div className="text-xs text-gray-500 mt-1">Crypto + ETF</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Crescimento Simulado</div>
              <div className="text-3xl font-bold text-green-400">€40.025</div>
              <div className="text-xs text-gray-500 mt-1">Projeção conservadora</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Multiplicação</div>
              <div className="text-3xl font-bold text-white">~4x</div>
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


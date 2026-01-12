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
  Users, 
  Mail, 
  Eye, 
  MousePointer,
  BarChart3,
  Calendar,
  Download,
  RefreshCw,
  Activity,
  DollarSign,
  Clock,
  Brain,
  Lightbulb
} from "lucide-react"
import { supabase } from "@/lib/supabase"

interface AnalyticsData {
  userStats: {
    total: number
    active: number
    newThisWeek: number
    retention: number
  }
  emailStats: {
    totalSent: number
    openRate: number
    clickRate: number
    bounceRate: number
  }
  socialStats?: {
    totalPosts: number
    newPosts: number
    totalLikes: number
    totalComments: number
    avgEngagement: number
  }
  contentStats?: {
    totalViews: number
    uniqueVisitors: number
    avgTimeOnSite: number
    pagesPerSession: number
  }
  revenueStats?: {
    totalRevenue: number
    monthlyRevenue: number
    conversionRate: number
  }
  aiStats?: {
    totalEvents: number
    successfulEvents: number
    failedEvents: number
    successRate: string
    avgResponseTime: number
    topFeatures: Array<{ feature: string; count: number }>
    suggestions: string[]
  }
}

export default function AnalyticsManager() {
  const [mounted, setMounted] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("7days")
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      loadAnalytics()
      
      // Auto-refresh a cada 60 segundos
      const refreshInterval = setInterval(() => {
        loadAnalytics()
      }, 60000)
      
      // Real-time subscriptions para métricas importantes
      const postsChannel = supabase
        .channel('analytics-posts')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'posts'
          },
          () => {
            loadAnalytics()
          }
        )
        .subscribe()

      const campaignsChannel = supabase
        .channel('analytics-campaigns')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'email_campaigns'
          },
          () => {
            loadAnalytics()
          }
        )
        .subscribe()

      return () => {
        clearInterval(refreshInterval)
        supabase.removeChannel(postsChannel)
        supabase.removeChannel(campaignsChannel)
      }
    }
  }, [mounted, timeRange])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const [analyticsResponse, aiInsightsResponse] = await Promise.all([
        fetch(`/api/admin/analytics?range=${timeRange}`),
        fetch(`/api/admin/ai-insights?range=${timeRange}`)
      ])
      
      const analyticsData = await analyticsResponse.json()
      const aiInsightsData = await aiInsightsResponse.json()
      
      if (analyticsData.success) {
        const combinedData = {
          ...analyticsData.data,
          aiStats: aiInsightsData.success ? aiInsightsData.data : undefined
        }
        setAnalytics(combinedData)
      }
    } catch (error) {
      console.error('Erro ao carregar analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAnalytics()
    setRefreshing(false)
  }

  const exportData = () => {
    if (!analytics) return
    
    const csvContent = [
      ['Métrica', 'Valor'],
      ['Total de Utilizadores', analytics.userStats.total],
      ['Utilizadores Ativos', analytics.userStats.active],
      ['Novos Esta Semana', analytics.userStats.newThisWeek],
      ['Taxa de Retenção', `${analytics.userStats.retention}%`],
      ['Emails Enviados', analytics.emailStats.totalSent],
      ['Taxa de Abertura', `${analytics.emailStats.openRate}%`],
      ['Taxa de Cliques', `${analytics.emailStats.clickRate}%`],
      ['Total de Visualizações', analytics.contentStats.totalViews],
      ['Visitantes Únicos', analytics.contentStats.uniqueVisitors],
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <Card className="bg-gray-900/50 border-[#D2A63C]/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-[#D2A63C]" />
            <span className="ml-2 text-gray-300">Carregando analytics...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card className="bg-gray-900/50 border-red-500/30">
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-red-400">Erro ao carregar dados de analytics</p>
            <Button onClick={handleRefresh} className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar Novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#D2A63C] flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Analytics Dashboard
            {refreshing && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Atualizando...
              </span>
            )}
          </h2>
          <p className="text-gray-400">Métricas e insights da plataforma em tempo real</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-48 bg-gray-800 border-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24hours">Últimas 24 horas</SelectItem>
              <SelectItem value="7days">Últimos 7 dias</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
              <SelectItem value="90days">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing}
            variant="outline"
            className="border-[#D2A63C]/30"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={exportData} className="bg-[#D2A63C] hover:bg-[#BB8525]">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* User Stats */}
        <Card className="bg-gray-900/50 border-blue-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-400 flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Utilizadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total</span>
                <span className="text-white font-semibold">{analytics.userStats.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Ativos</span>
                <span className="text-blue-400 font-semibold">{analytics.userStats.active}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Novos (7d)</span>
                <span className="text-green-400 font-semibold">{analytics.userStats.newThisWeek}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Retenção</span>
                <Badge className="bg-green-500/20 text-green-400">
                  {analytics.userStats.retention}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Stats */}
        <Card className="bg-gray-900/50 border-purple-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-purple-400 flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4" />
              Email Marketing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Enviados</span>
                <span className="text-white font-semibold">{analytics.emailStats.totalSent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Abertura</span>
                <span className="text-blue-400 font-semibold">{analytics.emailStats.openRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Cliques</span>
                <span className="text-purple-400 font-semibold">{analytics.emailStats.clickRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Bounce</span>
                <Badge className="bg-red-500/20 text-red-400">
                  {analytics.emailStats.bounceRate}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Feed Stats */}
        <Card className="bg-gray-900/50 border-purple-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-purple-400 flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Social Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total Posts</span>
                <span className="text-white font-semibold">{analytics.socialStats?.totalPosts || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Novos</span>
                <Badge className="bg-purple-500/20 text-purple-400">+{analytics.socialStats?.newPosts || 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total Likes</span>
                <span className="text-red-400 font-semibold">{analytics.socialStats?.totalLikes || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Comentários</span>
                <span className="text-blue-400 font-semibold">{analytics.socialStats?.totalComments || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Engagement</span>
                <span className="text-[#D2A63C] font-semibold">{analytics.socialStats?.avgEngagement || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Stats */}
        {analytics.contentStats && (
        <Card className="bg-gray-900/50 border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-400 flex items-center gap-2 text-sm">
              <Eye className="w-4 h-4" />
              Conteúdo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Visualizações</span>
                <span className="text-white font-semibold">{analytics.contentStats.totalViews.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Visitantes</span>
                <span className="text-green-400 font-semibold">{analytics.contentStats.uniqueVisitors.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Tempo médio</span>
                <span className="text-blue-400 font-semibold">{Math.round(analytics.contentStats.avgTimeOnSite / 60)}min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Páginas/sessão</span>
                <span className="text-purple-400 font-semibold">{analytics.contentStats.pagesPerSession}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Performance Stats */}
        <Card className="bg-gray-900/50 border-[#D2A63C]/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-[#D2A63C] flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Uptime</span>
                <Badge className="bg-green-500/20 text-green-400">99.9%</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Tempo resposta</span>
                <span className="text-blue-400 font-semibold">245ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Erros (24h)</span>
                <span className="text-red-400 font-semibold">0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Cache hit</span>
                <span className="text-purple-400 font-semibold">92%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <Card className="bg-gray-900/50 border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Crescimento de Utilizadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Gráfico será implementado com Chart.js</p>
                <p className="text-sm">Dados disponíveis: {analytics.userStats.total} utilizadores</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Performance */}
        <Card className="bg-gray-900/50 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-purple-400 flex items-center gap-2">
              <MousePointer className="w-5 h-5" />
              Performance de Emails
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-300">Taxa de Abertura</span>
                </div>
                <span className="text-blue-400 font-semibold">{analytics.emailStats.openRate}%</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-gray-300">Taxa de Cliques</span>
                </div>
                <span className="text-purple-400 font-semibold">{analytics.emailStats.clickRate}%</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-gray-300">Taxa de Bounce</span>
                </div>
                <span className="text-red-400 font-semibold">{analytics.emailStats.bounceRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-gray-900/50 border-gray-600/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-[#D2A63C] rounded-full"></div>
                  <span className="text-gray-300">
                    {i === 1 && "Novo utilizador registado"}
                    {i === 2 && "Email marketing enviado"}
                    {i === 3 && "Portfolio atualizado"}
                    {i === 4 && "Documento adicionado"}
                    {i === 5 && "Sistema reiniciado"}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">
                  há {i} {i === 1 ? 'hora' : 'horas'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Insights Section */}
      {analytics?.aiStats && (
        <div className="mt-8 space-y-4">
          <h3 className="text-xl font-bold text-[#D2A63C] flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Insights de IA
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Stats */}
            <Card className="bg-gray-900/50 border-cyan-500/30">
              <CardHeader>
                <CardTitle className="text-cyan-400 flex items-center gap-2 text-sm">
                  <Activity className="w-4 h-4" />
                  Estatísticas de IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Total de Eventos</span>
                    <span className="text-white font-semibold">{analytics.aiStats.totalEvents}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Taxa de Sucesso</span>
                    <Badge className="bg-green-500/20 text-green-400">
                      {analytics.aiStats.successRate}%
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Tempo Médio</span>
                    <span className="text-cyan-400 font-semibold">{analytics.aiStats.avgResponseTime}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Erros</span>
                    <span className="text-red-400 font-semibold">{analytics.aiStats.failedEvents}</span>
                  </div>
                </div>
                
                {analytics.aiStats.topFeatures.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-gray-400 text-xs mb-2">Features Mais Usadas:</p>
                    <div className="space-y-1">
                      {analytics.aiStats.topFeatures.map((feature, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-gray-300">{feature.feature}</span>
                          <span className="text-[#D2A63C]">{feature.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card className="bg-gray-900/50 border-yellow-500/30">
              <CardHeader>
                <CardTitle className="text-yellow-400 flex items-center gap-2 text-sm">
                  <Lightbulb className="w-4 h-4" />
                  Sugestões de Melhoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.aiStats.suggestions.length > 0 ? (
                  <ul className="space-y-2">
                    {analytics.aiStats.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-[#D2A63C] mt-1">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400 text-sm">Nenhuma sugestão disponível no momento.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

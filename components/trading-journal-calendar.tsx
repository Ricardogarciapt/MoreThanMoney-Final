"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, TrendingDown, Target, BarChart3 } from "lucide-react"

interface TradingMetrics {
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_pnl: number
  total_risk: number
  avg_rr: number
  profit_factor: number
  net_pnl: number
}

interface Trade {
  id: string
  symbol: string
  direction: 'long' | 'short'
  entry_price: number
  exit_price?: number
  pnl?: number
  pnl_percent?: number
  status: 'open' | 'closed' | 'stopped' | 'hit_tp'
  opened_at: string
  closed_at?: string
}

export default function TradingJournalCalendar() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<TradingMetrics | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7))
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    loadMetrics()
    loadTrades()
  }, [currentMonth])

  const loadMetrics = async () => {
    try {
      const [year, month] = currentMonth.split('-')
      const startDate = `${year}-${month}-01`
      const endDate = `${year}-${month}-31`
      
      const response = await fetch(`/api/trading-plans/metrics?start_date=${startDate}&end_date=${endDate}`)
      const data = await response.json()
      
      if (data.success) {
        setMetrics(data.metrics)
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTrades = async () => {
    try {
      const response = await fetch(`/api/trading-plans/trades?month=${currentMonth}`)
      const data = await response.json()
      
      if (data.success) {
        setTrades(data.trades)
      }
    } catch (error) {
      console.error('Erro ao carregar trades:', error)
    }
  }

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const current = new Date(currentMonth + '-01')
    if (direction === 'prev') {
      current.setMonth(current.getMonth() - 1)
    } else {
      current.setMonth(current.getMonth() + 1)
    }
    setCurrentMonth(current.toISOString().slice(0, 7))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    )
  }

  const monthName = new Date(currentMonth + '-01').toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Header com navegação */}
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-white capitalize">{monthName}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => handleMonthChange('prev')}
            className="px-3 py-1 bg-gray-800 text-gray-300 rounded hover:bg-gray-700"
          >
            ‹
          </button>
          <button
            onClick={() => handleMonthChange('next')}
            className="px-3 py-1 bg-gray-800 text-gray-300 rounded hover:bg-gray-700"
            disabled={currentMonth >= new Date().toISOString().slice(0, 7)}
          >
            ›
          </button>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Percentagem Mensal */}
        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-400">Rentabilidade Mensal</CardTitle>
              <BarChart3 className="h-5 w-5 text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.total_risk ? (
                metrics.total_pnl ? ((metrics.total_pnl / metrics.total_risk) * 100).toFixed(2) : '0.00'
              ) : '0.00'}%
            </div>
            <Badge className={`${(metrics?.total_pnl || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} border-0`}>
              {metrics?.total_pnl ? `$${metrics.total_pnl.toFixed(2)}` : '$0.00'}
            </Badge>
          </CardContent>
        </Card>

        {/* R:R Médio */}
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-400">R:R Médio</CardTitle>
              <Target className="h-5 w-5 text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.avg_rr ? metrics.avg_rr.toFixed(2) : '0.00'}R
            </div>
            <Badge className="bg-blue-500/20 text-blue-400 border-0">
              {metrics?.total_trades ? `${metrics.total_trades} trades` : '0 trades'}
            </Badge>
          </CardContent>
        </Card>

        {/* Profit Factor */}
        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-400">Profit Factor</CardTitle>
              {metrics?.profit_factor && metrics.profit_factor >= 1 ? (
                <TrendingUp className="h-5 w-5 text-green-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics?.profit_factor ? metrics.profit_factor.toFixed(2) : '0.00'}
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-0">
              Win Rate: {metrics?.win_rate ? metrics.win_rate.toFixed(1) : '0.0'}%
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Trades */}
      {trades.length > 0 ? (
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">Trades do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <Badge className={trade.direction === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                      {trade.direction.toUpperCase()}
                    </Badge>
                    <div>
                      <div className="font-semibold text-white">{trade.symbol}</div>
                      <div className="text-sm text-gray-400">
                        {new Date(trade.opened_at).toLocaleDateString('pt-PT')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {trade.pnl !== undefined && trade.pnl !== null && (
                      <>
                        <div className={`font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${trade.pnl.toFixed(2)}
                        </div>
                        {trade.pnl_percent && (
                          <div className="text-sm text-gray-400">
                            ({trade.pnl_percent.toFixed(2)}%)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="py-12 text-center">
            <div className="text-gray-400 text-lg">Sem trades registados para este mês</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


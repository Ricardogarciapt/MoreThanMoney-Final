"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { 
  Plus, 
  Loader2, 
  Save, 
  TrendingUp, 
  TrendingDown,
  X,
  Calendar,
  Clock,
  DollarSign,
  Target,
  AlertCircle
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface Trade {
  id: string
  symbol: string
  direction: 'long' | 'short'
  entry_price: number
  exit_price?: number
  lot_size: number
  stop_loss?: number
  take_profit?: number
  risk_amount: number
  risk_reward_ratio?: number
  pnl?: number
  pnl_percent?: number
  status: 'open' | 'closed' | 'stopped' | 'hit_tp'
  opened_at: string
  closed_at?: string
  notes?: string
  market_context?: string
  setup_type?: string
  entry_reason?: string
  emotions?: string
  lessons_learned?: string
  timeframe?: string
}

export default function TradingJournal() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddTradeModal, setShowAddTradeModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Form state
  const [tradeForm, setTradeForm] = useState({
    symbol: '',
    direction: 'long' as 'long' | 'short',
    entry_price: '',
    exit_price: '',
    lot_size: '',
    stop_loss: '',
    take_profit: '',
    risk_amount: '',
    notes: '',
    market_context: '',
    setup_type: '',
    entry_reason: '',
    emotions: '',
    lessons_learned: '',
    timeframe: ''
  })

  useEffect(() => {
    loadTrades()
  }, [])

  const loadTrades = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/trading-plans/trades', {
        credentials: 'include',
        cache: 'no-store'
      })
      const data = await response.json()
      
      if (data.success) {
        setTrades(data.trades)
      }
    } catch (error) {
      console.error('Erro ao carregar trades:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao carregar trades",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAddTrade = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/trading-plans/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tradeForm,
          entry_price: parseFloat(tradeForm.entry_price),
          exit_price: tradeForm.exit_price ? parseFloat(tradeForm.exit_price) : null,
          lot_size: parseFloat(tradeForm.lot_size),
          stop_loss: tradeForm.stop_loss ? parseFloat(tradeForm.stop_loss) : null,
          take_profit: tradeForm.take_profit ? parseFloat(tradeForm.take_profit) : null,
          risk_amount: parseFloat(tradeForm.risk_amount),
          status: tradeForm.exit_price ? 'closed' : 'open'
        }),
        credentials: 'include',
        cache: 'no-store'
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "✅ Trade Registado!",
          description: "Trade adicionado com sucesso ao journal."
        })
        setShowAddTradeModal(false)
        resetForm()
        loadTrades()
      } else {
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao registar trade",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao registar trade:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao registar trade",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setTradeForm({
      symbol: '',
      direction: 'long',
      entry_price: '',
      exit_price: '',
      lot_size: '',
      stop_loss: '',
      take_profit: '',
      risk_amount: '',
      notes: '',
      market_context: '',
      setup_type: '',
      entry_reason: '',
      emotions: '',
      lessons_learned: '',
      timeframe: ''
    })
  }

  // Calcular P&L automaticamente se exit_price existe
  const calculatePnL = () => {
    if (tradeForm.entry_price && tradeForm.exit_price && tradeForm.direction && tradeForm.lot_size) {
      const entry = parseFloat(tradeForm.entry_price)
      const exit = parseFloat(tradeForm.exit_price)
      const lotSize = parseFloat(tradeForm.lot_size)
      
      let pnl = 0
      if (tradeForm.direction === 'long') {
        pnl = (exit - entry) * lotSize * 100 // Simplified
      } else {
        pnl = (entry - exit) * lotSize * 100
      }
      
      return pnl
    }
    return 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header com botão adicionar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">Trading Journal</h3>
          <p className="text-gray-400 mt-1">Regista e analisa os teus trades</p>
        </div>
        <Dialog open={showAddTradeModal} onOpenChange={setShowAddTradeModal}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Trade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-purple-500/30">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-purple-400">Registar Novo Trade</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 mt-4">
              {/* Trade Básico */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                  Informações do Trade
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="symbol" className="text-gray-300">Par/Ativo *</Label>
                    <Input
                      id="symbol"
                      value={tradeForm.symbol}
                      onChange={(e) => setTradeForm({...tradeForm, symbol: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="EURUSD, XAUUSD, etc."
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="direction" className="text-gray-300">Direção *</Label>
                    <Select value={tradeForm.direction} onValueChange={(value) => setTradeForm({...tradeForm, direction: value as 'long' | 'short'})}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="long">Long (Comprar)</SelectItem>
                        <SelectItem value="short">Short (Vender)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="timeframe" className="text-gray-300">Timeframe</Label>
                    <Select value={tradeForm.timeframe} onValueChange={(value) => setTradeForm({...tradeForm, timeframe: value})}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Escolher..." />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="M1">1 Minuto</SelectItem>
                        <SelectItem value="M5">5 Minutos</SelectItem>
                        <SelectItem value="M15">15 Minutos</SelectItem>
                        <SelectItem value="M30">30 Minutos</SelectItem>
                        <SelectItem value="H1">1 Hora</SelectItem>
                        <SelectItem value="H4">4 Horas</SelectItem>
                        <SelectItem value="D1">Diário</SelectItem>
                        <SelectItem value="W1">Semanal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="entry_price" className="text-gray-300">Preço Entrada *</Label>
                    <Input
                      id="entry_price"
                      type="number"
                      step="0.00001"
                      value={tradeForm.entry_price}
                      onChange={(e) => setTradeForm({...tradeForm, entry_price: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="1.08500"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="exit_price" className="text-gray-300">Preço Saída</Label>
                    <Input
                      id="exit_price"
                      type="number"
                      step="0.00001"
                      value={tradeForm.exit_price}
                      onChange={(e) => setTradeForm({...tradeForm, exit_price: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="1.09000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lot_size" className="text-gray-300">Tamanho (Lotes) *</Label>
                    <Input
                      id="lot_size"
                      type="number"
                      step="0.01"
                      value={tradeForm.lot_size}
                      onChange={(e) => setTradeForm({...tradeForm, lot_size: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="0.01"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="stop_loss" className="text-gray-300">Stop Loss</Label>
                    <Input
                      id="stop_loss"
                      type="number"
                      step="0.00001"
                      value={tradeForm.stop_loss}
                      onChange={(e) => setTradeForm({...tradeForm, stop_loss: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="1.08000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="take_profit" className="text-gray-300">Take Profit</Label>
                    <Input
                      id="take_profit"
                      type="number"
                      step="0.00001"
                      value={tradeForm.take_profit}
                      onChange={(e) => setTradeForm({...tradeForm, take_profit: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="1.09500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="risk_amount" className="text-gray-300">Valor Arriscado ($) *</Label>
                    <Input
                      id="risk_amount"
                      type="number"
                      step="0.01"
                      value={tradeForm.risk_amount}
                      onChange={(e) => setTradeForm({...tradeForm, risk_amount: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="10.00"
                      required
                    />
                  </div>
                </div>

                {/* P&L Calculado */}
                {tradeForm.exit_price && calculatePnL() !== 0 && (
                  <div className={`p-3 rounded-lg ${calculatePnL() > 0 ? 'bg-green-500/20 border border-green-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">P&L Estimado:</span>
                      <span className={`text-xl font-bold ${calculatePnL() > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {calculatePnL() > 0 ? '+' : ''}${calculatePnL().toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Journaling */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-white border-b border-purple-500/30 pb-2">
                  Journaling
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="market_context" className="text-gray-300">Contexto do Mercado</Label>
                    <Select value={tradeForm.market_context || ''} onValueChange={(value) => setTradeForm({...tradeForm, market_context: value})}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Escolher..." />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="trending_up">Tendência de Alta</SelectItem>
                        <SelectItem value="trending_down">Tendência de Baixa</SelectItem>
                        <SelectItem value="ranging">Laterais/Consolidação</SelectItem>
                        <SelectItem value="news">Notícias</SelectItem>
                        <SelectItem value="breakout">Breakout</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="setup_type" className="text-gray-300">Tipo de Setup</Label>
                    <Select value={tradeForm.setup_type || ''} onValueChange={(value) => setTradeForm({...tradeForm, setup_type: value})}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Escolher..." />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="breakout">Breakout</SelectItem>
                        <SelectItem value="pullback">Pullback</SelectItem>
                        <SelectItem value="reversal">Reversal</SelectItem>
                        <SelectItem value="golden_zone">Golden Zone</SelectItem>
                        <SelectItem value="kill_shot">Kill Shot</SelectItem>
                        <SelectItem value="momentum">Momentum</SelectItem>
                        <SelectItem value="sr_bounce">SR Bounce</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="entry_reason" className="text-gray-300">Razão de Entrada</Label>
                    <Textarea
                      id="entry_reason"
                      value={tradeForm.entry_reason}
                      onChange={(e) => setTradeForm({...tradeForm, entry_reason: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                      placeholder="Por que entraste neste trade? Qual foi o gatilho?"
                    />
                  </div>
                  <div>
                    <Label htmlFor="emotions" className="text-gray-300">Estado Emocional</Label>
                    <Select value={tradeForm.emotions || ''} onValueChange={(value) => setTradeForm({...tradeForm, emotions: value})}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Escolher..." />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="confident">Confiança</SelectItem>
                        <SelectItem value="neutral">Neutro</SelectItem>
                        <SelectItem value="nervous">Nervoso</SelectItem>
                        <SelectItem value="fearful">Com Medo</SelectItem>
                        <SelectItem value="greedy">Ganancioso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="lessons_learned" className="text-gray-300">Lições Aprendidas</Label>
                    <Textarea
                      id="lessons_learned"
                      value={tradeForm.lessons_learned}
                      onChange={(e) => setTradeForm({...tradeForm, lessons_learned: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                      placeholder="O que aprendeste com este trade? O que farias diferente?"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="notes" className="text-gray-300">Notas Adicionais</Label>
                    <Textarea
                      id="notes"
                      value={tradeForm.notes}
                      onChange={(e) => setTradeForm({...tradeForm, notes: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                      placeholder="Observações, screenshots, links para análise..."
                    />
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 pt-4 border-t border-purple-500/30">
                <Button
                  variant="outline"
                  onClick={() => setShowAddTradeModal(false)}
                  className="border-gray-700 text-gray-300 hover:text-white"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddTrade}
                  disabled={saving || !tradeForm.symbol || !tradeForm.entry_price || !tradeForm.lot_size || !tradeForm.risk_amount}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      A guardar...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Trade
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de Trades */}
      {trades.length > 0 ? (
        <div className="space-y-3">
          {trades.map((trade) => (
            <Card key={trade.id} className="bg-gray-900 border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge className={trade.direction === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                      {trade.direction.toUpperCase()}
                    </Badge>
                    <div>
                      <div className="font-semibold text-white text-lg">{trade.symbol}</div>
                      <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(trade.opened_at).toLocaleDateString('pt-PT')}
                        </span>
                        {trade.timeframe && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {trade.timeframe}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {trade.pnl !== undefined && trade.pnl !== null && (
                      <>
                        <div className={`font-bold text-lg ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
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
                
                {/* Detalhes adicionais */}
                {(trade.market_context || trade.setup_type || trade.entry_reason) && (
                  <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    {trade.setup_type && (
                      <div>
                        <span className="text-gray-400">Setup: </span>
                        <span className="text-purple-400 font-semibold">{trade.setup_type}</span>
                      </div>
                    )}
                    {trade.market_context && (
                      <div>
                        <span className="text-gray-400">Mercado: </span>
                        <span className="text-blue-400">{trade.market_context}</span>
                      </div>
                    )}
                    {trade.emotions && (
                      <div>
                        <span className="text-gray-400">Estado: </span>
                        <span className="text-yellow-400">{trade.emotions}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {trade.entry_reason && (
                  <div className="mt-2 p-2 bg-gray-800/50 rounded text-sm text-gray-300">
                    <strong className="text-white">Razão: </strong>{trade.entry_reason}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <div className="text-gray-400 text-lg">Sem trades registados</div>
            <div className="text-gray-500 text-sm mt-2">Começa por adicionar o teu primeiro trade</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


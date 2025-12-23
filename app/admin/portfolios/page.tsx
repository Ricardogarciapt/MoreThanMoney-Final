"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import ProtectedPage from "@/components/protected-page"
import { supabase } from "@/lib/supabase"
import { Plus, Edit2, Trash2, Save, X, RefreshCw, Database } from "lucide-react"
import { toast } from "sonner"

interface CryptoAsset {
  id?: string
  categoria: string
  criptomoeda: string
  symbol: string
  percentual: number
  investimento_inicial: number
  reforco_mensal: number
  reforco_anual: number
  potencial_crescimento_percent: number
  potencial_crescimento_valor: number
  entry_price: number
  // TP/SL
  tp1_price?: number
  tp2_price?: number
  tp3_price?: number
  stop_loss_price?: number
  ai_validated?: boolean
}

interface ETFAsset {
  id?: string
  categoria: string
  etf: string
  symbol: string
  percentual: number
  investimento_inicial: number
  reforco_semanal: number
  reforco_total_5anos: number
  crescimento_esperado_percent: number
  crescimento_esperado_valor: number
  entry_price: number
  // TP/SL
  tp1_price?: number
  tp2_price?: number
  tp3_price?: number
  stop_loss_price?: number
  ai_validated?: boolean
}

const CRYPTO_CATEGORIES = [
  "Médias Capitalizações",
  "Pequenas Capitalizações",
  "Projetos Emergentes",
  "Stablecoins"
]

const ETF_CATEGORIES = [
  "Tecnologia e Inovação",
  "Inteligência Artificial",
  "Blockchain e Cripto",
  "Índice Geral (USA)",
  "Mercados Emergentes",
  "Energia Limpa",
  "Segurança Cibernética",
  "Infraestrutura Global"
]

export default function AdminPortfoliosPage() {
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([])
  const [etfAssets, setETFAssets] = useState<ETFAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingCrypto, setEditingCrypto] = useState<string | null>(null)
  const [editingETF, setEditingETF] = useState<string | null>(null)
  
  // Estados para formulários
  const [cryptoForm, setCryptoForm] = useState<CryptoAsset>({
    categoria: "Médias Capitalizações",
    criptomoeda: "",
    symbol: "",
    percentual: 5,
    investimento_inicial: 25,
    reforco_mensal: 10,
    reforco_anual: 130,
    potencial_crescimento_percent: 200,
    potencial_crescimento_valor: 315,
    entry_price: 0,
    tp1_price: 0,
    tp2_price: 0,
    tp3_price: 0,
    stop_loss_price: 0
  })
  
  const [etfForm, setETFForm] = useState<ETFAsset>({
    categoria: "Tecnologia e Inovação",
    etf: "",
    symbol: "",
    percentual: 5,
    investimento_inicial: 5,
    reforco_semanal: 1.25,
    reforco_total_5anos: 325,
    crescimento_esperado_percent: 100,
    crescimento_esperado_valor: 650,
    entry_price: 0,
    tp1_price: 0,
    tp2_price: 0,
    tp3_price: 0,
    stop_loss_price: 0
  })

  useEffect(() => {
    loadPortfolios()
  }, [])

  const loadPortfolios = async () => {
    try {
      setLoading(true)
      
      // Buscar crypto assets
      const { data: cryptoData, error: cryptoError } = await supabase
        .from('admin_crypto_portfolio')
        .select('*')
        .order('percentual', { ascending: false })

      if (cryptoError) {
        console.error('Erro ao carregar crypto:', cryptoError)
        // Usar dados iniciais se tabela não existe
        loadInitialData()
      } else {
        setCryptoAssets(cryptoData || [])
      }

      // Buscar ETF assets
      const { data: etfData, error: etfError } = await supabase
        .from('admin_etf_portfolio')
        .select('*')
        .order('percentual', { ascending: false })

      if (etfError) {
        console.error('Erro ao carregar ETF:', etfError)
        loadInitialData()
      } else {
        setETFAssets(etfData || [])
      }

    } catch (error) {
      console.error('Erro ao carregar portfolios:', error)
      loadInitialData()
    } finally {
      setLoading(false)
    }
  }

  const loadInitialData = () => {
    // Dados iniciais da tabela fornecida
    setCryptoAssets([
      { categoria: "Médias Capitalizações", criptomoeda: "Cardano", symbol: "ADAUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 200, potencial_crescimento_valor: 315, entry_price: 0.52 },
      { categoria: "Médias Capitalizações", criptomoeda: "XRP", symbol: "XRPUSDT", percentual: 15, investimento_inicial: 75, reforco_mensal: 30, reforco_anual: 390, potencial_crescimento_percent: 400, potencial_crescimento_valor: 1860, entry_price: 2.10 },
      { categoria: "Médias Capitalizações", criptomoeda: "Polkadot", symbol: "DOTUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 300, potencial_crescimento_valor: 405, entry_price: 3.80 },
      { categoria: "Pequenas Capitalizações", criptomoeda: "Polygon", symbol: "MATICUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 200, potencial_crescimento_valor: 315, entry_price: 0.42 },
      { categoria: "Pequenas Capitalizações", criptomoeda: "Chainlink", symbol: "LINKUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 350, potencial_crescimento_valor: 1085, entry_price: 18.50 },
      { categoria: "Pequenas Capitalizações", criptomoeda: "Avalanche", symbol: "AVAXUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 400, potencial_crescimento_valor: 1150, entry_price: 25.00 },
      { categoria: "Pequenas Capitalizações", criptomoeda: "VeChain", symbol: "VETUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 500, potencial_crescimento_valor: 1550, entry_price: 0.018 },
      { categoria: "Projetos Emergentes", criptomoeda: "Arbitrum", symbol: "ARBUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 600, potencial_crescimento_valor: 805, entry_price: 0.48 },
      { categoria: "Projetos Emergentes", criptomoeda: "Optimism", symbol: "OPUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.75 },
      { categoria: "Projetos Emergentes", criptomoeda: "The Graph", symbol: "GRTUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 800, potencial_crescimento_valor: 1065, entry_price: 0.09 },
      { categoria: "Projetos Emergentes", criptomoeda: "Hedera", symbol: "HBARUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 500, potencial_crescimento_valor: 775, entry_price: 0.18 },
      { categoria: "Projetos Emergentes", criptomoeda: "Kaspa", symbol: "KASUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 1000, potencial_crescimento_valor: 3100, entry_price: 0.12 },
      { categoria: "Projetos Emergentes", criptomoeda: "Jupiter", symbol: "JUPUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 1000, potencial_crescimento_valor: 3100, entry_price: 0.50 },
      { categoria: "Projetos Emergentes", criptomoeda: "Algorand", symbol: "ALGOUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 300, potencial_crescimento_valor: 405, entry_price: 0.19 },
      { categoria: "Projetos Emergentes", criptomoeda: "Immutable", symbol: "IMXUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.72 },
      { categoria: "Projetos Emergentes", criptomoeda: "ONDO", symbol: "ONDOUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.78 },
      { categoria: "Projetos Emergentes", criptomoeda: "JTO", symbol: "JTOUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 800, potencial_crescimento_valor: 1065, entry_price: 1.80 },
      { categoria: "Projetos Emergentes", criptomoeda: "Aero", symbol: "AEROUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.85 },
      { categoria: "Projetos Emergentes", criptomoeda: "ILV", symbol: "ILVUSDT", percentual: 10, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 800, potencial_crescimento_valor: 1065, entry_price: 18.00 },
      { categoria: "Projetos Emergentes", criptomoeda: "Flow", symbol: "FLOWUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 600, potencial_crescimento_valor: 805, entry_price: 0.40 },
      { categoria: "Stablecoins", criptomoeda: "Tether", symbol: "USDTUSDT", percentual: 15, investimento_inicial: 75, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 0, potencial_crescimento_valor: 185, entry_price: 1.00 },
    ])

    setETFAssets([
      { categoria: "Tecnologia e Inovação", etf: "ARK Innovation ETF", symbol: "ARKK", percentual: 20, investimento_inicial: 20, reforco_semanal: 5, reforco_total_5anos: 1300, crescimento_esperado_percent: 300, crescimento_esperado_valor: 5200, entry_price: 75.00 },
      { categoria: "Inteligência Artificial", etf: "Global X Robotics & AI", symbol: "BOTZ", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 200, crescimento_esperado_valor: 2925, entry_price: 35.00 },
      { categoria: "Blockchain e Cripto", etf: "Amplify Transformational Data", symbol: "BLOK", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 300, crescimento_esperado_valor: 3900, entry_price: 28.00 },
      { categoria: "Índice Geral (USA)", etf: "SPDR S&P 500 ETF Trust", symbol: "SPY", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 100, crescimento_esperado_valor: 1950, entry_price: 620.00 },
      { categoria: "Mercados Emergentes", etf: "iShares MSCI Emerging Markets", symbol: "EEM", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 150, crescimento_esperado_valor: 2437.50, entry_price: 42.00 },
      { categoria: "Energia Limpa", etf: "iShares Global Clean Energy", symbol: "ICLN", percentual: 10, investimento_inicial: 10, reforco_semanal: 2.50, reforco_total_5anos: 650, crescimento_esperado_percent: 250, crescimento_esperado_valor: 2275, entry_price: 18.00 },
      { categoria: "Segurança Cibernética", etf: "First Trust Cybersecurity", symbol: "CIBR", percentual: 5, investimento_inicial: 5, reforco_semanal: 1.25, reforco_total_5anos: 325, crescimento_esperado_percent: 150, crescimento_esperado_valor: 812.50, entry_price: 52.00 },
      { categoria: "Infraestrutura Global", etf: "iShares Global Infrastructure", symbol: "IGF", percentual: 5, investimento_inicial: 5, reforco_semanal: 1.25, reforco_total_5anos: 325, crescimento_esperado_percent: 100, crescimento_esperado_valor: 650, entry_price: 48.00 },
    ])
  }

  const saveCryptoAsset = async (asset: CryptoAsset) => {
    try {
      setSaving(true)

      if (asset.id) {
        // Update
        const { error } = await supabase
          .from('admin_crypto_portfolio')
          .update(asset)
          .eq('id', asset.id)

        if (error) throw error
        toast.success(`✅ ${asset.criptomoeda} atualizado!`)
      } else {
        // Insert
        const { error } = await supabase
          .from('admin_crypto_portfolio')
          .insert([asset])

        if (error) throw error
        toast.success(`✅ ${asset.criptomoeda} adicionado!`)
      }

      loadPortfolios()
      setEditingCrypto(null)
      // Reset form
      setCryptoForm({
        categoria: "Médias Capitalizações",
        criptomoeda: "",
        symbol: "",
        percentual: 5,
        investimento_inicial: 25,
        reforco_mensal: 10,
        reforco_anual: 130,
        potencial_crescimento_percent: 200,
        potencial_crescimento_valor: 315,
        entry_price: 0,
        tp1_price: 0,
        tp2_price: 0,
        tp3_price: 0,
        stop_loss_price: 0
      })
    } catch (error) {
      console.error('Erro ao salvar:', error)
      toast.error('❌ Erro ao salvar. Verifica se a tabela existe no Supabase.')
    } finally {
      setSaving(false)
    }
  }

  const deleteCryptoAsset = async (id: string, name: string) => {
    if (!confirm(`Apagar ${name}?`)) return

    try {
      const { error } = await supabase
        .from('admin_crypto_portfolio')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      toast.success(`✅ ${name} apagado!`)
      loadPortfolios()
    } catch (error) {
      console.error('Erro ao apagar:', error)
      toast.error('❌ Erro ao apagar')
    }
  }

  const saveETFAsset = async (asset: ETFAsset) => {
    try {
      setSaving(true)

      if (asset.id) {
        const { error } = await supabase
          .from('admin_etf_portfolio')
          .update(asset)
          .eq('id', asset.id)

        if (error) throw error
        toast.success(`✅ ${asset.etf} atualizado!`)
      } else {
        const { error } = await supabase
          .from('admin_etf_portfolio')
          .insert([asset])

        if (error) throw error
        toast.success(`✅ ${asset.etf} adicionado!`)
      }

      loadPortfolios()
      setEditingETF(null)
      // Reset form
      setETFForm({
        categoria: "Tecnologia e Inovação",
        etf: "",
        symbol: "",
        percentual: 5,
        investimento_inicial: 5,
        reforco_semanal: 1.25,
        reforco_total_5anos: 325,
        crescimento_esperado_percent: 100,
        crescimento_esperado_valor: 650,
        entry_price: 0,
        tp1_price: 0,
        tp2_price: 0,
        tp3_price: 0,
        stop_loss_price: 0
      })
    } catch (error) {
      console.error('Erro ao salvar:', error)
      toast.error('❌ Erro ao salvar. Verifica se a tabela existe no Supabase.')
    } finally {
      setSaving(false)
    }
  }

  const deleteETFAsset = async (id: string, name: string) => {
    if (!confirm(`Apagar ${name}?`)) return

    try {
      const { error } = await supabase
        .from('admin_etf_portfolio')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      toast.success(`✅ ${name} apagado!`)
      loadPortfolios()
    } catch (error) {
      console.error('Erro ao apagar:', error)
      toast.error('❌ Erro ao apagar')
    }
  }

  const syncToProduction = async () => {
    if (!confirm('Sincronizar portfolios para produção? Isto vai atualizar /portfolios e app-mobile.')) return

    try {
      setSaving(true)
      toast.info('🔄 Sincronizando...')

      // Sincronizar para a API MTM (ela vai usar estes dados)
      const response = await fetch('/api/admin/sync-portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crypto: cryptoAssets,
          etf: etfAssets
        })
      })

      if (response.ok) {
        toast.success('✅ Portfolios sincronizados! Recarrega /portfolios para ver.')
      } else {
        throw new Error('Erro na sincronização')
      }
    } catch (error) {
      toast.error('❌ Erro ao sincronizar')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProtectedPage requireAdmin>
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#D2A63C]">Gestão de Portfolios</h1>
              <p className="text-gray-400 mt-1">Administração centralizada dos ativos MTM</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={loadPortfolios} variant="outline" className="border-gray-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Recarregar
              </Button>
              <Button onClick={syncToProduction} disabled={saving} className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                <Database className="h-4 w-4 mr-2" />
                {saving ? 'Sincronizando...' : 'Sincronizar para Produção'}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-gray-900 border-[#D2A63C]/30">
              <CardContent className="p-4">
                <div className="text-xs text-gray-400">Crypto Assets</div>
                <div className="text-2xl font-bold text-[#D2A63C]">{cryptoAssets.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-blue-500/30">
              <CardContent className="p-4">
                <div className="text-xs text-gray-400">ETF Assets</div>
                <div className="text-2xl font-bold text-blue-400">{etfAssets.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-green-500/30">
              <CardContent className="p-4">
                <div className="text-xs text-gray-400">Alocação Total Crypto</div>
                <div className="text-2xl font-bold text-green-400">
                  {cryptoAssets.reduce((sum, a) => sum + a.percentual, 0)}%
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-purple-500/30">
              <CardContent className="p-4">
                <div className="text-xs text-gray-400">Alocação Total ETF</div>
                <div className="text-2xl font-bold text-purple-400">
                  {etfAssets.reduce((sum, a) => sum + a.percentual, 0)}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="crypto" className="w-full">
            <TabsList className="bg-gray-900 border-b border-gray-800">
              <TabsTrigger value="crypto" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
                Crypto ({cryptoAssets.length})
              </TabsTrigger>
              <TabsTrigger value="etf" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                ETF ({etfAssets.length})
              </TabsTrigger>
            </TabsList>

            {/* CRYPTO TAB */}
            <TabsContent value="crypto" className="space-y-4">
              <div className="flex justify-between items-center">
                <Button onClick={() => {
                  const isNew = editingCrypto === 'new'
                  if (!isNew) {
                    const assetToEdit = cryptoAssets.find(a => (a.id || '') === editingCrypto || a.criptomoeda === editingCrypto)
                    if (assetToEdit) {
                      setCryptoForm(assetToEdit)
                    }
                  }
                  setEditingCrypto('new')
                }} className="bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Crypto
                </Button>
              </div>

              {/* Formulário de Edição Crypto */}
              {editingCrypto && (
                <Card className="bg-gray-900 border-[#D2A63C]/30">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-[#D2A63C]">
                        {editingCrypto === 'new' ? 'Novo Ativo Crypto' : 'Editar Ativo'}
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingCrypto(null)
                        setCryptoForm({
                          categoria: "Médias Capitalizações",
                          criptomoeda: "",
                          symbol: "",
                          percentual: 5,
                          investimento_inicial: 25,
                          reforco_mensal: 10,
                          reforco_anual: 130,
                          potencial_crescimento_percent: 200,
                          potencial_crescimento_valor: 315,
                          entry_price: 0,
                          tp1_price: 0,
                          tp2_price: 0,
                          tp3_price: 0,
                          stop_loss_price: 0
                        })
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Categoria</Label>
                        <Select value={cryptoForm.categoria} onValueChange={(v) => setCryptoForm(prev => ({ ...prev, categoria: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CRYPTO_CATEGORIES.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nome da Criptomoeda *</Label>
                        <Input value={cryptoForm.criptomoeda} onChange={(e) => setCryptoForm(prev => ({ ...prev, criptomoeda: e.target.value }))} placeholder="Ex: Bitcoin" />
                      </div>
                      <div>
                        <Label>Symbol (Binance) *</Label>
                        <Input value={cryptoForm.symbol} onChange={(e) => setCryptoForm(prev => ({ ...prev, symbol: e.target.value }))} placeholder="Ex: BTCUSDT" />
                      </div>
                      <div>
                        <Label>Percentual (%) *</Label>
                        <Input type="number" value={cryptoForm.percentual} onChange={(e) => setCryptoForm(prev => ({ ...prev, percentual: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Investimento Inicial (€)</Label>
                        <Input type="number" value={cryptoForm.investimento_inicial} onChange={(e) => setCryptoForm(prev => ({ ...prev, investimento_inicial: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Reforço Mensal (€)</Label>
                        <Input type="number" value={cryptoForm.reforco_mensal} onChange={(e) => setCryptoForm(prev => ({ ...prev, reforco_mensal: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Reforço Anual (€)</Label>
                        <Input type="number" value={cryptoForm.reforco_anual} onChange={(e) => setCryptoForm(prev => ({ ...prev, reforco_anual: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Potencial Crescimento (%)</Label>
                        <Input type="number" value={cryptoForm.potencial_crescimento_percent} onChange={(e) => setCryptoForm(prev => ({ ...prev, potencial_crescimento_percent: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Potencial Crescimento (€)</Label>
                        <Input type="number" value={cryptoForm.potencial_crescimento_valor} onChange={(e) => setCryptoForm(prev => ({ ...prev, potencial_crescimento_valor: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Entry Price (USD) *</Label>
                        <Input type="number" step="0.001" value={cryptoForm.entry_price} onChange={(e) => setCryptoForm(prev => ({ ...prev, entry_price: parseFloat(e.target.value) || 0 }))} />
                      </div>
                    </div>

                    {/* TP/SL */}
                    <div className="border-t border-gray-700 pt-4 mt-4">
                      <h3 className="text-lg font-semibold mb-4 text-[#D2A63C]">Take Profits e Stop Loss</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>TP1 Price (USD)</Label>
                          <Input type="number" step="0.001" value={cryptoForm.tp1_price || 0} onChange={(e) => setCryptoForm(prev => ({ ...prev, tp1_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label>TP2 Price (USD)</Label>
                          <Input type="number" step="0.001" value={cryptoForm.tp2_price || 0} onChange={(e) => setCryptoForm(prev => ({ ...prev, tp2_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label>TP3 Price (USD)</Label>
                          <Input type="number" step="0.001" value={cryptoForm.tp3_price || 0} onChange={(e) => setCryptoForm(prev => ({ ...prev, tp3_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label>Stop Loss (USD)</Label>
                          <Input type="number" step="0.001" value={cryptoForm.stop_loss_price || 0} onChange={(e) => setCryptoForm(prev => ({ ...prev, stop_loss_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={() => saveCryptoAsset(cryptoForm)} disabled={saving} className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'A guardar...' : 'Guardar'}
                      </Button>
                      <Button variant="outline" onClick={() => setEditingCrypto(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4">
                {cryptoAssets.map((asset, index) => (
                  <Card key={index} className="bg-gray-900 border-gray-800">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg text-white">{asset.criptomoeda}</CardTitle>
                          <p className="text-sm text-gray-400">{asset.symbol} • {asset.categoria}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge className="bg-[#D2A63C]/20 text-[#D2A63C]">{asset.percentual}%</Badge>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setCryptoForm(asset)
                            setEditingCrypto(asset.id || index.toString())
                          }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {asset.id && (
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteCryptoAsset(asset.id!, asset.criptomoeda)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Investimento</div>
                          <div className="font-semibold">€{asset.investimento_inicial}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Reforço Mensal</div>
                          <div className="font-semibold">€{asset.reforco_mensal}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Potencial</div>
                          <div className="font-semibold text-green-400">+{asset.potencial_crescimento_percent}%</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Entry Price</div>
                          <div className="font-semibold">${asset.entry_price}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* ETF TAB */}
            <TabsContent value="etf" className="space-y-4">
              <Button onClick={() => setEditingETF('new')} className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar ETF
              </Button>

              {/* Formulário de Edição ETF */}
              {editingETF && (
                <Card className="bg-gray-900 border-blue-500/30">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-blue-400">
                        {editingETF === 'new' ? 'Novo ETF' : 'Editar ETF'}
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingETF(null)
                        setETFForm({
                          categoria: "Tecnologia e Inovação",
                          etf: "",
                          symbol: "",
                          percentual: 5,
                          investimento_inicial: 5,
                          reforco_semanal: 1.25,
                          reforco_total_5anos: 325,
                          crescimento_esperado_percent: 100,
                          crescimento_esperado_valor: 650,
                          entry_price: 0,
                          tp1_price: 0,
                          tp2_price: 0,
                          tp3_price: 0,
                          stop_loss_price: 0
                        })
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Categoria</Label>
                        <Select value={etfForm.categoria} onValueChange={(v) => setETFForm(prev => ({ ...prev, categoria: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ETF_CATEGORIES.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nome do ETF *</Label>
                        <Input value={etfForm.etf} onChange={(e) => setETFForm(prev => ({ ...prev, etf: e.target.value }))} placeholder="Ex: ARK Innovation ETF" />
                      </div>
                      <div>
                        <Label>Symbol *</Label>
                        <Input value={etfForm.symbol} onChange={(e) => setETFForm(prev => ({ ...prev, symbol: e.target.value }))} placeholder="Ex: ARKK" />
                      </div>
                      <div>
                        <Label>Percentual (%) *</Label>
                        <Input type="number" value={etfForm.percentual} onChange={(e) => setETFForm(prev => ({ ...prev, percentual: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Investimento Inicial (€)</Label>
                        <Input type="number" value={etfForm.investimento_inicial} onChange={(e) => setETFForm(prev => ({ ...prev, investimento_inicial: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Reforço Semanal (€)</Label>
                        <Input type="number" step="0.01" value={etfForm.reforco_semanal} onChange={(e) => setETFForm(prev => ({ ...prev, reforco_semanal: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Reforço Total 5 Anos (€)</Label>
                        <Input type="number" value={etfForm.reforco_total_5anos} onChange={(e) => setETFForm(prev => ({ ...prev, reforco_total_5anos: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Crescimento Esperado (%)</Label>
                        <Input type="number" value={etfForm.crescimento_esperado_percent} onChange={(e) => setETFForm(prev => ({ ...prev, crescimento_esperado_percent: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Crescimento Esperado (€)</Label>
                        <Input type="number" value={etfForm.crescimento_esperado_valor} onChange={(e) => setETFForm(prev => ({ ...prev, crescimento_esperado_valor: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>Entry Price (USD) *</Label>
                        <Input type="number" step="0.01" value={etfForm.entry_price} onChange={(e) => setETFForm(prev => ({ ...prev, entry_price: parseFloat(e.target.value) || 0 }))} />
                      </div>
                    </div>

                    {/* TP/SL */}
                    <div className="border-t border-gray-700 pt-4 mt-4">
                      <h3 className="text-lg font-semibold mb-4 text-blue-400">Take Profits e Stop Loss</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>TP1 Price (USD)</Label>
                          <Input type="number" step="0.01" value={etfForm.tp1_price || 0} onChange={(e) => setETFForm(prev => ({ ...prev, tp1_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label>TP2 Price (USD)</Label>
                          <Input type="number" step="0.01" value={etfForm.tp2_price || 0} onChange={(e) => setETFForm(prev => ({ ...prev, tp2_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label>TP3 Price (USD)</Label>
                          <Input type="number" step="0.01" value={etfForm.tp3_price || 0} onChange={(e) => setETFForm(prev => ({ ...prev, tp3_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label>Stop Loss (USD)</Label>
                          <Input type="number" step="0.01" value={etfForm.stop_loss_price || 0} onChange={(e) => setETFForm(prev => ({ ...prev, stop_loss_price: parseFloat(e.target.value) || 0 }))} />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={() => saveETFAsset(etfForm)} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'A guardar...' : 'Guardar'}
                      </Button>
                      <Button variant="outline" onClick={() => setEditingETF(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4">
                {etfAssets.map((asset, index) => (
                  <Card key={index} className="bg-gray-900 border-gray-800">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg text-white">{asset.etf}</CardTitle>
                          <p className="text-sm text-gray-400">{asset.symbol} • {asset.categoria}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge className="bg-blue-500/20 text-blue-400">{asset.percentual}%</Badge>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setETFForm(asset)
                            setEditingETF(asset.id || index.toString())
                          }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {asset.id && (
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteETFAsset(asset.id!, asset.etf)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Investimento</div>
                          <div className="font-semibold">€{asset.investimento_inicial}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Reforço Semanal</div>
                          <div className="font-semibold">€{asset.reforco_semanal}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Crescimento 5Y</div>
                          <div className="font-semibold text-blue-400">+{asset.crescimento_esperado_percent}%</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Entry Price</div>
                          <div className="font-semibold">${asset.entry_price}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ProtectedPage>
  )
}


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
import { pctFormatada } from "@/lib/portfolios/retorno"

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
  /** As contas reais das carteiras (`/api/portfolio/curva`) — o que elas fizeram, não a config. */
  const [contasPortefolio, setContasPortefolio] = useState<Array<{
    chave: string; nome: string; contribuido: number; valor: number; resultadoPct: number
    desde: string; dca: string; fontePrecos: string
  }>>([])
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

  // Falhar aqui não leva o painel de configuração atrás: os cartões das contas simplesmente não
  // aparecem, em vez de mostrarem zeros.
  useEffect(() => {
    fetch("/api/portfolio/curva")
      .then((r) => r.json())
      .then((j) => setContasPortefolio(j?.contas ?? []))
      .catch(() => setContasPortefolio([]))
  }, [])

  const loadPortfolios = async () => {
    try {
      setLoading(true)
      
      // Buscar crypto assets do Supabase
      const { data: cryptoData, error: cryptoError } = await supabase
        .from('admin_crypto_portfolio')
        .select('*')
        .order('percentual', { ascending: false })

      if (cryptoError) {
        console.error('❌ [ADMIN PORTFOLIOS] Erro ao carregar crypto:', cryptoError)
        toast.error(`Erro ao carregar crypto: ${cryptoError.message}`)
        setCryptoAssets([])
      } else {
        setCryptoAssets(cryptoData || [])
        if ((cryptoData || []).length === 0) {
          toast.info('ℹ️ Nenhum ativo crypto encontrado. Adicione ativos para começar.')
        }
      }

      // Buscar ETF assets do Supabase
      const { data: etfData, error: etfError } = await supabase
        .from('admin_etf_portfolio')
        .select('*')
        .order('percentual', { ascending: false })

      if (etfError) {
        console.error('❌ [ADMIN PORTFOLIOS] Erro ao carregar ETF:', etfError)
        toast.error(`Erro ao carregar ETF: ${etfError.message}`)
        setETFAssets([])
      } else {
        setETFAssets(etfData || [])
        if ((etfData || []).length === 0) {
          toast.info('ℹ️ Nenhum ativo ETF encontrado. Adicione ativos para começar.')
        }
      }

    } catch (error) {
      console.error('❌ [ADMIN PORTFOLIOS] Erro ao carregar portfolios:', error)
      toast.error('Erro ao carregar portfolios. Verifica a conexão com o Supabase.')
      setCryptoAssets([])
      setETFAssets([])
    } finally {
      setLoading(false)
    }
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
      toast.info('🔄 Sincronizando portfolios...')

      // Obter sessão para autenticação
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        toast.error('❌ Sessão expirada. Faz login novamente.')
        return
      }

      // Sincronizar para a API MTM (ela vai usar estes dados)
      const response = await fetch('/api/admin/sync-portfolios', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          crypto: cryptoAssets,
          etf: etfAssets
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast.success(`✅ Portfolios sincronizados! ${result.crypto_count || 0} crypto, ${result.etf_count || 0} ETF.`)
        console.log('✅ [ADMIN PORTFOLIOS] Sincronização concluída:', result)
      } else {
        throw new Error(result.error || 'Erro na sincronização')
      }
    } catch (error) {
      console.error('❌ [ADMIN PORTFOLIOS] Erro ao sincronizar:', error)
      toast.error(`❌ Erro ao sincronizar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
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

          {/* AS DUAS CONTAS REAIS, antes da configuração.
              Este painel só mostrava alocações e potenciais — o que as carteiras PROMETEM — e por
              isso era possível mexer na configuração sem nunca ver o que elas fizeram. Os números
              vêm de `/api/portfolio/curva` (as contas `PORTF-CRIPTO`/`PORTF-ETF`), a MESMA fonte
              da página pública, do separador da app e do detalhe da conta no WebTrader: os quatro
              ecrãs dizem o mesmo número para a mesma coisa, ou não valem nada. */}
          {contasPortefolio.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {contasPortefolio.map((c) => (
                <Card key={c.chave} className="bg-gray-900 border-emerald-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400">{c.nome}</div>
                        <div className="mt-1 font-mono text-sm text-gray-300">
                          ${c.contribuido.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} investidos → ${c.valor.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {c.dca} · desde {c.desde} · preços: {c.fontePrecos || '—'}
                        </div>
                      </div>
                      <div className={`shrink-0 font-mono text-2xl font-bold ${c.resultadoPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pctFormatada(c.resultadoPct)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

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


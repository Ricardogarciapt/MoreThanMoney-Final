"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import CurvaPortefolio, { type PontoCurva } from "@/components/portfolios/curva-portefolio"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import ProtectedPage from "@/components/protected-page"
import DCAOpportunities from "@/components/dca-opportunities"
import PortfolioGrowthCharts from "@/components/portfolio-growth-charts"
import { 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Loader2,
  AlertTriangle,
  AlertCircle,
  BarChart3,
  Brain,
  Target,
  Zap,
  Shield,
  Activity,
  Eye,
  Thermometer,
} from "lucide-react"
import { cryptoPortfolio, etfPortfolio } from "@/lib/portfolio-data"
import { pctFormatada, potencialPonderado, resultadoDasContas, retornoDaCarteira } from "@/lib/portfolios/retorno"

interface AssetWithPrice {
  /** Reforço por SEXTA. Os cartões somam-no em vez de mostrarem um número escrito à mão. */
  weekly_reinforcement?: number
  symbol: string
  name: string
  current_price: number | null
  entry_price?: number
  total_invested: number
  current_value: number
  pnl: number
  pnl_percent: number
  category: string
  recommended_monthly: number
  potential_growth: number
  allocation_percent: number
  // TP/SL validados por IA
  tp1?: number
  tp2?: number
  tp3?: number
  stop_loss?: number
  ai_validated?: boolean
  /** Só preenchido quando a CoinGecko devolve `usd_24h_change` válido — não usar fallback inventado. */
  change_24h_percent?: number | null
}

/** As duas contas de portefólio, pela ordem com que se olham. Os logins são os da base (173). */
const ORDEM_CONTAS = ['PORTF-CRIPTO', 'PORTF-ETF'] as const
const NOME_CONTA: Record<string, string> = { 'PORTF-CRIPTO': 'Cripto', 'PORTF-ETF': 'ETF' }

function mapFearGreedToPt(classification: string): string {
  const m: Record<string, string> = {
    "Extreme Fear": "Pânico",
    Fear: "Medo",
    Neutral: "Neutro",
    Greed: "Otimismo",
    "Extreme Greed": "Euforia",
  }
  return m[classification] || classification
}

export default function PortfoliosPage() {
  /**
   * AS DUAS CONTAS DE PORTEFÓLIO, reconstruídas desde 01/03/2024 com preços semanais reais.
   * Vêm da API e não do cálculo: a reconstituição precisa de 27 séries de duas fontes externas,
   * e uma página pública não pode ficar refém de quem está do outro lado.
   */

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cryptoAssets, setCryptoAssets] = useState<AssetWithPrice[]>([])
  const [etfAssets, setETFAssets] = useState<AssetWithPrice[]>([])
  const [lastSync, setLastSync] = useState<Date>(new Date())
  /** Média 24h só entre ativos com dado CoinGecko válido; null = ainda sem dados fiáveis */
  const [crypto24hAvgPercent, setCrypto24hAvgPercent] = useState<number | null>(null)
  const [crypto24hCoverage, setCrypto24hCoverage] = useState<{ ok: number; total: number } | null>(null)

  const [dataSource, setDataSource] = useState('Carregando...')
  const [fearGreed, setFearGreed] = useState<{
    value: number
    classification: string
    labelPt: string
  } | null>(null)

  /** Incrementa após cada `loadPortfolioData` (preços + IA TP/SL) para a análise DCA correr uma vez com dados alinhados. */
  const [analysisSeq, setAnalysisSeq] = useState(0)

  const [contasPortefolio, setContasPortefolio] = useState<Array<{
    chave: string; nome: string; contribuido: number; valor: number; resultadoPct: number
    desde: string; dca: string; fontePrecos: string; nota: string; curva: PontoCurva[]
  }>>([])

  useEffect(() => {
    fetch("/api/portfolio/curva")
      .then((r) => r.json())
      .then((j) => setContasPortefolio(j?.contas ?? []))
      // Um gráfico em falta não pode levar a página de preços atrás.
      .catch(() => setContasPortefolio([]))
  }, [])

  useEffect(() => {
    setMounted(true)
    loadPortfolioData()

    // Auto-sincronização a cada 2 minutos
    const interval = setInterval(() => {
      console.log('🔄 Auto-sincronização: Atualizando preços e dados...')
      loadPortfolioData()
    }, 120000)

    return () => clearInterval(interval)
  }, [])

  const loadPortfolioData = async () => {
    try {
      setLoading(true)
      setCrypto24hAvgPercent(null)
      setCrypto24hCoverage(null)
      console.log('📊 [PORTFOLIO] Carregando dados...')

      void fetch("/api/portfolio/fear-greed")
        .then((r) => r.json())
        .then((j: { success?: boolean; value?: number; classification?: string }) => {
          if (j.success && typeof j.value === "number" && Number.isFinite(j.value)) {
            const c = j.classification || "Neutral"
            setFearGreed({ value: j.value, classification: c, labelPt: mapFearGreedToPt(c) })
          } else {
            setFearGreed(null)
          }
        })
        .catch(() => setFearGreed(null))

      const response = await fetch('/api/portfolio/mtm?type=all')
      
      if (!response.ok) {
        console.error('❌ [PORTFOLIO] Erro na API:', response.status, response.statusText)
        throw new Error(`API retornou ${response.status}`)
      }
      
      const result = await response.json()
      console.log('📦 [PORTFOLIO] Resposta recebida:', {
        success: result.success,
        source: result.source,
        hasCrypto: !!result.data?.crypto,
        hasETF: !!result.data?.etf
      })
      
      if (result.success) {
        // Atualizar fonte dos dados
        setDataSource(result.source || 'Dados Locais')
        console.log('✅ [PORTFOLIO] Fonte de dados:', result.source)
        
        // Crypto: CoinGecko + IA TP/SL num único ciclo (uma atualização de estado, sem fases)
        if (result.data.crypto) {
          const cryptoAssetsFromApi = Array.isArray(result.data.crypto.assets) ? result.data.crypto.assets : []
          console.log('💰 [PORTFOLIO] Processando crypto assets...')
          console.log('📊 [PORTFOLIO] Assets recebidos da API:', cryptoAssetsFromApi.length)

          const assetsBase: AssetWithPrice[] = cryptoAssetsFromApi.map((asset: any) => {
            const originalAsset = cryptoPortfolio.find((c) => c.symbol === asset.symbol)

            let realPerformance = 0
            if (asset.current_price) {
              const entryPrice = asset.entry_price || asset.current_price * 0.7
              realPerformance = ((asset.current_price - entryPrice) / entryPrice) * 100
            }

            const tpslData = {
              tp1: asset.current_price ? asset.current_price * 1.5 : undefined,
              tp2: asset.current_price ? asset.current_price * 2.0 : undefined,
              tp3: asset.current_price ? asset.current_price * 3.0 : undefined,
              stop_loss: asset.current_price ? asset.current_price * 0.85 : undefined,
              ai_validated: false,
            }

            return {
              symbol: asset.symbol,
              name: asset.criptomoeda,
              current_price: asset.current_price,
              entry_price: asset.entry_price,
              total_invested: asset.total_invested,
              current_value: asset.current_value,
              pnl: asset.pnl,
              pnl_percent: realPerformance,
              change_24h_percent: null,
              category: asset.categoria,
              recommended_monthly: asset.reforco_mensal,
              // A cadência real da casa é SEMANAL, às sextas. O mensal fica como vista derivada.
              weekly_reinforcement: originalAsset?.reforco_semanal ?? asset.reforco_semanal ?? 0,
              potential_growth: originalAsset?.potencial_crescimento_percent || 0,
              allocation_percent: originalAsset?.percentual || 0,
              ...tpslData,
            }
          })

          let merged: AssetWithPrice[] = assetsBase

          console.log('💰 [PORTFOLIO] CoinGecko (lote) + IA TP/SL em sequência…')
          try {
            const symList = [...new Set(assetsBase.map((a) => a.symbol).filter(Boolean))].join(',')
            if (symList) {
              const pricesResponse = await fetch(`/api/portfolio/prices-coingecko?symbols=${symList}`)
              if (pricesResponse.ok) {
                const pricesData = await pricesResponse.json()
                if (pricesData.success && pricesData.prices) {
                  merged = assetsBase.map((asset) => {
                    const newPrice = pricesData.prices[asset.symbol] as number | undefined
                    const dailyChange = pricesData.changes_24h?.[asset.symbol]
                    if (newPrice) {
                      const entryPrice = asset.entry_price || newPrice * 0.7
                      const vsEntryPercent = ((newPrice - entryPrice) / entryPrice) * 100
                      const has24h =
                        typeof dailyChange === 'number' &&
                        Number.isFinite(dailyChange) &&
                        !Number.isNaN(dailyChange)
                      return {
                        ...asset,
                        current_price: newPrice,
                        change_24h_percent: has24h ? dailyChange : null,
                        pnl_percent: vsEntryPercent,
                        current_value: (asset.total_invested / entryPrice) * newPrice,
                        pnl: (asset.total_invested / entryPrice) * newPrice - asset.total_invested,
                        tp1: newPrice * 1.5,
                        tp2: newPrice * 2.0,
                        tp3: newPrice * 3.0,
                        stop_loss: newPrice * 0.85,
                        ai_validated: false,
                      }
                    }
                    return { ...asset, change_24h_percent: null }
                  })
                }
              }
            }
          } catch (error) {
            console.error('❌ [PORTFOLIO] Erro ao buscar preços CoinGecko:', error)
          }

          const with24h = merged.filter(
            (a) => a.change_24h_percent !== null && a.change_24h_percent !== undefined
          )
          const totalWithPrice = merged.filter((a) => a.current_price).length
          if (with24h.length > 0) {
            const avg24h =
              with24h.reduce((sum, a) => sum + (a.change_24h_percent as number), 0) / with24h.length
            setCrypto24hAvgPercent(avg24h)
            setCrypto24hCoverage({ ok: with24h.length, total: totalWithPrice })
          } else {
            setCrypto24hAvgPercent(null)
            setCrypto24hCoverage(totalWithPrice > 0 ? { ok: 0, total: totalWithPrice } : null)
          }

          console.log('🤖 [PORTFOLIO] IA TP/SL (paralelo por ativo)…')
          const withAI = await Promise.all(
            merged.map(async (asset) => {
              if (!asset.current_price) return asset
              try {
                const aiResponse = await fetch(
                  `/api/portfolio/ai-tp-sl?symbol=${encodeURIComponent(asset.symbol)}&entryPrice=${asset.entry_price || asset.current_price}`
                )
                if (aiResponse.ok) {
                  const aiData = await aiResponse.json()
                  if (aiData.success && aiData.ai_validated) {
                    return {
                      ...asset,
                      tp1: aiData.take_profit_levels?.tp1?.price,
                      tp2: aiData.take_profit_levels?.tp2?.price,
                      tp3: aiData.take_profit_levels?.tp3?.price,
                      stop_loss: aiData.stop_loss?.price,
                      ai_validated: true,
                    }
                  }
                }
              } catch {
                console.log(`⚠️ [PORTFOLIO AI] Fallback: ${asset.symbol}`)
              }
              return asset
            })
          )

          console.log(
            `🤖 [PORTFOLIO AI] Concluído: ${withAI.filter((a) => a.ai_validated).length}/${withAI.length} validados; estado único.`
          )
          setCryptoAssets(withAI)
        }

        // Processar ETF
        if (result.data.etf) {
          const etfAssetsFromApi = Array.isArray(result.data.etf.assets) ? result.data.etf.assets : []
          const assets = etfAssetsFromApi.map((asset: any) => {
            const originalAsset = etfPortfolio.find(e => e.symbol === asset.symbol)
            
            // Calcular performance real baseada no preço atual vs preço de entrada
            let realPerformance = 0
            if (asset.current_price) {
              // Buscar preço histórico de 10 de março de 2025 (fallback para preço baixo estimado)
              const entryPrice = asset.entry_price || asset.current_price * 0.85 // Estimativa -15% do atual
              realPerformance = ((asset.current_price - entryPrice) / entryPrice) * 100
            }
            
            return {
              symbol: asset.symbol,
              name: asset.etf,
              current_price: asset.current_price,
              total_invested: asset.total_invested,
              current_value: asset.current_value,
              pnl: asset.pnl,
              pnl_percent: realPerformance,
              category: asset.categoria,
              recommended_monthly: asset.reforco_semanal * 4,
              weekly_reinforcement: originalAsset?.reforco_semanal ?? asset.reforco_semanal ?? 0,
              potential_growth: originalAsset?.crescimento_esperado_percent || 0,
              allocation_percent: originalAsset?.percentual || 0
            }
          })
          setETFAssets(assets)
          
          /**
           * O RETORNO DA CARTEIRA — ponderado pelo investido, nunca a média das percentagens.
           *
           * Estava `totalPNL / assetsWithPrice.length`: a média simples do pnl_percent de cada
           * activo. Isso é o retorno de uma carteira imaginária com o mesmo dinheiro em cada linha.
           * Um activo de 50 $ a +200 % ao lado de um de 5 000 $ a −10 % dava «+95 %» numa carteira
           * que perdeu 400 $ — e é por isso que o cartão anunciava +60,37 % quando a conta real do
           * ETF fez +39,52 %. Uma percentagem inflacionada por uma média mal feita é um número
           * inventado, e esta casa não os publica. A fórmula vive em lib/portfolios/retorno.ts.
           */
          const retorno = retornoDaCarteira(assets as AssetWithPrice[])
          console.log('📈 [PORTFOLIO] ETF processado:', {
            total_assets: retorno.activos,
            with_price: retorno.comCotacao,
            investido: retorno.investido,
            valor: retorno.valor,
            retorno_ponderado: pctFormatada(retorno.resultadoPct),
          })
        }

        setLastSync(new Date())
        console.log('✅ [PORTFOLIO] Dados carregados com sucesso!')
      } else {
        console.error('❌ [PORTFOLIO] API retornou success: false', result)
      }
    } catch (error) {
      console.error('❌ [PORTFOLIO] Erro ao carregar portfolio:', error)
    } finally {
      setLoading(false)
      setAnalysisSeq((n) => n + 1)
    }
  }

  /**
   * As duas carteiras somadas — somam-se os DINHEIROS e mede-se UMA fracção. Fazer a média dos
   * dois resultados (−36,40 % e +39,52 %) daria «+1,56 %», que não é o retorno de ninguém: é o
   * mesmo erro da média simples, um nível acima.
   */
  const totais = resultadoDasContas(contasPortefolio)
  const totalContribuido = totais.contribuido
  const totalValor = totais.valor
  const totalPct = totais.resultadoPct
  /**
   * O retorno dos ACTIVOS de cada cabaz, ponderado pelo investido — calculado no render porque é
   * uma soma pura sobre o que já está em memória, e não precisa de estado próprio. É a vista por
   * activo; a vista por CONTA (a que manda) está nos cartões de cima.
   */
  const retornoCripto = retornoDaCarteira(cryptoAssets)
  const retornoETF = retornoDaCarteira(etfAssets)

  const formatPercent = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
  }

  const formatOptional24h = (value: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—"
    return formatPercent(value)
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-400">A carregar sistema...</p>
        </div>
      </div>
    )
  }

  // Log de debug do estado antes do render
  console.log(`🎨 [PORTFOLIO RENDER] cryptoAssets.length: ${cryptoAssets.length}`)
  console.log(`🎨 [PORTFOLIO RENDER] etfAssets.length: ${etfAssets.length}`)
  console.log(`🎨 [PORTFOLIO RENDER] loading: ${loading}`)

  return (
    <ProtectedPage redirectPath="/login?redirect=/portfolios" loadingMessage="A verificar acesso...">
      <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white pb-20">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#D2A63C]/30 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#BB8525]/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="container mx-auto px-4 py-8 relative z-10">
          {/* Futuristic Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-12 bg-gradient-to-b from-[#D2A63C] to-[#BB8525]"></div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                  <span className="bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                    PORTFÓLIO MTM
                  </span>
                </h1>
                <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
                  <Activity className="h-3 w-3 text-green-400 animate-pulse" />
                  Sistema DCA Automático • Together We Go Further
                </p>
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400">CoinGecko Live</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-full">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-blue-400">Yahoo Finance Live</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-full">
                <RefreshCw className="h-3 w-3 text-purple-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-purple-400">Auto-Sync 2min</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-full">
                <span className="text-gray-400">Última Sync:</span>
                <span className="text-[#D2A63C] font-mono">{lastSync.toLocaleTimeString('pt-PT')}</span>
              </div>
              <Button
                onClick={loadPortfolioData}
                disabled={loading}
                size="sm"
                className="ml-auto bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-bold h-8 shadow-lg"
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Sync Agora
              </Button>
            </div>
          </div>

          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
            {/* Total Assets */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30 backdrop-blur-sm overflow-hidden relative group hover:border-[#D2A63C]/60 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#D2A63C]/5 rounded-full blur-2xl group-hover:bg-[#D2A63C]/10 transition-all"></div>
              <CardContent className="p-6 relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#D2A63C]/20 rounded-lg flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-[#D2A63C]" />
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Total de Ativos</div>
                </div>
                <div className="text-4xl font-black text-white mb-1">
                  {cryptoAssets.length + etfAssets.length}
                </div>
                <div className="text-xs text-gray-500">
                  {cryptoAssets.length} Crypto • {etfAssets.length} ETF
                </div>
              </CardContent>
            </Card>

            {/* Crypto média 24h — só com dados CoinGecko válidos */}
            <Card className="bg-gray-900/50 border-green-500/30 backdrop-blur-sm overflow-hidden relative group hover:border-green-500/60 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-2xl group-hover:bg-green-500/10 transition-all"></div>
              <CardContent className="p-6 relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Crypto Δ médio (24h)</div>
                    <div className="text-[10px] text-gray-500 normal-case">Só com variação 24h CoinGecko</div>
                  </div>
                </div>
                <div
                  className={`text-4xl font-black mb-1 ${
                    crypto24hAvgPercent === null
                      ? "text-gray-500"
                      : crypto24hAvgPercent >= 0
                        ? "text-green-400"
                        : "text-red-400"
                  }`}
                >
                  {formatOptional24h(crypto24hAvgPercent)}
                </div>
                {crypto24hAvgPercent !== null ? (
                  <Progress
                    value={Math.min(100, Math.abs(crypto24hAvgPercent))}
                    className="h-2 bg-gray-800"
                  />
                ) : (
                  <p className="text-xs text-gray-500 leading-snug">
                    {crypto24hCoverage
                      ? `Sem dado 24h fiável (${crypto24hCoverage.ok}/${crypto24hCoverage.total} ativos).`
                      : "A sincronizar preços…"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Fear & Greed — mercado global (não é o teu portefólio) */}
            <Card className="bg-gray-900/50 border-amber-500/30 backdrop-blur-sm overflow-hidden relative group hover:border-amber-500/60 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
              <CardContent className="p-6 relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    <Thermometer className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Mercado (Fear &amp; Greed)</div>
                    <div className="text-[10px] text-gray-500 normal-case">Índice global · Alternative.me</div>
                  </div>
                </div>
                {fearGreed ? (
                  <>
                    <div className="text-4xl font-black text-amber-300 mb-1">{fearGreed.value}</div>
                    <div className="text-sm font-semibold text-gray-200 mb-2">{fearGreed.labelPt}</div>
                    <Progress value={fearGreed.value} className="h-2 bg-gray-800" />
                  </>
                ) : (
                  <div className="text-gray-500 text-sm">—</div>
                )}
              </CardContent>
            </Card>

            {/* As DUAS CONTAS REAIS, uma em cada cartão.
                Antes havia aqui um «ETF Performance» com a média simples das percentagens dos
                activos (+60,37 % numa conta que fez +39,52 %) e um «Potencial Total ~4x» escrito
                à mão. Os dois saíram: o que o ecrã anuncia em grande é o que as contas FIZERAM,
                com o investido e o valor à frente para se poder verificar. A fonte é a mesma do
                detalhe da conta no WebTrader e do separador da app — uma só. */}
            {ORDEM_CONTAS.map((chave) => {
              const c = contasPortefolio.find((x) => x.chave === chave)
              const ganha = (c?.resultadoPct ?? 0) >= 0
              return (
                <Card key={chave} className="bg-gray-900/50 border-blue-500/30 backdrop-blur-sm overflow-hidden relative group hover:border-blue-500/60 transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                  <CardContent className="p-6 relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <BarChart3 className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">{NOME_CONTA[chave]} · conta real</div>
                        <div className="text-[10px] text-gray-500 normal-case">Resultado desde o início · (valor − investido) / investido</div>
                      </div>
                    </div>
                    <div className={`text-4xl font-black mb-1 ${c ? (ganha ? 'text-blue-400' : 'text-red-400') : 'text-gray-500'}`}>
                      {pctFormatada(c?.resultadoPct ?? null)}
                    </div>
                    {c ? (
                      <p className="text-xs text-gray-400">
                        ${c.contribuido.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} investidos → ${c.valor.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">A carregar a conta…</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {/* Investido nas duas carteiras, somado — um FACTO, e serve de base aos números acima.
                Estava aqui um «Potencial Total ~4x · Projeção 5 anos»: um número escrito à mão,
                sem origem e sem conta que o sustente, no meio de cartões de desempenho. É
                exactamente o tipo de promessa que esta casa não publica, e saiu. O potencial do
                admin continua a existir, nos cartões de cada carteira, rotulado como projecção. */}
            <Card className="bg-gray-900/50 border-purple-500/30 backdrop-blur-sm overflow-hidden relative group hover:border-purple-500/60 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all"></div>
              <CardContent className="p-6 relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Zap className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Investido · 2 carteiras</div>
                    <div className="text-[10px] text-gray-500 normal-case">Reforço semanal desde Março de 2024</div>
                  </div>
                </div>
                <div className="text-4xl font-black text-purple-400 mb-1">
                  ${totalContribuido.toLocaleString('pt-PT', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-500">
                  vale hoje ${totalValor.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} · {pctFormatada(totalPct)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs defaultValue="dca" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-gray-900/80 border border-[#D2A63C]/30 backdrop-blur-sm h-14 p-1">
              <TabsTrigger 
                value="dca" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D2A63C] data-[state=active]:to-[#BB8525] data-[state=active]:text-black font-semibold"
              >
                <Brain className="h-4 w-4 mr-2" />
                Análise DCA
              </TabsTrigger>
              <TabsTrigger 
                value="crypto" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D2A63C] data-[state=active]:to-[#BB8525] data-[state=active]:text-black font-semibold"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Crypto
              </TabsTrigger>
              <TabsTrigger 
                value="etf" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D2A63C] data-[state=active]:to-[#BB8525] data-[state=active]:text-black font-semibold"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                ETF
              </TabsTrigger>
              <TabsTrigger 
                value="growth" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D2A63C] data-[state=active]:to-[#BB8525] data-[state=active]:text-black font-semibold"
              >
                <Target className="h-4 w-4 mr-2" />
                Crescimento
              </TabsTrigger>
            </TabsList>

            {/* Tab: Análise DCA */}
            <TabsContent value="dca" className="mt-6">
              <DCAOpportunities analysisSeq={analysisSeq} />
            </TabsContent>

            {/* Tab: Crypto Assets */}
            <TabsContent value="crypto" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
                </div>
              ) : (
                <>
                  {/* Header Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-[#D2A63C]/30">
                      <CardContent className="p-4">
                        {/* Retorno dos ACTIVOS deste cabaz, ponderado pelo dinheiro posto em cada
                            um. Estava aqui «Alocação Total 100%», que é verdade por construção e
                            não informa nada. A cobertura vai declarada: um activo sem cotação não
                            entra em lado nenhum da fracção. */}
                        <div className="text-xs text-gray-400 mb-1">Retorno dos activos · ponderado</div>
                        <div className={`text-2xl font-bold ${(retornoCripto.resultadoPct ?? 0) >= 0 ? 'text-[#D2A63C]' : 'text-red-400'}`}>
                          {pctFormatada(retornoCripto.resultadoPct)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{retornoCripto.comCotacao}/{retornoCripto.activos} activos com cotação</div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-green-500/30">
                      <CardContent className="p-4">
                        {/* PROJECÇÃO, não desempenho — e ponderada pelo investido.
                            Era a média simples dos potenciais de cada activo: um activo de 50 $
                            com «+500 % até ao ATH» puxava o cartão inteiro. O rótulo diz agora o
                            que isto é e de onde vem; o que a carteira FEZ está no cartão de cima
                            e na curva, que é outra coisa e não se confunde com esta. */}
                        <div className="text-xs text-gray-400 mb-1">Potencial até ATH · projecção</div>
                        <div className="text-2xl font-bold text-green-400">
                          {pctFormatada(potencialPonderado(cryptoAssets))}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Alvos da configuração do admin, ponderados pelo investido</div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-blue-500/30">
                      <CardContent className="p-4">
                        {/* O DCA da casa é SEMANAL, às sextas — nas duas carteiras. Estava
                            escrito «Mensal €280» à mão, e €280 não era sequer o valor da
                            configuração: um número fixo no ecrã deixa de bater certo no dia em
                            que alguém mexe na carteira, e ninguém dá por isso. */}
                        <div className="text-xs text-gray-400 mb-1">DCA Semanal · sextas</div>
                        <div className="text-2xl font-bold text-blue-400">
                          ${cryptoAssets.reduce((sum, a) => sum + (Number(a.weekly_reinforcement) || 0), 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Reforço consistente</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* A CONTA REAL DESTE PORTEFÓLIO, logo abaixo dos cartões.
                      Os cartões dizem o que o portefólio PROMETE (alocação, potencial, DCA);
                      isto diz o que ele FEZ. Sem os dois juntos, a página só tinha a promessa. */}
                  {contasPortefolio
                    .filter((c) => c.chave === "PORTF-CRIPTO")
                    .map((c) => (
                      <div key={c.chave} className="mb-6">
                        <CurvaPortefolio
                          titulo={c.nome}
                          curva={c.curva}
                          contribuido={c.contribuido}
                          valor={c.valor}
                          desde={c.desde}
                          dca={c.dca}
                          fontePrecos={c.fontePrecos}
                          nota={c.nota}
                        />
                      </div>
                    ))}

                  {/* Crypto Table */}
                  <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
                    <CardHeader className="border-b border-gray-800">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xl text-[#D2A63C] flex items-center gap-2">
                          <Shield className="h-5 w-5" />
                          Criptomoedas MTM
                        </CardTitle>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                          {cryptoAssets.length} Ativos Ativos
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-800/50">
                            <tr>
                              <th className="text-left py-4 px-6 text-xs text-gray-400 font-semibold uppercase tracking-wider">Ativo</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">Preço</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">Stop Loss</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">TP1</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">TP2</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">TP3</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                                <span className="block">Variação 24h</span>
                                <span className="block font-normal normal-case text-[10px] text-gray-500 mt-0.5">
                                  CoinGecko
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {cryptoAssets.map((asset, index) => (
                              <tr 
                                key={index} 
                                className="border-b border-gray-800/50 hover:bg-[#D2A63C]/5 transition-all group"
                              >
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                    <div>
                                      <div className="font-bold text-white group-hover:text-[#D2A63C] transition-colors flex items-center gap-2">
                                        {asset.name}
                                        {asset.ai_validated && (
                                          <span className="text-[9px] px-1.5 py-0.5 bg-[#D2A63C]/20 text-[#D2A63C] rounded">
                                            🤖 IA
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500 font-mono">{asset.symbol}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center py-4 px-4">
                                  <div className="font-bold text-white">
                                    {asset.current_price ? `$${asset.current_price.toFixed(2)}` : '-'}
                                  </div>
                                </td>
                                <td className="text-center py-4 px-4">
                                  <div className="font-bold text-red-400">
                                    {asset.stop_loss ? `$${asset.stop_loss.toFixed(2)}` : '-'}
                                  </div>
                                </td>
                                <td className="text-center py-4 px-4">
                                  <div className="font-bold text-green-400">
                                    {asset.tp1 ? `$${asset.tp1.toFixed(2)}` : '-'}
                                  </div>
                                </td>
                                <td className="text-center py-4 px-4">
                                  <div className="font-bold text-green-400">
                                    {asset.tp2 ? `$${asset.tp2.toFixed(2)}` : '-'}
                                  </div>
                                </td>
                                <td className="text-center py-4 px-4">
                                  <div className="font-bold text-green-400">
                                    {asset.tp3 ? `$${asset.tp3.toFixed(2)}` : '-'}
                                  </div>
                                </td>
                                <td className="text-center py-4 px-4">
                                  {asset.change_24h_percent !== null &&
                                  asset.change_24h_percent !== undefined ? (
                                    <Badge
                                      className={`font-bold ${
                                        asset.change_24h_percent >= 0
                                          ? "bg-green-500/20 text-green-400 border-green-500/50"
                                          : "bg-red-500/20 text-red-400 border-red-500/50"
                                      }`}
                                    >
                                      {asset.change_24h_percent >= 0 ? "+" : ""}
                                      {asset.change_24h_percent.toFixed(2)}%
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-500 text-sm" title="CoinGecko não devolveu variação 24h para este par">
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Tab: ETF Assets */}
            <TabsContent value="etf" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
                </div>
              ) : (
                <>
                  {/* Header Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-[#D2A63C]/30">
                      <CardContent className="p-4">
                        {/* Igual ao lado cripto: o retorno ponderado dos activos, com cobertura. */}
                        <div className="text-xs text-gray-400 mb-1">Retorno dos activos · ponderado</div>
                        <div className={`text-2xl font-bold ${(retornoETF.resultadoPct ?? 0) >= 0 ? 'text-[#D2A63C]' : 'text-red-400'}`}>
                          {pctFormatada(retornoETF.resultadoPct)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{retornoETF.comCotacao}/{retornoETF.activos} activos com cotação</div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-blue-500/30">
                      <CardContent className="p-4">
                        {/* Mesma correcção do lado cripto: projecção declarada e ponderada pelo
                            investido, nunca a média das percentagens dos activos. */}
                        <div className="text-xs text-gray-400 mb-1">Crescimento a 5 anos · projecção</div>
                        <div className="text-2xl font-bold text-blue-400">
                          {pctFormatada(potencialPonderado(etfAssets))}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Estimativa da configuração do admin, ponderada pelo investido</div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-green-500/30">
                      <CardContent className="p-4">
                        <div className="text-xs text-gray-400 mb-1">DCA Semanal · sextas</div>
                        <div className="text-2xl font-bold text-green-400">
                          ${etfAssets.reduce((sum, a) => sum + (Number(a.weekly_reinforcement) || 0), 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Investimento consistente</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* A conta real deste portefólio. Os cartões dizem o que ele promete; isto diz
                      o que ele fez — e neste caso diz uma coisa boa que não estava à vista. */}
                  {contasPortefolio
                    .filter((c) => c.chave === "PORTF-ETF")
                    .map((c) => (
                      <div key={c.chave} className="mb-6">
                        <CurvaPortefolio
                          titulo={c.nome}
                          curva={c.curva}
                          contribuido={c.contribuido}
                          valor={c.valor}
                          desde={c.desde}
                          dca={c.dca}
                          fontePrecos={c.fontePrecos}
                          nota={c.nota}
                        />
                      </div>
                    ))}

                  {/* ETF Table */}
                  <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
                    <CardHeader className="border-b border-gray-800">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xl text-[#D2A63C] flex items-center gap-2">
                          <Target className="h-5 w-5" />
                          ETFs MTM - Horizonte 5 Anos
                        </CardTitle>
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                          {etfAssets.length} ETFs
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-800/50">
                            <tr>
                              <th className="text-left py-4 px-6 text-xs text-gray-400 font-semibold uppercase tracking-wider">ETF</th>
                              <th className="text-center py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">Alocação</th>
                              <th className="text-right py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">Preço Atual</th>
                              <th className="text-right py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">SL (-60%)</th>
                              <th className="text-right py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">Target 5Y</th>
                              <th className="text-right py-4 px-4 text-xs text-gray-400 font-semibold uppercase tracking-wider">Crescimento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {etfAssets.map((asset, index) => {
                              const stopLoss = asset.current_price ? asset.current_price * 0.40 : 0
                              const target = asset.current_price ? asset.current_price * (1 + asset.potential_growth / 100) : 0
                              
                              return (
                                <tr 
                                  key={index} 
                                  className="border-b border-gray-800/50 hover:bg-[#D2A63C]/5 transition-all group"
                                >
                                  <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                      <div>
                                        <div className="font-bold text-white group-hover:text-[#D2A63C] transition-colors">
                                          {asset.name}
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono">{asset.symbol}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="text-center py-4 px-4">
                                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50 font-mono">
                                      {asset.allocation_percent}%
                                    </Badge>
                                  </td>
                                  <td className="text-right py-4 px-4">
                                    <div className="font-bold text-white">
                                      {asset.current_price ? `$${asset.current_price.toFixed(2)}` : (
                                        <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-auto" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="text-right py-4 px-4">
                                    <div className="text-red-400 font-mono text-sm">
                                      {stopLoss ? `$${stopLoss.toFixed(2)}` : '-'}
                                    </div>
                                  </td>
                                  <td className="text-right py-4 px-4">
                                    <div className="text-green-400 font-mono text-sm">
                                      {target ? `$${target.toFixed(2)}` : '-'}
                                    </div>
                                  </td>
                                  <td className="text-right py-4 px-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <span className="text-lg font-black text-blue-400">
                                        +{asset.potential_growth}%
                                      </span>
                                      <TrendingUp className="h-4 w-4 text-blue-400" />
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Tab: Gráficos de Crescimento */}
            <TabsContent value="growth" className="mt-6">
              {/* As duas contas reais primeiro: o que aconteceu vem antes do que se projecta. */}
              <div className="mb-6 space-y-4">
                {contasPortefolio.map((c) => (
                  <CurvaPortefolio
                    key={c.chave}
                    titulo={c.nome}
                    curva={c.curva}
                    contribuido={c.contribuido}
                    valor={c.valor}
                    desde={c.desde}
                    dca={c.dca}
                    fontePrecos={c.fontePrecos}
                    nota={c.nota}
                  />
                ))}
              </div>
              <PortfolioGrowthCharts 
                cryptoAssets={cryptoAssets}
                etfAssets={etfAssets}
              />
            </TabsContent>
          </Tabs>

          {/* Sistema DCA Info - Layout Melhorado */}
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card Principal - Sistema DCA */}
            <Card className="lg:col-span-2 bg-gradient-to-br from-[#D2A63C]/10 to-[#BB8525]/10 border-[#D2A63C]/40">
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D2A63C] to-[#BB8525] flex items-center justify-center flex-shrink-0">
                    <Target className="h-6 w-6 text-black" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white mb-1">Sistema DCA Automático</h3>
                    <p className="text-sm text-[#D2A63C] font-medium">Together We Go Further</p>
                  </div>
                </div>

                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                  Este dashboard analisa automaticamente oportunidades de reforço baseadas em descontos de mercado, 
                  evitando compras em topos e maximizando o aproveitamento de correções.
                </p>

                {/* «Seguindo o plano com disciplina, esta estratégia aproxima-nos do objetivo de
                    liberdade financeira compartilhada» prometia o destino. O que a estratégia
                    realmente faz — reforçar nas correções em vez de nos topos — é o que fica, e é
                    verificável. O DCA reduz o preço médio de entrada; não elimina o risco de
                    perder dinheiro, e dizê-lo aqui custa uma linha. */}
                <div className="bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-200 italic leading-relaxed">
                    💡 <strong className="text-[#D2A63C]">Filosofia MTM:</strong> reforçar com método,
                    nas correções e não nos topos, para baixar o preço médio de entrada ao longo do tempo.
                    Baixar o preço médio não elimina o risco: uma carteira de cripto e ETF pode valer menos
                    do que o investido, e não há resultado garantido.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Shield className="h-4 w-4 text-red-400" />
                    <span><strong className="text-red-400">SL:</strong> Proteção -60%</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Target className="h-4 w-4 text-green-400" />
                    <span><strong className="text-green-400">Target:</strong> Potencial ATH</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <RefreshCw className="h-4 w-4 text-blue-400" />
                    <span><strong className="text-blue-400">Preços:</strong> CoinGecko Live</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Brain className="h-4 w-4 text-purple-400" />
                    <span><strong className="text-purple-400">Análise:</strong> IA + VWAP</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card Disclaimer Legal - Destacado */}
            <Card className="bg-gradient-to-br from-amber-900/20 to-gray-900/40 border-amber-500/40">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  </div>
                  <h4 className="font-bold text-amber-500">Aviso Legal</h4>
                </div>

                <div className="space-y-3 text-xs text-gray-400 leading-relaxed">
                  <p>
                    <strong className="text-amber-400">⚠️ NÃO é aconselhamento financeiro.</strong><br/>
                    Análises apenas para fins educacionais.
                  </p>
                  
                  <p>
                    <strong className="text-amber-400">📊 Dados automatizados.</strong><br/>
                    Performance passada não garante resultados futuros.
                  </p>
                  
                  <p>
                    <strong className="text-amber-400">🚨 Alto risco.</strong><br/>
                    Possível perda total do capital investido.
                  </p>
                  
                  <div className="mt-4 pt-3 border-t border-amber-500/20">
                    <p className="text-amber-300 font-medium text-[10px]">
                      Consulte um profissional certificado antes de investir. 
                      MoreThanMoney não se responsabiliza por perdas.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </ProtectedPage>
  )
}

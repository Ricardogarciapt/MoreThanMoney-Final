"use client"

import { TV_STUDY_LEGEND_OVERRIDES } from "@/lib/trading-view-scanner-config"
import { Fragment, useEffect, useRef, useState, useImperativeHandle } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertCircle,
  TrendingUp,
  Zap,
  Search,
  Crown,
  Waves,
  Skull,
  Shield,
  ChevronDown,
  Settings,
  Save,
  FolderOpen,
  Maximize2,
  Sun,
  Moon,
  Clock,
  X,
  Share2,
  MessageCircle,
  Loader2,
  Copy,
  Image,
  Target,
  Brain,
  Star,
} from "lucide-react"
import { exitDocumentFullscreen, getFullscreenElement, requestElementFullscreen } from "@/lib/browser-compat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ScannerScreener from "@/components/scanner-screener"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import ChartSocialShareDialog from "@/components/chart-social-share-dialog"
import {
  buildChartShareSnapshot,
  captureChartScreenshot,
  resolveChartShareUrl,
} from "@/lib/chart-share-capture"
import { extractChartShareTradeDraft, type ChartShareTradeDraft } from "@/lib/chart-share-trade"

// Ordem explícita dos scanners (mantém a ordem dos botões)
const scannerOrder = [
  "GoldenZone",
  "Momentum",
  "KillShot",
  "Supernova",
  "Winzone",
  "Sinergy",
  "Goldkiller",
  "MTMScanner",
  "Sensei",
] as const

type ScannerKey = (typeof scannerOrder)[number]

// Scanners disponíveis
const scannerStudies: Record<ScannerKey, string[]> = {
  GoldenZone: ["PUB;0b373fb0e6634a73bc8b838cf0690725"],
  Momentum: ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"],
  KillShot: ["PUB;c1f81145e78a49ce92bd1f81f9c103dd"],
  Supernova: ["PUB;c16bafd7d0874182a1415648ec3ed7b8"],
  Winzone: [
    "PUB;6c003d30b2154ef3a31074d5c703954f",
    "PUB;e6adb5e5246c43f4a8dcffde5c98db4e",
    "PUB;162198dcae874d5da28f7b048feb76e7",
    "PUB;b6587ba7dc7b4489927cfd94d1fb8a9f",
    "PUB;0bf15eb0edba447f84e19fce69391ccb",
  ],
  Sinergy: ["PUB;3b86bd1192124fd98583490bb7508041"],
  Goldkiller: ["PUB;a3eaa6af54de4202a2c2f807fd8baa08"],
  MTMScanner: ["PUB;134fd950920e435694c40be33e3aa98f"],
  Sensei: ["PUB;e00700740fba40ef9f84c0838d68de87"],
}

const scannerLabels: Record<ScannerKey, string> = {
  GoldenZone: "Golden Zone",
  Momentum: "Momentum",
  KillShot: "Kill Shot",
  Supernova: "Supernova",
  Winzone: "Sniper Pro",
  Sinergy: "Quantum",
  Goldkiller: "GoldKiller",
  MTMScanner: "MTM",
  Sensei: "Sensei",
}

const scannerLogos: Record<ScannerKey, { icon: any; color: string; bgColor: string }> = {
  GoldenZone: { icon: Crown, color: "text-gold-300", bgColor: "bg-gradient-to-r from-gold-500 to-yellow-400" },
  Momentum: { icon: Waves, color: "text-blue-300", bgColor: "bg-gradient-to-r from-blue-600 to-cyan-500" },
  KillShot: { icon: Skull, color: "text-gray-300", bgColor: "bg-gradient-to-r from-gray-600 to-slate-500" },
  Supernova: { icon: Zap, color: "text-amber-300", bgColor: "bg-gradient-to-r from-amber-500 to-orange-500" },
  Winzone: { icon: Shield, color: "text-blue-300", bgColor: "bg-gradient-to-r from-blue-700 to-sky-500" },
  Sinergy: { icon: Search, color: "text-cyan-300", bgColor: "bg-gradient-to-r from-cyan-600 to-teal-500" },
  Goldkiller: { icon: Target, color: "text-yellow-300", bgColor: "bg-gradient-to-r from-yellow-600 to-amber-500" },
  MTMScanner: { icon: Brain, color: "text-violet-300", bgColor: "bg-gradient-to-r from-violet-600 to-purple-500" },
  Sensei: { icon: Star, color: "text-rose-300", bgColor: "bg-gradient-to-r from-rose-600 to-pink-500" },
}

// Categorias de ativos
const assetCategories = {
  commodities: [
    { value: "OANDA:XAUUSD", label: "Ouro (XAU/USD)", popular: true },
    { value: "OANDA:XAGUSD", label: "Prata (XAG/USD)", popular: true },
    { value: "OANDA:XPTUSD", label: "Platina (XPT/USD)", popular: false },
    { value: "OANDA:XPDUSD", label: "Paládio (XPD/USD)", popular: false },
    { value: "OANDA:WTICOUSD", label: "Petróleo WTI", popular: true },
    { value: "OANDA:BCOUSD", label: "Petróleo Brent", popular: true },
    { value: "OANDA:NATGASUSD", label: "Gás Natural", popular: false },
    { value: "OANDA:CORNUSD", label: "Milho", popular: false },
    { value: "OANDA:WHEATUSD", label: "Trigo", popular: false },
    { value: "OANDA:SOYBNUSD", label: "Soja", popular: false },
    { value: "OANDA:SUGARUSD", label: "Açúcar", popular: false },
    { value: "OANDA:XCUUSD", label: "Cobre", popular: true },
  ],
  forex: [
    { value: "OANDA:EURUSD", label: "EUR/USD", popular: true },
    { value: "OANDA:GBPUSD", label: "GBP/USD", popular: true },
    { value: "OANDA:USDJPY", label: "USD/JPY", popular: true },
    { value: "OANDA:AUDUSD", label: "AUD/USD", popular: true },
    { value: "OANDA:USDCAD", label: "USD/CAD", popular: true },
    { value: "OANDA:USDCHF", label: "USD/CHF", popular: true },
    { value: "OANDA:NZDUSD", label: "NZD/USD", popular: true },
    { value: "OANDA:EURGBP", label: "EUR/GBP", popular: false },
    { value: "OANDA:EURJPY", label: "EUR/JPY", popular: false },
    { value: "OANDA:GBPJPY", label: "GBP/JPY", popular: false },
    { value: "OANDA:AUDJPY", label: "AUD/JPY", popular: false },
    { value: "OANDA:EURAUD", label: "EUR/AUD", popular: false },
    { value: "OANDA:EURCHF", label: "EUR/CHF", popular: false },
    { value: "OANDA:AUDCAD", label: "AUD/CAD", popular: false },
    { value: "OANDA:GBPAUD", label: "GBP/AUD", popular: false },
    { value: "OANDA:GBPCAD", label: "GBP/CAD", popular: false },
    { value: "OANDA:GBPCHF", label: "GBP/CHF", popular: false },
    { value: "OANDA:AUDCHF", label: "AUD/CHF", popular: false },
    { value: "OANDA:CADJPY", label: "CAD/JPY", popular: false },
    { value: "OANDA:CHFJPY", label: "CHF/JPY", popular: false },
    { value: "OANDA:EURNZD", label: "EUR/NZD", popular: false },
    { value: "OANDA:GBPNZD", label: "GBP/NZD", popular: false },
    { value: "OANDA:NZDJPY", label: "NZD/JPY", popular: false },
    { value: "OANDA:AUDNZD", label: "AUD/NZD", popular: false },
    { value: "OANDA:CADCHF", label: "CAD/CHF", popular: false },
  ],
  crypto: [
    { value: "BINANCE:BTCUSDT", label: "Bitcoin (BTC)", popular: true },
    { value: "BINANCE:ETHUSDT", label: "Ethereum (ETH)", popular: true },
    { value: "BINANCE:BNBUSDT", label: "Binance Coin (BNB)", popular: true },
    { value: "BINANCE:XRPUSDT", label: "Ripple (XRP)", popular: true },
    { value: "BINANCE:ADAUSDT", label: "Cardano (ADA)", popular: true },
    { value: "BINANCE:SOLUSDT", label: "Solana (SOL)", popular: true },
    { value: "BINANCE:DOTUSDT", label: "Polkadot (DOT)", popular: false },
    { value: "BINANCE:DOGEUSDT", label: "Dogecoin (DOGE)", popular: true },
    { value: "BINANCE:MATICUSDT", label: "Polygon (MATIC)", popular: false },
    { value: "BINANCE:LINKUSDT", label: "Chainlink (LINK)", popular: false },
    { value: "BINANCE:LTCUSDT", label: "Litecoin (LTC)", popular: true },
    { value: "BINANCE:AVAXUSDT", label: "Avalanche (AVAX)", popular: false },
    { value: "BINANCE:UNIUSDT", label: "Uniswap (UNI)", popular: false },
    { value: "BINANCE:ATOMUSDT", label: "Cosmos (ATOM)", popular: false },
    { value: "BINANCE:VETUSDT", label: "VeChain (VET)", popular: false },
    { value: "BINANCE:ICPUSDT", label: "Internet Computer (ICP)", popular: false },
    { value: "BINANCE:FILUSDT", label: "Filecoin (FIL)", popular: false },
    { value: "BINANCE:TRXUSDT", label: "Tron (TRX)", popular: false },
    { value: "BINANCE:ETCUSDT", label: "Ethereum Classic (ETC)", popular: false },
    { value: "BINANCE:XLMUSDT", label: "Stellar (XLM)", popular: false },
  ],
  indices: [
    { value: "OANDA:SPX500USD", label: "S&P 500", popular: true },
    { value: "OANDA:NAS100USD", label: "NASDAQ 100", popular: true },
    { value: "OANDA:US30USD", label: "Dow Jones 30", popular: true },
    { value: "OANDA:UK100GBP", label: "FTSE 100 (UK)", popular: true },
    { value: "OANDA:DE30EUR", label: "DAX 30 (Alemanha)", popular: true },
    { value: "OANDA:FR40EUR", label: "CAC 40 (França)", popular: false },
    { value: "OANDA:JP225USD", label: "Nikkei 225 (Japão)", popular: true },
    { value: "OANDA:AU200AUD", label: "ASX 200 (Austrália)", popular: false },
    { value: "OANDA:HK33HKD", label: "Hang Seng (Hong Kong)", popular: false },
    { value: "OANDA:US2000USD", label: "Russell 2000", popular: false },
    { value: "CAPITALCOM:DXY", label: "Dollar Index (DXY)", popular: true },
    { value: "TVC:VIX", label: "VIX (Volatilidade)", popular: true },
  ],
  stocks: [
    { value: "NASDAQ:AAPL", label: "Apple Inc.", popular: true },
    { value: "NASDAQ:MSFT", label: "Microsoft", popular: true },
    { value: "NASDAQ:GOOGL", label: "Alphabet (Google)", popular: true },
    { value: "NASDAQ:AMZN", label: "Amazon", popular: true },
    { value: "NASDAQ:TSLA", label: "Tesla", popular: true },
    { value: "NASDAQ:META", label: "Meta (Facebook)", popular: true },
    { value: "NASDAQ:NVDA", label: "NVIDIA", popular: true },
    { value: "NYSE:JPM", label: "JPMorgan Chase", popular: false },
    { value: "NYSE:V", label: "Visa", popular: false },
    { value: "NYSE:WMT", label: "Walmart", popular: false },
  ],
}

const timeframes = [
  { value: "1", label: "1 min" },
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hora" },
  { value: "240", label: "4 horas" },
  { value: "D", label: "1 dia" },
  { value: "W", label: "1 semana" },
]

declare global {
  interface Window {
    TradingView?: any
  }
}

interface SavedChart {
  id: string
  name: string
  symbol: string
  data: any
  timestamp: number
}

export interface TradingViewWidgetRef {
  getWidget: () => any
  getChart: () => any
  shareChart: () => Promise<string | null>
  captureChartImage: () => Promise<string | null>
  extractTradeDraft: () => Promise<ChartShareTradeDraft>
}

export default function TradingViewWidget({
  scannerType = "KillShot",
  showScreener = false,
  // Props opcionais para controlo externo (usado pelo sistema de layouts)
  externalSymbol,
  externalTimeframe,
  externalTheme,
  externalStudies,
  excludedStudies,
  onSymbolChange,
  onTimeframeChange,
  onThemeChange,
  onStudiesChange,
  widgetRef: externalWidgetRef,
  scannerAccessMode = false,
  shareDestination,
}: {
  scannerType?: ScannerKey
  showScreener?: boolean
  scannerAccessMode?: boolean
  shareDestination?: "social" | "groups" | "both"
  externalSymbol?: string
  externalTimeframe?: string
  externalTheme?: "light" | "dark"
  externalStudies?: ScannerKey[]
  excludedStudies?: ScannerKey[]
  onSymbolChange?: (symbol: string) => void
  onTimeframeChange?: (timeframe: string) => void
  onThemeChange?: (theme: "light" | "dark") => void
  onStudiesChange?: (studies: ScannerKey[]) => void
  widgetRef?: React.RefObject<TradingViewWidgetRef>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const [widgetLoaded, setWidgetLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isLoadingScanner = useRef(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showShareToGroup, setShowShareToGroup] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  const [sharingChart, setSharingChart] = useState(false)
  const [copyingImage, setCopyingImage] = useState(false)

  const shareDest = shareDestination ?? (scannerAccessMode ? "social" : "both")
  const canShareToSocial = shareDest === "social" || shareDest === "both"
  const canShareToGroups = shareDest === "groups" || shareDest === "both"
  const [isAdmin, setIsAdmin] = useState(false)
  const [isVip, setIsVip] = useState(false)
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  
  // Obter ID do utilizador autenticado e verificar permissões
  useEffect(() => {
    const getUserId = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          setCurrentUserId(session.user.id)
          
          // Verificar se é admin ou VIP (query resiliente: membership_type pode não existir em todos os ambientes)
          let profile: { user_type?: string; membership_type?: string } | null = null
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('user_type, membership_type, member_category')
            .eq('id', session.user.id)
            .maybeSingle()
          if (profileError) {
            const { data: fallback } = await supabase
              .from('profiles')
              .select('user_type, member_category')
              .eq('id', session.user.id)
              .maybeSingle()
            profile = fallback ? { ...fallback, membership_type: undefined } : null
          } else {
            profile = profileData
          }
          if (profile) {
            setIsAdmin(profile.user_type === 'admin')
            setIsVip(
              profile.membership_type === 'vip' || (profile as { member_category?: string }).member_category === 'vip'
            )
            if ((profile.user_type === 'admin' || profile.membership_type === 'vip') && canShareToGroups) {
              loadAvailableGroups()
            }
          }
        }
      } catch (error) {
        console.error('Erro ao obter user ID:', error)
      }
    }
    getUserId()
  }, [])
  
  // Carregar grupos disponíveis para partilha
  const loadAvailableGroups = async () => {
    try {
      setLoadingGroups(true)
      const response = await fetch('/api/messages/groups?mobile_only=true', {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        const groups = (data.groups || []).map((g: any) => ({
          id: g.id,
          name: g.name
        }))
        setAvailableGroups(groups)
      } else {
        console.error('Erro ao carregar grupos:', await response.json())
      }
    } catch (error) {
      console.error('Erro ao carregar grupos:', error)
    } finally {
      setLoadingGroups(false)
    }
  }

  // Estados - usar props externas se fornecidas, senão usar localStorage
  const [selectedStudies, setSelectedStudies] = useState<ScannerKey[]>(() => {
    if (externalStudies) return externalStudies
    const saved = localStorage.getItem("mtm_active_scanners")
    return saved ? JSON.parse(saved) : (["KillShot"] as ScannerKey[])
  })
  const [selectedSymbol, setSelectedSymbol] = useState(externalSymbol || "OANDA:XAUUSD")
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (externalTheme) return externalTheme
    const saved = localStorage.getItem("mtm_chart_theme")
    return (saved as "light" | "dark") || "dark"
  })
  const [favoriteTimeframe, setFavoriteTimeframe] = useState(() => {
    if (externalTimeframe) return externalTimeframe
    const saved = localStorage.getItem("mtm_favorite_timeframe")
    return saved || "60"
  })

  // Sincronizar com props externas quando mudarem
  useEffect(() => {
    if (externalSymbol) setSelectedSymbol(externalSymbol)
  }, [externalSymbol])

  useEffect(() => {
    if (externalTimeframe) setFavoriteTimeframe(externalTimeframe)
  }, [externalTimeframe])

  useEffect(() => {
    if (externalTheme) setTheme(externalTheme)
  }, [externalTheme])

  useEffect(() => {
    if (externalStudies) {
      console.log('📊 [TRADINGVIEW] Atualizando estudos via props externas:', externalStudies)
      setSelectedStudies(externalStudies)
    }
  }, [externalStudies])

  // Dropdown de ativos
  const [showAssetDropdown, setShowAssetDropdown] = useState(false)
  const [assetSearchTerm, setAssetSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof assetCategories>("forex")

  // Configurações
  const [showSettings, setShowSettings] = useState(false)

  // Gráficos salvos
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [chartNameToSave, setChartNameToSave] = useState("")

  // Persistir estudos selecionados
  useEffect(() => {
    localStorage.setItem("mtm_active_scanners", JSON.stringify(selectedStudies))
  }, [selectedStudies])

  // Persistir tema
  useEffect(() => {
    localStorage.setItem("mtm_chart_theme", theme)
  }, [theme])

  // Persistir timeframe favorito
  useEffect(() => {
    localStorage.setItem("mtm_favorite_timeframe", favoriteTimeframe)
  }, [favoriteTimeframe])

  // Carregar gráficos salvos do Supabase
  useEffect(() => {
    loadSavedCharts()
  }, [])

  const loadSavedCharts = async () => {
    setLoadingCharts(true)
    try {
      const response = await fetch('/api/charts', {
        credentials: 'include',
        cache: 'no-store'
      })
      const data = await response.json()
      
      if (data.success && data.charts) {
        // Converter formato do Supabase para SavedChart
        const charts: SavedChart[] = data.charts.map((chart: any) => ({
          id: chart.id,
          name: chart.chart_name,
          symbol: chart.symbol,
          data: {
            symbol: chart.symbol,
            studies: chart.selected_studies || [],
            theme: chart.theme,
            timeframe: chart.timeframe,
            timestamp: new Date(chart.created_at).getTime(),
            chart_state: chart.chart_state,
            drawings_data: chart.drawings_data
          },
          timestamp: new Date(chart.created_at).getTime()
        }))
        setSavedCharts(charts)
      }
    } catch (error) {
      console.error('Erro ao carregar charts:', error)
      // Fallback para localStorage se API falhar
      const saved = localStorage.getItem("mtm_saved_charts")
      if (saved) {
        setSavedCharts(JSON.parse(saved))
      }
    } finally {
      setLoadingCharts(false)
    }
  }

  const toggleStudy = (study: ScannerKey) => {
    setSelectedStudies((prev) => {
      const newStudies = prev.includes(study) ? prev.filter((s) => s !== study) : [...prev, study]
      if (onStudiesChange) onStudiesChange(newStudies)
      return newStudies
    })
  }

  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol)
    if (onSymbolChange) onSymbolChange(symbol)
    setShowAssetDropdown(false)
    setAssetSearchTerm("")
  }

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme)
    if (onThemeChange) onThemeChange(newTheme)
  }

  const handleTimeframeChange = (newTimeframe: string) => {
    setFavoriteTimeframe(newTimeframe)
    if (onTimeframeChange) onTimeframeChange(newTimeframe)
  }

  // Função auxiliar para guardar desenhos no Supabase
  const saveDrawingsToSupabase = async (drawings: any[]) => {
    if (!currentUserId || drawings.length === 0) return
    
    try {
      // Guardar desenhos no último chart salvo ou criar um chart temporário
      // Por agora, apenas logamos - podemos melhorar depois
      console.log('📊 [TRADINGVIEW] Desenhos capturados:', drawings.length)
    } catch (error) {
      console.error('Erro ao guardar desenhos:', error)
    }
  }

  // Função auxiliar para guardar um desenho individual
  const saveDrawingToSupabase = async (drawing: any) => {
    if (!currentUserId) return
    
    try {
      console.log('📊 [TRADINGVIEW] Desenho capturado:', drawing)
      // Pode ser implementado para guardar desenho individual se necessário
    } catch (error) {
      console.error('Erro ao guardar desenho:', error)
    }
  }

  const handleSaveChart = async () => {
    if (!chartNameToSave.trim()) {
      alert("Por favor, insira um nome para o gráfico")
      return
    }

    try {
      // Tentar obter desenhos do TradingView se disponível
      let drawingsData: any[] = []
      if (widgetRef.current) {
        try {
          const chart = widgetRef.current.chart && widgetRef.current.chart()
          if (chart) {
            // Método principal: usar chart.save() que captura TUDO incluindo desenhos
            if (typeof chart.save === 'function') {
              try {
                const chartState = chart.save()
                console.log('📊 [TRADINGVIEW] Estado completo do chart:', chartState)
                
                // O TradingView guarda desenhos em chartState.shapes ou chartState.drawings
                if (chartState) {
                  if (chartState.shapes) {
                    drawingsData = chartState.shapes
                  } else if (chartState.drawings) {
                    drawingsData = chartState.drawings
                  } else if (chartState.objects) {
                    // Desenhos podem estar em objects
                    drawingsData = chartState.objects.filter((obj: any) => 
                      obj.type && (obj.type.includes('line') || obj.type.includes('shape') || obj.type.includes('drawing'))
                    ) || []
                  }
                  
                  // Guardar estado completo do chart (inclui desenhos)
                  console.log('📊 [TRADINGVIEW] Desenhos capturados:', drawingsData.length)
                }
              } catch (e) {
                console.warn('Não foi possível salvar estado do chart:', e)
              }
            }
            
            // Métodos alternativos (fallback)
            if (drawingsData.length === 0) {
              if (typeof chart.getAllShapes === 'function') {
                const shapes = chart.getAllShapes()
                drawingsData = shapes || []
              } else if (typeof chart.getAllStudies === 'function') {
                const studies = chart.getAllStudies()
                drawingsData = studies.filter((s: any) => s.isDrawing || s.type === 'drawing') || []
              }
            }
          }
        } catch (e) {
          console.warn('Não foi possível obter desenhos do TradingView:', e)
        }
      }

      // Salvar estado completo do gráfico
      const chartState = {
        symbol: selectedSymbol,
        studies: selectedStudies,
        theme: theme,
        timeframe: favoriteTimeframe,
        timestamp: Date.now(),
      }

      // Salvar no Supabase
      const response = await fetch('/api/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chart_name: chartNameToSave,
          symbol: selectedSymbol,
          timeframe: favoriteTimeframe,
          theme: theme,
          chart_state: chartState,
          drawings_data: drawingsData,
          selected_studies: selectedStudies,
          is_favorite: false
        })
      })

      const data = await response.json()

      if (data.success) {
        // Recarregar lista de charts
        await loadSavedCharts()
        setChartNameToSave("")
        setShowSaveDialog(false)
        alert(`✅ Gráfico "${chartNameToSave}" salvo com sucesso!`)
      } else {
        throw new Error(data.error || 'Erro ao salvar gráfico')
      }
    } catch (error: any) {
      console.error("Erro ao salvar gráfico:", error)
      alert(`❌ Erro ao salvar gráfico: ${error.message || 'Tente novamente.'}`)
    }
  }

  const handleLoadChart = async (chart: SavedChart) => {
    try {
      console.log("📂 Carregando gráfico:", chart.name)
      
      // Restaurar estado do gráfico
      if (chart.data) {
        setSelectedSymbol(chart.data.symbol || chart.symbol)
        setSelectedStudies(chart.data.studies || [])
        handleThemeChange(chart.data.theme || "dark")
        handleTimeframeChange(chart.data.timeframe || "60")
        
        // Tentar restaurar desenhos se disponível
        if (chart.data.drawings_data && widgetRef.current?.chart) {
          setTimeout(() => {
            try {
              const chartWidget = widgetRef.current.chart()
              if (chartWidget && typeof chartWidget.createShape === 'function') {
                // Restaurar desenhos (se TradingView suportar)
                chart.data.drawings_data.forEach((drawing: any) => {
                  try {
                    // TradingView pode ter métodos específicos para restaurar desenhos
                    // Esta é uma implementação básica - pode precisar de ajustes
                    if (drawing.type && chartWidget[`create${drawing.type}`]) {
                      chartWidget[`create${drawing.type}`](drawing)
                    }
                  } catch (e) {
                    console.warn('Erro ao restaurar desenho:', e)
                  }
                })
              }
            } catch (e) {
              console.warn('Não foi possível restaurar desenhos:', e)
            }
          }, 2000) // Aguardar widget carregar
        }
      }

      setShowLoadDialog(false)
      alert(`✅ Gráfico "${chart.name}" carregado com sucesso!`)
    } catch (error) {
      console.error("Erro ao carregar gráfico:", error)
      alert("❌ Erro ao carregar gráfico. Tente novamente.")
    }
  }

  const handleDeleteChart = async (chartId: string) => {
    if (!confirm("Tem certeza que deseja deletar este gráfico?")) {
      return
    }

    try {
      const response = await fetch(`/api/charts/${chartId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        // Recarregar lista de charts
        await loadSavedCharts()
        alert('✅ Gráfico apagado com sucesso!')
      } else {
        throw new Error(data.error || 'Erro ao apagar gráfico')
      }
    } catch (error: any) {
      console.error('Erro ao apagar gráfico:', error)
      alert(`❌ Erro ao apagar gráfico: ${error.message || 'Tente novamente.'}`)
    }
  }

  const handleFullscreen = async () => {
    if (!containerRef.current) return
    if (getFullscreenElement()) {
      await exitDocumentFullscreen()
    } else {
      await requestElementFullscreen(containerRef.current)
    }
  }

  const loadTradingViewWidget = async () => {
    if (!window.TradingView) {
      setError("TradingView não está disponível. Tente recarregar a página.")
      return
    }

    if (isLoadingScanner.current) return
    isLoadingScanner.current = true

    try {
      if (containerRef.current) {
        containerRef.current.innerHTML =
          '<div id="tradingview_widget" style="height:100%;width:100%;min-height:360px;position:absolute;inset:0;"></div>'
      }

      // Usar a abordagem simples que funcionava - todos os estudos no array studies
      const studiesToApply = selectedStudies.flatMap((key) => scannerStudies[key] || [])
      
      console.log('📊 [TRADINGVIEW] Carregando widget com estudos:', {
        selectedStudies,
        studiesToApply,
        count: studiesToApply.length,
        usingExternal: !!externalStudies
      })

      const widgetOptions = {
        autosize: true,
        symbol: selectedSymbol,
        interval: favoriteTimeframe,
        timezone: "Etc/UTC",
        theme: theme,
        style: "1",
        locale: "pt",
        toolbar_bg: theme === "dark" ? "#1E1E1E" : "#FFFFFF",
        enable_publishing: true,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        hide_top_toolbar: false,
        hide_legend: false,
        withdateranges: true,
        save_image: true,
        container_id: "tradingview_widget",
        studies: studiesToApply,
        /* scanner-access: sem enabled_features (whitelist) — toolbar nativa por defeito */
        disabled_features: ["volume_force_overlay", "create_volume_indicator_by_default"],
        charts_storage_url: "https://saveload.tradingview.com",
        charts_storage_api_version: "1.1",
        client_id: "morethanmoney.pt",
        user_id: currentUserId || "public_user_id", // Usar ID do utilizador autenticado para guardar desenhos por utilizador
        loading_screen: { backgroundColor: theme === "dark" ? "#1E1E1E" : "#FFFFFF", foregroundColor: "#f9b208" },
        overrides: {
          ...TV_STUDY_LEGEND_OVERRIDES,
        },
      }

      widgetRef.current = new window.TradingView.widget(widgetOptions)

      // Configurar callbacks para capturar desenhos quando chart estiver pronto
      if (widgetRef.current && typeof widgetRef.current.onChartReady === "function") {
        widgetRef.current.onChartReady(() => {
          // Guardar referência do chart para uso posterior
          if (widgetRef.current) {
            try {
              const chart = widgetRef.current.chart && widgetRef.current.chart()
              if (chart) {
                // Tentar capturar desenhos periodicamente (quando chart mudar)
                // O TradingView pode expor desenhos através de eventos ou métodos específicos
                console.log('📊 [TRADINGVIEW] Chart pronto, configurando captura de desenhos')
              }
            } catch (e) {
              console.warn('Não foi possível configurar captura de desenhos:', e)
            }
          }
          
          // Tentar abrir o gráfico com uma vista inicial "resetada" para melhor visualização dos scanners
          // E configurar AUTO e apenas escala de preço após o chart estar pronto
          try {
            const chart = widgetRef.current.chart && widgetRef.current.chart()
            if (chart) {
              if (typeof chart.applyOverrides === "function") {
                chart.applyOverrides(TV_STUDY_LEGEND_OVERRIDES)
              }

              // Reset inicial (opcional)
              if (typeof chart.resetData === "function") {
                chart.resetData()
              }
              
              // Configurar todos os estudos para usar AUTO e apenas escala de preço
              setTimeout(() => {
                try {
                  const allStudies = chart.getAllStudies?.() || []
                  console.log(`📊 [TRADINGVIEW] Configurando ${allStudies.length} estudos com AUTO e escala de preço`)
                  console.log(`📊 [TRADINGVIEW] Estudos encontrados:`, allStudies.map((s: any) => s.name || s.id))
                  
                  allStudies.forEach((study: any, index: number) => {
                    try {
                      const studyName = study.name || study.id || `study-${index}`
                      console.log(`📊 [TRADINGVIEW] Configurando estudo ${index + 1}/${allStudies.length}: ${studyName}`)
                      
                      // Habilitar AUTO (autoScale) - adapta escala automaticamente
                      if (typeof study.setAutoScale === 'function') {
                        study.setAutoScale(true)
                        console.log(`✅ [TRADINGVIEW] AUTO habilitado para ${studyName}`)
                      }
                      // Configurar para usar apenas escala de preços (não criar escala separada)
                      if (typeof study.setPriceScale === 'function') {
                        study.setPriceScale(true)
                        console.log(`✅ [TRADINGVIEW] Escala de preço configurada para ${studyName}`)
                      }
                      // Alternativa via setEntityInfo se disponível
                      if (typeof study.setEntityInfo === 'function') {
                        study.setEntityInfo({ 
                          priceScaleId: 'right',
                          autoScale: true 
                        })
                        console.log(`✅ [TRADINGVIEW] EntityInfo configurado para ${studyName}`)
                      }
                    } catch (e) {
                      console.warn(`⚠️ [TRADINGVIEW] Erro ao configurar estudo ${index}:`, e)
                    }
                  })
                  
                  console.log(`✅ [TRADINGVIEW] Configuração de estudos concluída`)
                } catch (e) {
                  console.warn("Não foi possível configurar AUTO e escala de preço:", e)
                }
              }, 1500) // Delay para garantir que estudos estão carregados
            }
          } catch (e) {
            console.warn("Não foi possível aplicar resetData e configurar estudos:", e)
          }
        })
      }
      setWidgetLoaded(true)
      setError(null)
    } catch (err: any) {
      console.error("Erro ao inicializar widget:", err)
      setError(`Erro ao inicializar widget: ${err.message}`)
    } finally {
      isLoadingScanner.current = false
    }
  }

  useEffect(() => {
    const loadScript = () => {
      if (document.getElementById("tradingview-script")) {
        init()
        return
      }

      const script = document.createElement("script")
      script.id = "tradingview-script"
      script.src = "https://s3.tradingview.com/tv.js"
      script.async = true
      script.onload = init
      script.onerror = () => setError("Falha ao carregar o script do TradingView")
      document.head.appendChild(script)
    }

    const init = () => {
      if (!window.TradingView) {
        setTimeout(init, 100)
        return
      }
      loadTradingViewWidget()
    }

    loadScript()

    return () => {
      if (widgetRef.current?.remove) {
        try {
          widgetRef.current.remove()
        } catch {
          // DOM já pode ter sido desmontado pelo React; ignorar
        }
      }
    }
  }, [])

  useEffect(() => {
    if (widgetRef.current?.remove) {
      try {
        widgetRef.current.remove()
      } catch {
        // Ignorar se o DOM já foi desmontado
      }
    }
    loadTradingViewWidget()
  }, [selectedStudies, selectedSymbol, theme, favoriteTimeframe])

  const resolveChartInstance = () => widgetRef.current?.chart?.() ?? null

  const chartUrlFallback = {
    symbol: selectedSymbol,
    interval: favoriteTimeframe,
    studies: selectedStudies.flatMap((key) => scannerStudies[key] || []),
    theme,
  }

  // Expor métodos via ref
  useImperativeHandle(externalWidgetRef, (): TradingViewWidgetRef => ({
    getWidget: () => widgetRef.current,
    getChart: () => widgetRef.current?.chart?.() || null,
    shareChart: async () => {
      try {
        return await resolveChartShareUrl(
          widgetRef.current?.chart?.() ?? null,
          widgetRef.current ?? null,
          chartUrlFallback
        )
      } catch (error) {
        console.error("Erro ao obter URL do gráfico:", error)
        return null
      }
    },
    captureChartImage: async () => {
      try {
        return await captureChartScreenshot(
          widgetRef.current?.chart?.() ?? null,
          containerRef.current,
          widgetRef.current
        )
      } catch (error) {
        console.error("Erro ao capturar imagem:", error)
        return null
      }
    },
    extractTradeDraft: async () => extractChartShareTradeDraft(resolveChartInstance(), selectedSymbol),
  }), [selectedSymbol, favoriteTimeframe, selectedStudies])

  // Blindagem: evita crash se selectedCategory vier inválido em runtime.
  const selectedCategoryAssets = assetCategories[selectedCategory] ?? assetCategories.forex

  // Filtrar ativos por categoria e busca
  const filteredAssets = selectedCategoryAssets.filter((asset) =>
    asset.label.toLowerCase().includes(assetSearchTerm.toLowerCase()) ||
    asset.value.toLowerCase().includes(assetSearchTerm.toLowerCase())
  )

  const popularAssets = filteredAssets.filter((a) => a.popular)
  const otherAssets = filteredAssets.filter((a) => !a.popular)

  return (
    <>
    <div
      className="w-full relative bg-gray-900 border border-gold-500/30 rounded-lg overflow-hidden flex flex-col"
      style={{ aspectRatio: "16/9", minHeight: scannerAccessMode ? "520px" : "480px" }}
    >
      {error && (
        <Alert className="absolute top-2 left-2 right-2 z-20 bg-red-500/20 border-red-500">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Barra MTM (fluxo normal — não sobrepõe o iframe do TradingView) */}
      <div className="shrink-0 z-30 bg-gray-800/95 backdrop-blur-sm py-2 px-3 border-b border-gold-500/30">
        <div className="flex items-center justify-between gap-2">
          {/* Dropdown de Ativos */}
          <div className="relative">
            <Button
              onClick={() => setShowAssetDropdown(!showAssetDropdown)}
              className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80 border border-gray-600/50 flex items-center gap-2"
            >
              <span className="text-sm font-medium">{selectedSymbol}</span>
              <ChevronDown className="w-4 h-4" />
            </Button>

            {showAssetDropdown && (
              <div className="absolute top-full left-0 mt-1 w-96 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 max-h-[500px] overflow-hidden flex flex-col">
                {/* Campo de pesquisa */}
                <div className="p-3 border-b border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Pesquisar ativo..."
                      value={assetSearchTerm}
                      onChange={(e) => setAssetSearchTerm(e.target.value)}
                      className="pl-8 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Categorias */}
                <div className="flex border-b border-gray-700">
                  {(Object.keys(assetCategories) as Array<keyof typeof assetCategories>).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex-1 py-2 px-3 text-xs font-medium transition-colors ${
                        selectedCategory === cat
                          ? "bg-[#D2A63C] text-black"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {cat === "commodities" && "Commodities"}
                      {cat === "forex" && "Forex"}
                      {cat === "crypto" && "Crypto"}
                      {cat === "indices" && "Índices"}
                      {cat === "stocks" && "Ações"}
                    </button>
                  ))}
                </div>

                {/* Lista de ativos */}
                <div className="overflow-y-auto flex-1">
                  {popularAssets.length > 0 && (
                    <div className="p-2">
                      <div className="text-xs font-semibold text-gold-400 mb-2 px-2">Principais</div>
                      <div className="grid grid-cols-2 gap-1">
                        {popularAssets.map((asset) => (
                          <button
                            key={asset.value}
                            onClick={() => handleSymbolSelect(asset.value)}
                            className="px-3 py-2 text-left text-sm text-white bg-gray-700/50 hover:bg-[#D2A63C] hover:text-black rounded transition-colors"
                          >
                            {asset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {otherAssets.length > 0 && (
                    <div className="p-2">
                      <div className="text-xs font-semibold text-gray-400 mb-2 px-2">Outros</div>
                      <div className="grid grid-cols-2 gap-1">
                        {otherAssets.map((asset) => (
                          <button
                            key={asset.value}
                            onClick={() => handleSymbolSelect(asset.value)}
                            className="px-3 py-2 text-left text-sm text-gray-300 bg-gray-700/30 hover:bg-gray-600 rounded transition-colors"
                          >
                            {asset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredAssets.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">Nenhum ativo encontrado</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Configurações */}
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80" title="Configurações">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-800 border-gray-600 text-white">
                <DialogHeader>
                  <DialogTitle className="text-[#D2A63C]">Configurações do Gráfico</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* Tema */}
                  <div className="space-y-3">
                    <Label className="text-gray-300">Tema</Label>
                    <RadioGroup value={theme} onValueChange={(v) => handleThemeChange(v as "light" | "dark")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="dark" id="dark" />
                        <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer">
                          <Moon className="w-4 h-4" />
                          Escuro
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="light" id="light" />
                        <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer">
                          <Sun className="w-4 h-4" />
                          Claro
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Timeframe favorito */}
                  <div className="space-y-3">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Timeframe Padrão
                    </Label>
                    <Select value={favoriteTimeframe} onValueChange={handleTimeframeChange}>
                      <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600 text-white">
                        {timeframes.map((tf) => (
                          <SelectItem key={tf.value} value={tf.value}>
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Salvar gráfico */}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80" title="Salvar Gráfico">
                  <Save className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-800 border-gray-600 text-white">
                <DialogHeader>
                  <DialogTitle className="text-[#D2A63C]">Salvar Gráfico</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">Nome do Gráfico</Label>
                    <Input
                      value={chartNameToSave}
                      onChange={(e) => setChartNameToSave(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveChart()
                        }
                      }}
                      placeholder="Ex: Análise XAU/USD - 10/01"
                      className="bg-gray-700 border-gray-600 text-white"
                      autoFocus
                    />
                  </div>
                  <div className="text-xs text-gray-400">
                    Gráficos salvos: {savedCharts.length}/20
                  </div>
                  <Button
                    onClick={handleSaveChart}
                    className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black hover:opacity-90"
                  >
                    Salvar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Copiar imagem do gráfico (complementa menu nativo TV) */}
            <Button
              onClick={async () => {
                setCopyingImage(true)
                try {
                  let chartImage: string | null = null
                  if (externalWidgetRef?.current) {
                    chartImage = await externalWidgetRef.current.captureChartImage()
                  } else if (widgetRef.current) {
                    const chart = widgetRef.current.chart?.()
                    if (chart && typeof chart.takeScreenshot === "function") {
                      const screenshot = await chart.takeScreenshot()
                      if (typeof screenshot === "string") {
                        chartImage = screenshot.startsWith("data:")
                          ? screenshot
                          : `data:image/png;base64,${screenshot}`
                      }
                    }
                  }
                  if (!chartImage) {
                    alert("Não foi possível copiar a imagem. Usa o menu do gráfico (clique direito) → Copiar imagem.")
                    return
                  }
                  if (navigator.clipboard?.write) {
                    const res = await fetch(chartImage)
                    const blob = await res.blob()
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
                    alert("Imagem do gráfico copiada para a área de transferência.")
                  } else {
                    await navigator.clipboard.writeText(chartImage)
                    alert("Imagem copiada (formato base64).")
                  }
                } catch (e) {
                  console.error("Erro ao copiar imagem:", e)
                  alert("Erro ao copiar imagem. Tenta pelo menu nativo do TradingView (clique direito no gráfico).")
                } finally {
                  setCopyingImage(false)
                }
              }}
              disabled={copyingImage}
              className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80"
              title="Copiar imagem do gráfico"
            >
              {copyingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
            </Button>

            {/* Partilhar link (Alt+S) - Funcionalidade nativa do TradingView */}
            <Button
              onClick={async () => {
                try {
                  if (!externalWidgetRef?.current) {
                    // Se não há ref externa, usar ref interna
                    const chart = widgetRef.current?.chart?.()
                    if (chart && typeof chart.getChartUrl === 'function') {
                      const chartUrl = await chart.getChartUrl()
                      if (chartUrl) {
                        await navigator.clipboard.writeText(chartUrl)
                        alert('Link do gráfico copiado para a área de transferência!')
                        return
                      }
                    }
                  }
                  
                  const chartUrl = await externalWidgetRef?.current?.shareChart()
                  if (chartUrl) {
                    await navigator.clipboard.writeText(chartUrl)
                    alert('Link do gráfico copiado para a área de transferência!')
                  } else {
                    alert('Não foi possível obter o link do gráfico. Tenta novamente.')
                  }
                } catch (error) {
                  console.error('Erro ao partilhar gráfico:', error)
                  alert('Erro ao partilhar gráfico. Tenta novamente.')
                }
              }}
              className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80"
              title="Partilhar link do gráfico (Alt+S)"
            >
              <Share2 className="w-4 h-4" />
            </Button>

            {/* Carregar gráfico */}
            <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
              <DialogTrigger asChild>
                <Button className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80" title="Carregar Gráfico">
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-800 border-gray-600 text-white max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-[#D2A63C]">Carregar Gráfico Salvo</DialogTitle>
                </DialogHeader>
                <div className="py-4 max-h-[400px] overflow-y-auto">
                  {loadingCharts ? (
                    <div className="text-center py-8 text-gray-400">
                      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p>A carregar gráficos...</p>
                    </div>
                  ) : savedCharts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">Nenhum gráfico salvo</div>
                  ) : (
                    <div className="space-y-2">
                      {savedCharts.map((chart) => (
                        <div
                          key={chart.id}
                          className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-white">{chart.name}</div>
                            <div className="text-xs text-gray-400">
                              {chart.symbol} • {new Date(chart.timestamp).toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleLoadChart(chart)}
                              size="sm"
                              className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                            >
                              Carregar
                            </Button>
                            <Button
                              onClick={() => handleDeleteChart(chart.id)}
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Fullscreen */}
            <Button
              onClick={handleFullscreen}
              className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80"
              title="Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>

            {/* Partilhar no Social MTM ou grupos (VIP/Admin) */}
            {(isAdmin || isVip) && (canShareToSocial || canShareToGroups) && (
              <>
                <Button
                  onClick={() => setShowShareToGroup(true)}
                  className="h-9 px-3 bg-gray-700/80 text-white hover:bg-gray-600/80"
                  title={
                    canShareToSocial
                      ? "Partilhar gráfico no Social (app-mobile)"
                      : "Partilhar gráfico num grupo"
                  }
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
                {canShareToSocial && (
                  <ChartSocialShareDialog
                    open={showShareToGroup}
                    onOpenChange={setShowShareToGroup}
                    symbol={selectedSymbol}
                    widgetLoaded={widgetLoaded}
                    getChart={resolveChartInstance}
                    getWidget={() => widgetRef.current}
                    chartContainer={containerRef.current}
                    urlFallback={chartUrlFallback}
                    captureChartImage={async () =>
                      captureChartScreenshot(
                        widgetRef.current?.chart?.() ?? null,
                        containerRef.current,
                        widgetRef.current
                      )
                    }
                  />
                )}
                {canShareToGroups && !canShareToSocial && (
                  <Dialog
                    open={showShareToGroup}
                    onOpenChange={(open) => {
                      setShowShareToGroup(open)
                      if (!open) setSelectedGroup("")
                    }}
                  >
                    <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-[#D2A63C]">Partilhar em grupo</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Seleciona o grupo de mensagens.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-4 space-y-3">
                        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                            <SelectValue placeholder={loadingGroups ? "A carregar…" : "Grupo"} />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700">
                            {availableGroups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          disabled={sharingChart || !selectedGroup}
                          className="w-full bg-[#D2A63C] text-black"
                          onClick={async () => {
                            if (!selectedGroup) return
                            setSharingChart(true)
                            try {
                              const snapshot = await buildChartShareSnapshot({
                                chart: resolveChartInstance(),
                                widget: widgetRef.current,
                                container: containerRef.current,
                                fallbackSymbol: selectedSymbol,
                                urlFallback: chartUrlFallback,
                              })
                              const groupToShare = availableGroups.find((g) => g.id === selectedGroup)
                              const response = await fetch("/api/messages/share-chart", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({
                                  groupId: selectedGroup,
                                  groupName: groupToShare?.name ?? selectedGroup,
                                  chartUrl: snapshot.chartUrl || "",
                                  chartImage: snapshot.image || "",
                                  symbol: snapshot.symbol,
                                }),
                              })
                              const result = await response.json().catch(() => ({}))
                              if (!response.ok) {
                                alert(result.error || "Erro ao partilhar no grupo.")
                                return
                              }
                              setShowShareToGroup(false)
                              setSelectedGroup("")
                              alert("Gráfico partilhado com sucesso!")
                            } catch (e) {
                              console.error(e)
                              alert("Erro ao partilhar. Tenta novamente.")
                            } finally {
                              setSharingChart(false)
                            }
                          }}
                        >
                          {sharingChart ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            "Partilhar"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </>
            )}
          </div>
        </div>

        {/* Scanners */}
        <div className="flex flex-nowrap gap-2 overflow-x-auto mt-2 pb-2 scrollbar-thin scrollbar-thumb-gold-500/50">
          {scannerOrder
            .filter((key) => !excludedStudies || !excludedStudies.includes(key))
            .map((key) => {
              const logo = scannerLogos[key]
              const Icon = logo.icon
              const isChecked = selectedStudies.includes(key)

              return (
                <button
                  key={key}
                  onClick={() => toggleStudy(key)}
                  className={`h-9 transition-all duration-300 transform hover:scale-105 ${
                    isChecked
                      ? `${logo.bgColor} text-white shadow-lg`
                      : "bg-gray-700/80 text-gray-300 hover:bg-gray-600/80"
                  } border border-gray-600/50 px-3 py-1 rounded-md flex items-center gap-2 text-xs whitespace-nowrap`}
                >
                  <div className={`w-2 h-2 rounded-full ${isChecked ? "bg-white" : "bg-gray-400"}`} />
                  <Icon className={`w-3 h-3 ${isChecked ? "text-white" : logo.color}`} />
                  <span>{scannerLabels[key]}</span>
                </button>
              )
            })}
        </div>
      </div>

      {/* Área do widget TradingView (tv.js injeta iframe — eventos no iframe, não no wrapper) */}
      <div className="relative flex-1 min-h-0 w-full tv-widget-mount">
        <div
          ref={containerRef}
          className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
            widgetLoaded ? "opacity-100" : "opacity-0"
          }`}
          style={{
            userSelect: "auto",
            WebkitUserSelect: "auto",
            MozUserSelect: "auto",
            msUserSelect: "auto",
            pointerEvents: widgetLoaded ? "auto" : "none",
          }}
        />
        {!widgetLoaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-amber-400 font-medium">A carregar TradingView...</p>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Screener / Heatmap opcional (desktop) */}
    {showScreener && (
      <div className="mt-4">
        <ScannerScreener mode="desktop" />
      </div>
    )}
    </>
  )
}


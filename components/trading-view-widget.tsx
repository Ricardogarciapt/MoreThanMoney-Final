"use client"

import { Fragment, useEffect, useRef, useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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

// Ordem explícita dos scanners (mantém a ordem dos botões)
const scannerOrder = [
  "GoldenZone",
  "Momentum",
  "KillShot",
  "Supernova",
  "Smartmonics",
  "Winzone",
  "Nexus",
  "Sinergy",
] as const

type ScannerKey = (typeof scannerOrder)[number]

// Scanners disponíveis
const scannerStudies: Record<ScannerKey, string[]> = {
  GoldenZone: ["PUB;0b373fb0e6634a73bc8b838cf0690725"],
  Momentum: ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"],
  KillShot: ["PUB;c1f81145e78a49ce92bd1f81f9c103dd"],
  Supernova: ["PUB;c16bafd7d0874182a1415648ec3ed7b8"],
  Smartmonics: [
    "PUB;00759945b3154d1c87be09d49f94ddf8",
    "PUB;37de6f80c9af43b6b2717abe931c81b3",
    "PUB;ca737b14166046119172e367083dac5e",
  ],
  Winzone: [
    "PUB;6c003d30b2154ef3a31074d5c703954f",
    "PUB;e6adb5e5246c43f4a8dcffde5c98db4e",
    "PUB;162198dcae874d5da28f7b048feb76e7",
    "PUB;b6587ba7dc7b4489927cfd94d1fb8a9f",
    "PUB;0bf15eb0edba447f84e19fce69391ccb",
  ],
  Nexus: ["PUB;862506c546514212b9728a634dbc7152"],
  Sinergy: ["PUB;3b86bd1192124fd98583490bb7508041"],
}

const scannerLabels: Record<ScannerKey, string> = {
  GoldenZone: "Golden Zone",
  Momentum: "Momentum",
  KillShot: "Kill Shot",
  Supernova: "Supernova",
  Smartmonics: "Smartmonics",
  Winzone: "Winzone",
  Nexus: "Nexus",
  Sinergy: "Sinergy",
}

const scannerLogos: Record<ScannerKey, { icon: any; color: string; bgColor: string }> = {
  GoldenZone: { icon: Crown, color: "text-gold-300", bgColor: "bg-gradient-to-r from-gold-500 to-yellow-400" },
  Momentum: { icon: Waves, color: "text-blue-300", bgColor: "bg-gradient-to-r from-blue-600 to-cyan-500" },
  KillShot: { icon: Skull, color: "text-gray-300", bgColor: "bg-gradient-to-r from-gray-600 to-slate-500" },
  Supernova: { icon: Zap, color: "text-amber-300", bgColor: "bg-gradient-to-r from-amber-500 to-orange-500" },
  Smartmonics: { icon: TrendingUp, color: "text-emerald-300", bgColor: "bg-gradient-to-r from-emerald-600 to-lime-500" },
  Winzone: { icon: Shield, color: "text-blue-300", bgColor: "bg-gradient-to-r from-blue-700 to-sky-500" },
  Nexus: { icon: AlertCircle, color: "text-purple-300", bgColor: "bg-gradient-to-r from-purple-600 to-fuchsia-500" },
  Sinergy: { icon: Search, color: "text-cyan-300", bgColor: "bg-gradient-to-r from-cyan-600 to-teal-500" },
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

export default function TradingViewWidget({
  scannerType = "KillShot",
  showScreener = false,
}: {
  scannerType?: ScannerKey
  showScreener?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const [widgetLoaded, setWidgetLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isLoadingScanner = useRef(false)

  // Estados
  const [selectedStudies, setSelectedStudies] = useState<ScannerKey[]>(() => {
    const saved = localStorage.getItem("mtm_active_scanners")
    return saved ? JSON.parse(saved) : (["KillShot"] as ScannerKey[])
  })
  const [selectedSymbol, setSelectedSymbol] = useState("OANDA:XAUUSD")
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("mtm_chart_theme")
    return (saved as "light" | "dark") || "dark"
  })
  const [favoriteTimeframe, setFavoriteTimeframe] = useState(() => {
    const saved = localStorage.getItem("mtm_favorite_timeframe")
    return saved || "60"
  })

  // Dropdown de ativos
  const [showAssetDropdown, setShowAssetDropdown] = useState(false)
  const [assetSearchTerm, setAssetSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof assetCategories>("forex")

  // Configurações
  const [showSettings, setShowSettings] = useState(false)

  // Gráficos salvos
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>(() => {
    const saved = localStorage.getItem("mtm_saved_charts")
    return saved ? JSON.parse(saved) : []
  })
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

  // Persistir gráficos salvos
  useEffect(() => {
    localStorage.setItem("mtm_saved_charts", JSON.stringify(savedCharts))
  }, [savedCharts])

  const toggleStudy = (study: ScannerKey) => {
    setSelectedStudies((prev) => (prev.includes(study) ? prev.filter((s) => s !== study) : [...prev, study]))
  }

  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol)
    setShowAssetDropdown(false)
    setAssetSearchTerm("")
  }

  const handleSaveChart = async () => {
    if (!chartNameToSave.trim()) {
      alert("Por favor, insira um nome para o gráfico")
      return
    }

    if (savedCharts.length >= 20) {
      alert("Limite de 20 gráficos salvos atingido. Delete um gráfico antigo para salvar um novo.")
      return
    }

    try {
      // Salvar estado completo do gráfico
      const chartState = {
        symbol: selectedSymbol,
        studies: selectedStudies,
        theme: theme,
        timeframe: favoriteTimeframe,
        timestamp: Date.now(),
      }

      const newChart: SavedChart = {
        id: Date.now().toString(),
        name: chartNameToSave,
        symbol: selectedSymbol,
        data: chartState,
        timestamp: Date.now(),
      }

      setSavedCharts((prev) => [...prev, newChart])
      setChartNameToSave("")
      setShowSaveDialog(false)
      
      alert(`✅ Gráfico "${newChart.name}" salvo com sucesso!`)
    } catch (error) {
      console.error("Erro ao salvar gráfico:", error)
      alert("❌ Erro ao salvar gráfico. Tente novamente.")
    }
  }

  const handleLoadChart = async (chart: SavedChart) => {
    try {
      console.log("📂 Carregando gráfico:", chart.name)
      
      // Restaurar estado do gráfico
      if (chart.data) {
        setSelectedSymbol(chart.data.symbol || chart.symbol)
        setSelectedStudies(chart.data.studies || [])
        setTheme(chart.data.theme || "dark")
        setFavoriteTimeframe(chart.data.timeframe || "60")
      }

      setShowLoadDialog(false)
      alert(`✅ Gráfico "${chart.name}" carregado com sucesso!`)
    } catch (error) {
      console.error("Erro ao carregar gráfico:", error)
      alert("❌ Erro ao carregar gráfico. Tente novamente.")
    }
  }

  const handleDeleteChart = (chartId: string) => {
    if (confirm("Tem certeza que deseja deletar este gráfico?")) {
      setSavedCharts((prev) => prev.filter((c) => c.id !== chartId))
    }
  }

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        containerRef.current.requestFullscreen()
      }
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
        containerRef.current.innerHTML = '<div id="tradingview_widget" style="height: 100%; width: 100%;"></div>'
      }

      const studiesToApply = selectedStudies.flatMap((key) => scannerStudies[key] || [])

      const widgetOptions = {
        autosize: true,
        symbol: selectedSymbol,
        interval: favoriteTimeframe,
        timezone: "Etc/UTC",
        theme: theme,
        style: "1",
        locale: "br",
        toolbar_bg: theme === "dark" ? "#1E1E1E" : "#FFFFFF",
        enable_publishing: true,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        hide_legend: false,
        withdateranges: true,
        save_image: true,
        container_id: "tradingview_widget",
        studies: studiesToApply,
        disabled_features: [
          "header_widget_dom_node", 
          "header_widget", 
          "volume_force_overlay", 
          "scanner-access",
          "create_volume_indicator_by_default",
          "volumePaneSize",
          "tick_volume",
        ],
        enabled_features: [
          "study_on_study",
          "save_chart_properties_to_local_storage",
          "use_localstorage_for_settings",
          "header_screenshot",
          "show_chart_property_page",
          "property_pages",
          "context_menus",
          "control_bar",
          "timeframes_toolbar",
          "border_around_the_chart",
          "header_chart_type",
          "header_settings",
          "header_indicators",
          "header_compare",
          "header_undo_redo",
          "header_fullscreen_button",
          "header_saveload",
          "header_symbol_search",
          "header_interval_dialog_button",
          "header_resolutions",
        ],
        charts_storage_url: "https://saveload.tradingview.com",
        charts_storage_api_version: "1.1",
        client_id: "tradingview.com",
        user_id: "public_user_id",
        loading_screen: { backgroundColor: theme === "dark" ? "#1E1E1E" : "#FFFFFF", foregroundColor: "#f9b208" },
        overrides: {
          "mainSeriesProperties.showCountdown": true,
          "scalesProperties.showSeriesLastValue": true,
          // Esconder completamente legendas/valores dos estudos em todos os painéis
          "scalesProperties.showStudyLastValue": false,
          "paneProperties.legendProperties.showStudyTitles": false,
          "paneProperties.legendProperties.showStudyArguments": false,
          "paneProperties.legendProperties.showStudyValues": false,
          "volumePaneSize": "hide",
        },
      }

      widgetRef.current = new window.TradingView.widget(widgetOptions)

      // Tentar abrir o gráfico com uma vista inicial "resetada" para melhor visualização dos scanners
      if (widgetRef.current && typeof widgetRef.current.onChartReady === "function") {
        widgetRef.current.onChartReady(() => {
          try {
            const chart = widgetRef.current.chart && widgetRef.current.chart()
            if (chart && typeof chart.resetData === "function") {
              chart.resetData()
            }
          } catch (e) {
            console.warn("Não foi possível aplicar resetData no carregamento inicial do gráfico:", e)
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
        } catch (e) {
          console.error("Erro ao remover widget:", e)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (widgetRef.current?.remove) {
      try {
        widgetRef.current.remove()
      } catch (e) {}
    }
    loadTradingViewWidget()
  }, [selectedStudies, selectedSymbol, theme, favoriteTimeframe])

  // Filtrar ativos por categoria e busca
  const filteredAssets = assetCategories[selectedCategory].filter((asset) =>
    asset.label.toLowerCase().includes(assetSearchTerm.toLowerCase()) ||
    asset.value.toLowerCase().includes(assetSearchTerm.toLowerCase())
  )

  const popularAssets = filteredAssets.filter((a) => a.popular)
  const otherAssets = filteredAssets.filter((a) => !a.popular)

  return (
    <>
    <div className="w-full relative bg-gray-900 border border-gold-500/30 rounded-lg overflow-hidden" style={{ aspectRatio: "16/9" }}>
      {error && (
        <Alert className="absolute top-2 left-2 right-2 z-20 bg-red-500/20 border-red-500">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Barra de controle superior */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gray-800/95 backdrop-blur-sm py-2 px-3 border-b border-gold-500/30">
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

          {/* Botões de ação */}
          <div className="flex items-center gap-2">
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
                    <RadioGroup value={theme} onValueChange={(v) => setTheme(v as "light" | "dark")}>
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
                    <Select value={favoriteTimeframe} onValueChange={setFavoriteTimeframe}>
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
                  {savedCharts.length === 0 ? (
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
          </div>
        </div>

        {/* Scanners */}
        <div className="flex flex-nowrap gap-2 overflow-x-auto mt-2 pb-2 scrollbar-thin scrollbar-thumb-gold-500/50">
          {scannerOrder.map((key) => {
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

      {/* Widget container */}
      <div className="w-full h-full pt-28" style={{ visibility: widgetLoaded ? "visible" : "hidden" }}>
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {!widgetLoaded && !error && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/70 z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-amber-400 font-medium">A carregar TradingView...</p>
          </div>
        </div>
      )}
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


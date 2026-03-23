"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import ScannerScreener from "@/components/scanner-screener"
import { 
  Maximize2, 
  Minimize2, 
  RotateCw,
  TrendingUp,
  Zap,
  Crown,
  Waves,
  Skull,
  Shield,
  Sun,
  Moon,
  Star,
  Globe,
  Settings,
  BarChart3,
  ZoomIn,
  ZoomOut,
  Minimize,
  Clock,
  Target,
  ChartColumn,
  Brain,
  RefreshCw as RefreshIcon,
  AlertCircle,
} from "lucide-react"

// Checklist Types
interface ChecklistItem {
  id: string
  label: string
  checked: boolean
}

interface ChecklistSection {
  title: string
  icon: any
  color: string
  bgColor: string
  borderColor: string
  items: ChecklistItem[]
}

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

// Scanners MTM
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
  Smartmonics: "React",
  Winzone: "Winzone",
  Nexus: "Straight",
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
  Sinergy: { icon: Star, color: "text-cyan-300", bgColor: "bg-gradient-to-r from-cyan-600 to-teal-500" },
}

declare global {
  interface Window {
    TradingView?: any
  }
}

// Categorias de ativos
const assetCategories = {
  forex: {
    label: "Forex",
    icon: Globe,
    symbols: [
      { value: "OANDA:XAUUSD", label: "Ouro (XAU/USD)" },
      { value: "OANDA:EURUSD", label: "EUR/USD" },
      { value: "OANDA:GBPUSD", label: "GBP/USD" },
      { value: "OANDA:USDJPY", label: "USD/JPY" },
      { value: "OANDA:AUDUSD", label: "AUD/USD" },
      { value: "OANDA:USDCAD", label: "USD/CAD" },
      { value: "OANDA:NZDUSD", label: "NZD/USD" },
      { value: "OANDA:USDCHF", label: "USD/CHF" },
    ],
    screener: "stocks"
  },
  crypto: {
    label: "Criptomoedas",
    icon: TrendingUp,
    symbols: [
      { value: "BINANCE:BTCUSDT", label: "Bitcoin" },
      { value: "BINANCE:ETHUSDT", label: "Ethereum" },
      { value: "BINANCE:BNBUSDT", label: "BNB" },
      { value: "BINANCE:ADAUSDT", label: "Cardano" },
      { value: "BINANCE:SOLUSDT", label: "Solana" },
      { value: "BINANCE:XRPUSDT", label: "XRP" },
      { value: "BINANCE:DOTUSDT", label: "Polkadot" },
      { value: "BINANCE:DOGEUSDT", label: "Dogecoin" },
      { value: "BINANCE:MATICUSDT", label: "Polygon" },
      { value: "BINANCE:LINKUSDT", label: "Chainlink" },
    ],
    screener: "crypto"
  },
  indices: {
    label: "ETFs/Índices",
    icon: BarChart3,
    symbols: [
      { value: "NASDAQ:AAPL", label: "Apple" },
      { value: "NASDAQ:MSFT", label: "Microsoft" },
      { value: "NASDAQ:GOOGL", label: "Google" },
      { value: "NASDAQ:AMZN", label: "Amazon" },
      { value: "NASDAQ:TSLA", label: "Tesla" },
      { value: "NASDAQ:NVDA", label: "NVIDIA" },
      { value: "NASDAQ:META", label: "Meta" },
      { value: "NYSE:SPY", label: "S&P 500 ETF" },
      { value: "NASDAQ:QQQ", label: "NASDAQ ETF" },
      { value: "NYSE:DIA", label: "Dow Jones ETF" },
    ],
    screener: "stocks"
  },
  commodities: {
    label: "Commodities",
    icon: Zap,
    symbols: [
      { value: "OANDA:XAUUSD", label: "Ouro" },
      { value: "OANDA:XAGUSD", label: "Prata" },
      { value: "OANDA:XPTUSD", label: "Platina" },
      { value: "OANDA:XPDUSD", label: "Paládio" },
      { value: "OANDA:USOIL", label: "Petróleo WTI" },
      { value: "OANDA:UKOIL", label: "Petróleo Brent" },
      { value: "OANDA:NATGAS", label: "Gás Natural" },
      { value: "OANDA:COPPER", label: "Cobre" },
    ],
    screener: "stocks"
  }
}

export default function ScannerMobile() {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const screenerRef = useRef<HTMLDivElement>(null)
  const [widgetLoaded, setWidgetLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState("OANDA:XAUUSD")
  const [selectedInterval, setSelectedInterval] = useState("15")
  const [selectedStudies, setSelectedStudies] = useState<ScannerKey[]>(() => {
    if (typeof window === 'undefined') return ["KillShot"]
    try {
      const saved = localStorage.getItem("mtm_mobile_active_scanners")
      return saved ? JSON.parse(saved) : (["KillShot"] as ScannerKey[])
    } catch {
      return ["KillShot"]
    }
  })
  
  // Checklist Trading
  const [checklistSections, setChecklistSections] = useState<ChecklistSection[]>([
    {
      title: "Rotina Pre-Trading",
      icon: Clock,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/30",
      items: [
        { id: "1", label: "Verificar notícias económicas do dia", checked: false },
        { id: "2", label: "Analisar calendário económico", checked: false },
        { id: "3", label: "Verificar correlações entre mercados", checked: false },
        { id: "4", label: "Revisar posições abertas", checked: false }
      ]
    },
    {
      title: "Estratégia de Saída",
      icon: Target,
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      items: [
        { id: "5", label: "Definir stop loss para cada posição", checked: false },
        { id: "6", label: "Estabelecer take profit targets", checked: false },
        { id: "7", label: "Planificar saída parcial", checked: false }
      ]
    },
    {
      title: "Gestão de Risco",
      icon: Shield,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      items: [
        { id: "8", label: "Calcular risco por trade (1-2% do capital)", checked: false },
        { id: "9", label: "Verificar exposição total do portfólio", checked: false },
        { id: "10", label: "Confirmar posição sizing correto", checked: false }
      ]
    },
    {
      title: "Estratégia de Entrada",
      icon: TrendingUp,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/30",
      items: [
        { id: "11", label: "Identificar setups de entrada válidos", checked: false },
        { id: "12", label: "Confirmar confirmação de sinal", checked: false },
        { id: "13", label: "Verificar alinhamento com tendência", checked: false }
      ]
    },
    {
      title: "Gestão da Trade",
      icon: ChartColumn,
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30",
      items: [
        { id: "14", label: "Monitorizar posições abertas", checked: false },
        { id: "15", label: "Ajustar stops se necessário", checked: false },
        { id: "16", label: "Registar resultados e aprendizagens", checked: false }
      ]
    }
  ])
  
  const handleCheckboxChange = (sectionIndex: number, itemIndex: number) => {
    setChecklistSections(prev => {
      const newSections = [...prev]
      newSections[sectionIndex].items[itemIndex].checked = !newSections[sectionIndex].items[itemIndex].checked
      return newSections
    })
  }
  
  const handleResetChecklist = () => {
    setChecklistSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item => ({ ...item, checked: false }))
    })))
  }
  
  const totalItems = checklistSections.reduce((sum, section) => sum + section.items.length, 0)
  const completedItems = checklistSections.reduce((sum, section) => 
    sum + section.items.filter(item => item.checked).length, 0
  )
  const progressPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
  
  // Novos estados para configurações
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof assetCategories>("forex")
  const [favoriteTimeframes, setFavoriteTimeframes] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ["60", "240", "D"]
    try {
      const saved = localStorage.getItem("mtm_mobile_favorite_timeframes")
      return saved ? JSON.parse(saved) : ["60", "240", "D"]
    } catch {
      return ["60", "240", "D"]
    }
  })
  const [favoriteClass, setFavoriteClass] = useState<string>(() => {
    if (typeof window === 'undefined') return "forex"
    try {
      const saved = localStorage.getItem("mtm_mobile_favorite_class")
      return saved || "forex"
    } catch {
      return "forex"
    }
  })
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === 'undefined') return "dark"
    try {
      const saved = localStorage.getItem("mtm_mobile_theme")
      return (saved as "dark" | "light") || "dark"
    } catch {
      return "dark"
    }
  })
  const [showSettings, setShowSettings] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)")
    const applyViewport = () => setIsDesktop(mediaQuery.matches)

    applyViewport()
    mediaQuery.addEventListener("change", applyViewport)

    return () => {
      mediaQuery.removeEventListener("change", applyViewport)
    }
  }, [])

  // Screeners simplificados - Crypto Bubbles para crypto, Stock Heatmap para o resto
  const getScreenersForCategory = (category: keyof typeof assetCategories) => {
    const screenersMap = {
      forex: [
        { value: "stocks_heatmap", label: "Stocks Heatmap", screener: "stocks_heatmap" }
      ],
      crypto: [
        { value: "crypto_bubbles", label: "Crypto Bubbles", screener: "crypto_bubbles" }
      ],
      indices: [
        { value: "stocks_heatmap", label: "Stocks Heatmap", screener: "stocks_heatmap" }
      ],
      commodities: [
        { value: "stocks_heatmap", label: "Stocks Heatmap", screener: "stocks_heatmap" }
      ]
    }
    
    return screenersMap[category] || screenersMap[category]
  }

  // Persistir configurações
  useEffect(() => {
    localStorage.setItem("mtm_mobile_active_scanners", JSON.stringify(selectedStudies))
  }, [selectedStudies])

  useEffect(() => {
    localStorage.setItem("mtm_mobile_favorite_timeframes", JSON.stringify(favoriteTimeframes))
  }, [favoriteTimeframes])

  useEffect(() => {
    localStorage.setItem("mtm_mobile_favorite_class", favoriteClass)
  }, [favoriteClass])

  useEffect(() => {
    localStorage.setItem("mtm_mobile_theme", theme)
  }, [theme])

  const toggleStudy = (study: ScannerKey) => {
    setSelectedStudies((prev) => 
      prev.includes(study) ? prev.filter((s) => s !== study) : [...prev, study]
    )
  }

  const toggleFavoriteTimeframe = (timeframe: string) => {
    setFavoriteTimeframes((prev) => 
      prev.includes(timeframe) 
        ? prev.filter((t) => t !== timeframe) 
        : [...prev, timeframe]
    )
  }

  const toggleTheme = () => {
    setTheme((prev) => prev === "dark" ? "light" : "dark")
  }

  const selectCategory = (category: keyof typeof assetCategories) => {
    setSelectedCategory(category)
    setFavoriteClass(category)
    // Selecionar primeiro símbolo da categoria
    const categorySymbols = assetCategories[category].symbols
    if (categorySymbols.length > 0) {
      setSelectedSymbol(categorySymbols[0].value)
    }
  }

  // Função para gerar URL do screener baseado na categoria
  const getScreenerUrl = (screener: string, category: keyof typeof assetCategories) => {
    const screenerUrls = {
      crypto_bubbles: "https://cryptobubbles.net",
      stocks_heatmap: "https://www.tradingview.com/embed-widget/stock-heatmap/?locale=br&blockSize=market_cap_basic&blockColor=change&dataSource=SPX500&grouping=sector&marketColor=%230db1ac&showToolbar=true&size=large&symbols=%5B%5D&colorTheme=dark&hasTopBar=true&isDataSetEnabled=false&isZoomEnabled=true&hasSymbolTooltip=true&isMonoSize=false&width=100%25&height=400"
    }

    return screenerUrls[screener as keyof typeof screenerUrls] || screenerUrls.stocks_heatmap
  }

  const symbols = [
    { value: "OANDA:XAUUSD", label: "Ouro (XAU/USD)" },
    { value: "OANDA:EURUSD", label: "EUR/USD" },
    { value: "OANDA:GBPUSD", label: "GBP/USD" },
    { value: "OANDA:USDJPY", label: "USD/JPY" },
    { value: "BINANCE:BTCUSDT", label: "Bitcoin" },
    { value: "BINANCE:ETHUSDT", label: "Ethereum" },
    { value: "OANDA:SPX500USD", label: "S&P 500" },
    { value: "OANDA:NAS100USD", label: "NASDAQ 100" },
  ]

  const intervals = [
    { value: "1", label: "1min" },
    { value: "5", label: "5min" },
    { value: "15", label: "15min" },
    { value: "60", label: "1h" },
    { value: "240", label: "4h" },
    { value: "D", label: "1D" },
  ]

  useEffect(() => {
    loadTradingViewScript()
    
    return () => {
      // Limpeza segura do widget
      try {
        if (widgetRef.current) {
          // Verificar se o método remove existe e se o widget ainda está no DOM
          if (typeof widgetRef.current.remove === 'function') {
            // Verificar se o widget tem um elemento pai antes de remover
            const widgetElement = containerRef.current?.querySelector('iframe')
            if (widgetElement && widgetElement.parentNode) {
              widgetRef.current.remove()
            }
          }
          widgetRef.current = null
        }
        
        // Limpar o container manualmente se ainda houver conteúdo
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }
      } catch (e) {
        console.warn("Aviso ao limpar widget:", e)
        // Silenciar o erro para não quebrar a aplicação
      }
    }
  }, [])

  const widgetHeight = isFullscreen ? "100vh" : isDesktop ? "calc(100vh - 360px)" : "calc(100vh - 300px)"

  useEffect(() => {
    if (window.TradingView) {
      loadWidget()
    }
  }, [selectedSymbol, selectedInterval, selectedStudies, theme])

  const loadTradingViewScript = () => {
    if (document.getElementById("tradingview-mobile-script")) {
      if (window.TradingView) {
        loadWidget()
      }
      return
    }

    const script = document.createElement("script")
    script.id = "tradingview-mobile-script"
    script.src = "https://s3.tradingview.com/tv.js"
    script.async = true
    script.onload = () => {
      if (window.TradingView) {
        loadWidget()
      }
    }
    script.onerror = () => setError("Falha ao carregar TradingView")
    document.head.appendChild(script)
  }

  const loadWidget = () => {
    if (!window.TradingView || !containerRef.current) return

    try {
      // Remover widget anterior se existir
      if (widgetRef.current) {
        try {
          if (typeof widgetRef.current.remove === 'function') {
            widgetRef.current.remove()
          }
        } catch (e) {
          console.warn("Aviso ao remover widget anterior:", e)
        }
        widgetRef.current = null
      }

      // Limpar container e criar novo elemento
      if (containerRef.current) {
        containerRef.current.innerHTML = '<div id="tradingview_mobile_widget" style="height: 100%; width: 100%;"></div>'
      }

      // Usar a abordagem simples que funcionava - todos os estudos no array studies
      const studiesToApply = selectedStudies.flatMap((key) => scannerStudies[key] || [])

      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: selectedSymbol,
        interval: selectedInterval,
        timezone: "Etc/UTC",
        theme: theme,
        style: theme === "dark" ? "1" : "9",
        locale: "br",
        toolbar_bg: "#1E1E1E",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        hide_top_toolbar: false,
        container_id: "tradingview_mobile_widget",
        studies: studiesToApply,
        disabled_features: [
          "header_widget_dom_node",
          "header_widget",
          "volume_force_overlay",
          "create_volume_indicator_by_default",
          "header_compare",
          "header_chart_type",
          "header_undo_redo",
          "border_around_the_chart",
        ],
        enabled_features: [
          "study_on_study",
          "use_localstorage_for_settings",
          "header_settings",
          "header_indicators",
          "header_symbol_search",
          "header_interval_dialog_button",
          "header_screenshot",
          "header_saveload_image",
          "header_save_chart",
          "header_fullscreen_button",
          "header_chart_type",
          "timeframes_toolbar",
          "left_toolbar",
          "drawing_toolbar",
          "control_bar",
        ],
        loading_screen: { backgroundColor: "#1E1E1E", foregroundColor: "#f9b208" },
        overrides: {
          "mainSeriesProperties.showCountdown": true,
          "scalesProperties.showSeriesLastValue": true,
          // Esconder completamente legendas/valores dos estudos em todos os painéis
          "scalesProperties.showStudyLastValue": false,
          "paneProperties.legendProperties.showStudyTitles": false,
          "paneProperties.legendProperties.showStudyArguments": false,
          "paneProperties.legendProperties.showStudyValues": false,
          "volumePaneSize": "hide",
          // === PRICE SCALE ===
          "scalesProperties.autoScale": true,               // Auto (fits data to screen)
          "scalesProperties.lockPriceToBarRatio": false,    // Lock price to bar ratio
          "scalesProperties.scaleSeriesOnly": true,         // Scale price chart only
          "scalesProperties.invertScale": false,            // Invert scale
        },
      })

      // Configurar AUTO e apenas escala de preço após o chart estar pronto
      if (widgetRef.current && typeof widgetRef.current.onChartReady === "function") {
        widgetRef.current.onChartReady(() => {
          try {
            const chart = widgetRef.current.chart && widgetRef.current.chart()
            if (chart) {
              // Configurar todos os estudos para usar AUTO e apenas escala de preço
              setTimeout(() => {
                try {
                  const allStudies = chart.getAllStudies?.() || []
                  console.log(`📊 [TRADINGVIEW MOBILE] Configurando ${allStudies.length} estudos com AUTO e escala de preço`)
                  
                  allStudies.forEach((study: any) => {
                    try {
                      // Habilitar AUTO (autoScale) - adapta escala automaticamente
                      if (typeof study.setAutoScale === 'function') {
                        study.setAutoScale(true)
                      }
                      // Configurar para usar apenas escala de preços (não criar escala separada)
                      if (typeof study.setPriceScale === 'function') {
                        study.setPriceScale(true)
                      }
                      // Alternativa via setEntityInfo se disponível
                      if (typeof study.setEntityInfo === 'function') {
                        study.setEntityInfo({ 
                          priceScaleId: 'right',
                          autoScale: true 
                        })
                      }
                    } catch (e) {
                      // Ignorar erros individuais
                    }
                  })
                } catch (e) {
                  console.warn("Não foi possível configurar AUTO e escala de preço:", e)
                }
              }, 1500) // Delay para garantir que estudos estão carregados
            }
          } catch (e) {
            console.warn("Não foi possível configurar estudos:", e)
          }
        })
      }

      setWidgetLoaded(true)
      setError(null)
    } catch (err: any) {
      console.error("Erro ao carregar widget:", err)
      setError("Erro ao carregar widget")
    }
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current?.parentElement) return

    try {
      if (!document.fullscreenElement) {
        // Tentar diferentes métodos de fullscreen
        const element = containerRef.current.parentElement
        
        if (element.requestFullscreen) {
          await element.requestFullscreen()
        } else if ((element as any).webkitRequestFullscreen) {
          // Safari
          await (element as any).webkitRequestFullscreen()
        } else if ((element as any).mozRequestFullScreen) {
          // Firefox
          await (element as any).mozRequestFullScreen()
        } else if ((element as any).msRequestFullscreen) {
          // IE/Edge
          await (element as any).msRequestFullscreen()
        } else {
          alert("Fullscreen não é suportado neste browser")
          return
        }

        // Tentar rotação horizontal em fullscreen
        if (screen.orientation) {
          try {
            // @ts-ignore - lock() não está disponível em todos os browsers
            await screen.orientation.lock?.('landscape')
          } catch (e) {
            console.log("Não foi possível travar a orientação")
          }
        }
        setIsFullscreen(true)
      } else {
        // Sair do fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          // Safari
          await (document as any).webkitExitFullscreen()
        } else if ((document as any).mozCancelFullScreen) {
          // Firefox
          await (document as any).mozCancelFullScreen()
        } else if ((document as any).msExitFullscreen) {
          // IE/Edge
          await (document as any).msExitFullscreen()
        }

        if (screen.orientation) {
          try {
            // @ts-ignore - unlock() não está disponível em todos os browsers
            await screen.orientation.unlock?.()
          } catch (e) {
            console.log("Não foi possível destravar a orientação")
          }
        }
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error("Erro ao alternar fullscreen:", err)
      alert("Erro ao alternar fullscreen. Tenta novamente.")
    }
  }

  // Touch controls para zoom e pan
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Double finger touch - zoom
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )
      
      // Store initial distance for zoom calculation
      ;(e.target as any).initialDistance = distance
      e.preventDefault()
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Zoom gesture
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )
      
      const initialDistance = (e.target as any).initialDistance
      if (initialDistance) {
        const scale = distance / initialDistance
        // Trigger zoom in TradingView widget
        if (widgetRef.current && widgetRef.current.chart) {
          if (scale > 1.1) {
            widgetRef.current.chart().zoomIn()
          } else if (scale < 0.9) {
            widgetRef.current.chart().zoomOut()
          }
        }
      }
      e.preventDefault()
    }
  }

  const handleDoubleClick = () => {
    // Double tap - reset zoom
    if (widgetRef.current && widgetRef.current.chart) {
      widgetRef.current.chart().resetData()
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      )
      setIsFullscreen(isFullscreen)
    }

    // Adicionar listeners para todos os browsers
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [])

  return (
    <div className={`bg-black ${isDesktop ? "min-h-[calc(100vh-8rem)]" : "min-h-screen"}`}>
      {/* Controls */}
      <div className={`bg-gray-900 border-b border-[#D2A63C]/30 space-y-3 ${isDesktop ? "p-4" : "p-3"}`}>
        {/* Top Row - Category Selection */}
        <div className={`flex gap-2 pb-1 ${isDesktop ? "flex-wrap overflow-visible" : "overflow-x-auto"}`}>
          {Object.entries(assetCategories).map(([key, category]) => {
            const Icon = category.icon
            const isSelected = selectedCategory === key
            
            return (
              <button
                key={key}
                onClick={() => selectCategory(key as keyof typeof assetCategories)}
                className={`flex items-center gap-2 rounded-lg whitespace-nowrap transition-all ${
                  isSelected 
                    ? "bg-[#D2A63C] text-black font-semibold" 
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                } ${isDesktop ? "px-4 py-2.5 text-sm" : "px-3 py-2 text-xs"}`}
              >
                <Icon className={isDesktop ? "w-4 h-4" : "w-4 h-4"} />
                <span>{category.label}</span>
              </button>
            )
          })}
        </div>

        {/* Second Row - Symbol and Timeframe */}
        <div className={`grid gap-2 ${isDesktop ? "grid-cols-3" : "grid-cols-2"}`}>
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className={`bg-gray-800 border-gray-700 text-white ${isDesktop ? "text-sm h-10" : "text-xs"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              {assetCategories[selectedCategory].symbols.map((s) => (
                <SelectItem key={s.value} value={s.value} className={isDesktop ? "text-sm" : "text-xs"}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedInterval} onValueChange={setSelectedInterval}>
            <SelectTrigger className={`bg-gray-800 border-gray-700 text-white ${isDesktop ? "text-sm h-10" : "text-xs"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              {intervals.map((i) => (
                <SelectItem key={i.value} value={i.value} className={isDesktop ? "text-sm" : "text-xs"}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isDesktop && (
            <div className="rounded-md border border-gray-700 bg-gray-800 text-gray-300 text-xs px-3 flex items-center">
              Layout: Desktop
            </div>
          )}
        </div>

        {/* Third Row - MTM Scanners/Studies */}
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gold-500/50">
          {scannerOrder.map((key) => {
            const logo = scannerLogos[key]
            const Icon = logo.icon
            const isChecked = selectedStudies.includes(key)

            return (
              <button
                key={key}
                onClick={() => toggleStudy(key)}
                className={`h-8 transition-all duration-300 ${
                  isChecked
                    ? `${logo.bgColor} text-white shadow-lg scale-105`
                    : "bg-gray-700/80 text-gray-300"
                } border border-gray-600/50 rounded-md flex items-center gap-1.5 whitespace-nowrap ${
                  isDesktop ? "px-3 py-1.5 text-xs h-9" : "px-2.5 py-1 text-[10px] h-8"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isChecked ? "bg-white" : "bg-gray-400"}`} />
                <Icon className={`w-3 h-3 ${isChecked ? "text-white" : logo.color}`} />
                <span>{scannerLabels[key]}</span>
              </button>
            )
          })}
        </div>

        {/* Fourth Row - Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={toggleFullscreen}
            size="sm"
            className={`flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525] ${isDesktop ? "h-9 text-sm" : "h-8 text-xs"}`}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3 h-3 mr-1.5" />
                Sair Fullscreen
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 mr-1.5" />
                Fullscreen
              </>
            )}
          </Button>
          
          <Button
            onClick={() => setShowSettings(!showSettings)}
            size="sm"
            variant="outline"
            className={`bg-gray-800 text-white border-gray-700 hover:bg-gray-700 ${isDesktop ? "h-9 px-3" : "h-8 px-2"}`}
          >
            <Settings className="w-3 h-3" />
          </Button>
          
          <Button
            onClick={toggleTheme}
            size="sm"
            variant="outline"
            className={`bg-gray-800 text-white border-gray-700 hover:bg-gray-700 ${isDesktop ? "h-9 px-3" : "h-8 px-2"}`}
          >
            {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          </Button>
          
          <Button
            onClick={loadWidget}
            size="sm"
            variant="outline"
            className={`bg-gray-800 text-white border-gray-700 hover:bg-gray-700 ${isDesktop ? "h-9 px-3" : "h-8 px-2"}`}
          >
            <RotateCw className="w-3 h-3" />
          </Button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className={`bg-gray-800 rounded-lg space-y-3 ${isDesktop ? "p-4" : "p-3"}`}>
            <h3 className="text-white text-sm font-semibold">Configurações</h3>
            
            {/* Favorite Timeframes */}
            <div>
              <label className="text-xs text-gray-300 mb-2 block">Timeframes Favoritos:</label>
              <div className="flex flex-wrap gap-1">
                {intervals.map((interval) => (
                  <button
                    key={interval.value}
                    onClick={() => toggleFavoriteTimeframe(interval.value)}
                    className={`px-2 py-1 rounded text-xs transition-all ${
                      favoriteTimeframes.includes(interval.value)
                        ? "bg-[#D2A63C] text-black font-semibold"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {interval.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Widget Container */}
      <div 
        className="relative bg-black"
        style={{ 
          height: widgetHeight,
          width: '100%'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onDoubleClick={handleDoubleClick}
      >
        <div ref={containerRef} className="w-full h-full" />

        {!widgetLoaded && !error && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/90">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#D2A63C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#D2A63C] font-medium">A carregar gráfico...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/90">
            <div className="text-center p-4">
              <p className="text-red-400 mb-4">{error}</p>
              <Button onClick={loadWidget} className="bg-[#D2A63C] text-black">
                Tentar Novamente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Screener / Heatmap Section (reutilizável) */}
      {!isFullscreen && (
        <div className="p-4 bg-gray-900 border-t border-[#D2A63C]/30">
          <ScannerScreener mode={isDesktop ? "desktop" : "mobile"} />
        </div>
      )}

      {/* Checklist de Trading */}
      {!isFullscreen && (
        <div className="p-4 bg-gray-900">
          <Card className="bg-black/50 border-amber-500/30">
            <CardContent className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-amber-400" />
                  <h3 className="text-white font-bold text-lg">Checklist de Trading</h3>
                </div>
                <Button
                  onClick={handleResetChecklist}
                  size="sm"
                  variant="outline"
                  className="border-amber-500 text-amber-400 hover:bg-amber-500/10 bg-black/50 h-8"
                >
                  <RefreshIcon className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                    {completedItems}/{totalItems} Completo
                  </Badge>
                  <span className="text-xs text-amber-400 font-semibold">{progressPercentage}%</span>
                </div>
                <div className="w-full bg-black/50 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {/* Checklist Sections */}
              <div className="space-y-3">
                {checklistSections.map((section, sectionIndex) => {
                  const SectionIcon = section.icon
                  const sectionProgress = (section.items.filter(item => item.checked).length / section.items.length) * 100
                  
                  return (
                    <Card key={sectionIndex} className={`${section.bgColor} ${section.borderColor} border`}>
                      <CardContent className="p-3">
                        {/* Section Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <SectionIcon className={`h-4 w-4 ${section.color}`} />
                            <h4 className={`text-sm font-semibold ${section.color}`}>
                              {section.title}
                            </h4>
                          </div>
                          <Badge className="bg-white/10 text-white border-white/20 text-xs">
                            {section.items.filter(item => item.checked).length}/{section.items.length}
                          </Badge>
                        </div>

                        {/* Section Progress */}
                        <div className="w-full bg-[#1a1a1a] rounded-full h-1 mb-3">
                          <div
                            className={`h-1 rounded-full transition-all duration-500 ${
                              sectionProgress === 0 ? 'bg-red-500' : 
                              sectionProgress === 100 ? 'bg-green-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${sectionProgress}%` }}
                          />
                        </div>

                        {/* Items */}
                        <div className="space-y-2">
                          {section.items.map((item, itemIndex) => (
                            <div key={item.id} className="flex items-start gap-2">
                              <Checkbox
                                id={`mobile-${item.id}`}
                                checked={item.checked}
                                onCheckedChange={() => handleCheckboxChange(sectionIndex, itemIndex)}
                                className="mt-0.5"
                              />
                              <label
                                htmlFor={`mobile-${item.id}`}
                                className="text-xs leading-relaxed cursor-pointer text-gray-200 hover:text-white flex-1"
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


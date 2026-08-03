"use client"

import { useState, useEffect, useRef, useCallback, useImperativeHandle, type RefObject } from "react"
import { supabase } from "@/lib/supabase"
import ChartSocialShareDialog from "@/components/chart-social-share-dialog"
import type { TradingViewWidgetRef } from "@/components/trading-view-widget"
import {
  buildTradingViewScannerOptions,
  computeScannerAccessChartHeight,
} from "@/lib/trading-view-scanner-config"
import {
  captureChartScreenshot,
  copyChartImageToClipboard,
  resolveChartShareUrl,
  resolveNativeChartShareUrl,
} from "@/lib/chart-share-capture"
import type { ChartSocialSharePrefetch } from "@/components/chart-social-share-dialog"
import {
  copyChartShareLink,
  focusChartStageWrapper,
  focusTradingViewIframe,
  handleTradingViewKeyboardShortcut,
} from "@/lib/trading-view-shortcuts"
import { useToast } from "@/hooks/use-toast"
import { useT } from "@/components/i18n-provider"
import { isNativeApp } from "@/hooks/use-capacitor"
import { TV_STUDY_LEGEND_OVERRIDES } from "@/lib/trading-view-scanner-config"
import { subscribeMediaQueryChange } from "@/lib/browser-compat"
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
  Bell,
  ZoomIn,
  ZoomOut,
  Minimize,
  Clock,
  Target,
  ChartColumn,
  Brain,
  RefreshCw as RefreshIcon,
  AlertCircle,
  MessageCircle,
  Loader2,
  Share2,
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
  "AurumFlow",
  "Winzone",
  "Sinergy",
  "Goldkiller",
  "MTMScanner",
  "Sensei",
] as const

type ScannerKey = (typeof scannerOrder)[number]

// Scanners MTM
const scannerStudies: Record<ScannerKey, string[]> = {
  GoldenZone: ["PUB;0b373fb0e6634a73bc8b838cf0690725"],
  Momentum: ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"],
  AurumFlow: ["PUB;039b58f362ea4bbeb81867687c2fffd5"],
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
  Sensei: ["PUB;0aba45d8eeed42368922a344f547eeb6"],
}

const scannerLabels: Record<ScannerKey, string> = {
  GoldenZone: "Golden Zone",
  Momentum: "Momentum",
  AurumFlow: "Aurum Flow",
  Winzone: "Sniper Pro",
  Sinergy: "Quantum",
  Goldkiller: "GoldKiller",
  MTMScanner: "MTM",
  Sensei: "Sensei",
}

const scannerLogos: Record<ScannerKey, { icon: any; color: string; bgColor: string }> = {
  GoldenZone: { icon: Crown, color: "text-gold-300", bgColor: "bg-gradient-to-r from-gold-500 to-yellow-400" },
  Momentum: { icon: Waves, color: "text-blue-300", bgColor: "bg-gradient-to-r from-blue-600 to-cyan-500" },
  AurumFlow: { icon: Zap, color: "text-amber-300", bgColor: "bg-gradient-to-r from-amber-500 to-yellow-500" },
  Winzone: { icon: Shield, color: "text-blue-300", bgColor: "bg-gradient-to-r from-blue-700 to-sky-500" },
  Sinergy: { icon: Star, color: "text-cyan-300", bgColor: "bg-gradient-to-r from-cyan-600 to-teal-500" },
  Goldkiller: { icon: Target, color: "text-yellow-300", bgColor: "bg-gradient-to-r from-yellow-600 to-amber-500" },
  MTMScanner: { icon: Brain, color: "text-violet-300", bgColor: "bg-gradient-to-r from-violet-600 to-purple-500" },
  Sensei: { icon: TrendingUp, color: "text-rose-300", bgColor: "bg-gradient-to-r from-rose-600 to-pink-500" },
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

export type ScannerMobileIntegration = "standalone" | "scanner-access"

export type ScannerMobileProps = {
  /** standalone = app-mobile; scanner-access = página desktop scanner-access */
  integration?: ScannerMobileIntegration
  showScreener?: boolean
  widgetRef?: RefObject<TradingViewWidgetRef | null>
  /** Controlo externo (ex.: clique num alerta → símbolo/timeframe/scanner do sinal). */
  externalSymbol?: string
  externalInterval?: string
  externalStudies?: ScannerKey[]
}

export default function ScannerMobile({
  integration = "standalone",
  showScreener = true,
  widgetRef: externalWidgetRef,
  externalSymbol,
  externalInterval,
  externalStudies,
}: ScannerMobileProps = {}) {
  const t = useT()
  const isScannerAccess = integration === "scanner-access"
  const tvContainerId = isScannerAccess ? "tradingview_scanner_access_widget" : "tradingview_mobile_widget"
  const categoryLabelKeys: Record<keyof typeof assetCategories, string> = {
    forex: "scanner.catForex",
    crypto: "scanner.catCrypto",
    indices: "scanner.catIndices",
    commodities: "scanner.catCommodities",
  }
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const scannerAccessWrapRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const screenerRef = useRef<HTMLDivElement>(null)
  const [widgetLoaded, setWidgetLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState(externalSymbol || "OANDA:XAUUSD")
  const [selectedInterval, setSelectedInterval] = useState(externalInterval || "15")
  const [selectedStudies, setSelectedStudies] = useState<ScannerKey[]>(() => {
    if (externalStudies?.length) return externalStudies
    if (typeof window === 'undefined') return ["AurumFlow"]
    try {
      const saved = localStorage.getItem("mtm_mobile_active_scanners")
      return saved ? JSON.parse(saved) : (["AurumFlow"] as ScannerKey[])
    } catch {
      return ["AurumFlow"]
    }
  })

  // Controlo externo (ex.: clique num alerta → símbolo/timeframe/scanner do sinal)
  useEffect(() => { if (externalSymbol) setSelectedSymbol(externalSymbol) }, [externalSymbol])
  useEffect(() => { if (externalInterval) setSelectedInterval(externalInterval) }, [externalInterval])
  useEffect(() => { if (externalStudies?.length) setSelectedStudies(externalStudies) }, [externalStudies])
  
  // Checklist Trading
  const [checklistSections, setChecklistSections] = useState<ChecklistSection[]>([
    {
      title: "scanner.secPreTradingTitle",
      icon: Clock,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/30",
      items: [
        { id: "1", label: "scanner.chk1", checked: false },
        { id: "2", label: "scanner.chk2", checked: false },
        { id: "3", label: "scanner.chk3", checked: false },
        { id: "4", label: "scanner.chk4", checked: false }
      ]
    },
    {
      title: "scanner.secExitTitle",
      icon: Target,
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      items: [
        { id: "5", label: "scanner.chk5", checked: false },
        { id: "6", label: "scanner.chk6", checked: false },
        { id: "7", label: "scanner.chk7", checked: false }
      ]
    },
    {
      title: "scanner.secRiskTitle",
      icon: Shield,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      items: [
        { id: "8", label: "scanner.chk8", checked: false },
        { id: "9", label: "scanner.chk9", checked: false },
        { id: "10", label: "scanner.chk10", checked: false }
      ]
    },
    {
      title: "scanner.secEntryTitle",
      icon: TrendingUp,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/30",
      items: [
        { id: "11", label: "scanner.chk11", checked: false },
        { id: "12", label: "scanner.chk12", checked: false },
        { id: "13", label: "scanner.chk13", checked: false }
      ]
    },
    {
      title: "scanner.secManageTitle",
      icon: ChartColumn,
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30",
      items: [
        { id: "14", label: "scanner.chk14", checked: false },
        { id: "15", label: "scanner.chk15", checked: false },
        { id: "16", label: "scanner.chk16", checked: false }
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isVip, setIsVip] = useState(false)
  const [showShareSocial, setShowShareSocial] = useState(false)
  const [sharePrefetch, setSharePrefetch] = useState<ChartSocialSharePrefetch | null>(null)
  const [openingShareSocial, setOpeningShareSocial] = useState(false)
  const [copyingChartLink, setCopyingChartLink] = useState(false)
  const chartStageRef = useRef<HTMLDivElement>(null)
  const [scannerAccessChartHeight, setScannerAccessChartHeight] = useState(800)
  const { toast } = useToast()

  const updateScannerAccessChartHeight = useCallback(() => {
    if (!isScannerAccess || isFullscreen) return
    const wrap = scannerAccessWrapRef.current
    if (!wrap) return

    const width = wrap.getBoundingClientRect().width
    const controlsBottom =
      controlsRef.current?.getBoundingClientRect().bottom ??
      wrap.getBoundingClientRect().top
    const bottomPadding = 4
    const screenerReserve = showScreener ? 88 : 0
    const maxFromViewport =
      window.innerHeight - controlsBottom - bottomPadding - screenerReserve

    setScannerAccessChartHeight(computeScannerAccessChartHeight(width, maxFromViewport))
  }, [isScannerAccess, isFullscreen, showScreener])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)")
    const applyViewport = () =>
      setIsDesktop(isScannerAccess ? true : mediaQuery.matches)

    applyViewport()
    return subscribeMediaQueryChange(mediaQuery, applyViewport)
  }, [isScannerAccess])

  useEffect(() => {
    if (!isScannerAccess) return
    updateScannerAccessChartHeight()
    const ro = new ResizeObserver(() => updateScannerAccessChartHeight())
    const wrap = scannerAccessWrapRef.current
    const controls = controlsRef.current
    if (wrap) ro.observe(wrap)
    if (controls) ro.observe(controls)
    window.addEventListener("resize", updateScannerAccessChartHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", updateScannerAccessChartHeight)
    }
  }, [isScannerAccess, updateScannerAccessChartHeight, showSettings, showScreener])

  useEffect(() => {
    if (!isScannerAccess || !widgetLoaded || !widgetRef.current) return
    const id = window.setTimeout(() => {
      try {
        if (typeof widgetRef.current.resize === "function") {
          widgetRef.current.resize()
        }
      } catch {
        /* ignore */
      }
    }, 150)
    return () => window.clearTimeout(id)
  }, [isScannerAccess, widgetLoaded, scannerAccessChartHeight])

  useEffect(() => {
    if (!isScannerAccess) return
    const loadProfile = async () => {
      try {
        const { getCurrentUserId } = await import("@/lib/auth-token")
        const uid = await getCurrentUserId()
        if (!uid) return
        setCurrentUserId(uid)
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_type, member_category")
          .eq("id", uid)
          .maybeSingle()
        if (profile) {
          setIsAdmin(profile.user_type === "admin")
          setIsVip(profile.user_type === "admin" || profile.member_category === "vip")
        }
      } catch (e) {
        console.warn("[scanner-mobile] perfil:", e)
      }
    }
    void loadProfile()
  }, [isScannerAccess])

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

  const widgetHeight = isFullscreen
    ? "100vh"
    : isScannerAccess
      ? `${scannerAccessChartHeight}px`
      : isDesktop
        ? "calc(100vh - 400px)"
        : "calc(100vh - 340px)"

  useEffect(() => {
    if (window.TradingView) {
      loadWidget()
    }
  }, [
    selectedSymbol,
    selectedInterval,
    selectedStudies,
    theme,
    isScannerAccess,
    currentUserId,
    scannerAccessChartHeight,
  ])

  const loadTradingViewScript = (retryCount = 0) => {
    const existingScript = document.getElementById("tradingview-mobile-script")

    // Script já existe e TradingView já está carregado — ir directo ao widget
    if (existingScript && window.TradingView) {
      loadWidget()
      return
    }

    // Script em curso mas TradingView ainda não disponível — aguardar mais 500ms (max 10s)
    if (existingScript && !window.TradingView && retryCount < 20) {
      setTimeout(() => loadTradingViewScript(retryCount + 1), 500)
      return
    }

    // Remover script antigo que possa ter falhado antes de criar novo
    if (existingScript) {
      existingScript.remove()
    }

    const script = document.createElement("script")
    script.id = "tradingview-mobile-script"
    // CDN principal do TradingView Advanced Charts
    script.src = "https://s3.tradingview.com/tv.js"
    script.async = true
    script.crossOrigin = "anonymous"

    script.onload = () => {
      // Pequeno delay para garantir que TradingView inicializou o namespace
      const waitForTV = (attempt: number) => {
        if (window.TradingView) {
          loadWidget()
        } else if (attempt < 10) {
          setTimeout(() => waitForTV(attempt + 1), 200)
        } else {
          setError(t("scanner.errTvInit"))
        }
      }
      waitForTV(0)
    }

    script.onerror = () => {
      // Tentar novamente 1× antes de mostrar erro (falhas de rede transitórias no iOS)
      if (retryCount === 0) {
        console.warn("[TV] Falha ao carregar tv.js — a tentar novamente em 2s")
        setTimeout(() => loadTradingViewScript(1), 2000)
      } else {
        setError(t("scanner.errTvLoad"))
      }
    }

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
        const mountStyle = isScannerAccess
          ? `height:100%;width:100%;min-height:${scannerAccessChartHeight}px;`
          : "height:100%;width:100%;"
        containerRef.current.innerHTML = `<div id="${tvContainerId}" style="${mountStyle}"></div>`
      }

      const studiesToApply = selectedStudies.flatMap((key) => scannerStudies[key] || [])

      widgetRef.current = new window.TradingView.widget(
        buildTradingViewScannerOptions({
          mode: isScannerAccess ? "scanner-access" : "mobile",
          symbol: selectedSymbol,
          interval: selectedInterval,
          theme,
          studies: studiesToApply,
          containerId: tvContainerId,
          userId: currentUserId,
        })
      )

      // Configurar AUTO e apenas escala de preço após o chart estar pronto
      if (widgetRef.current && typeof widgetRef.current.onChartReady === "function") {
        widgetRef.current.onChartReady(() => {
          if (isScannerAccess) {
            requestAnimationFrame(() => {
              updateScannerAccessChartHeight()
              try {
                widgetRef.current?.resize?.()
              } catch {
                /* ignore */
              }
            })
          }
          try {
            const chart = widgetRef.current.chart && widgetRef.current.chart()
            if (chart) {
              if (isScannerAccess && typeof chart.applyOverrides === "function") {
                chart.applyOverrides(TV_STUDY_LEGEND_OVERRIDES)
              }
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
      setError(t("scanner.errWidget"))
    }
  }

  const toggleFullscreen = async () => {
    // iOS WKWebView e Android WebView não suportam requestFullscreen()
    // Usar CSS overlay (position: fixed; inset: 0) em vez disso
    if (isNativeApp()) {
      setIsFullscreen(prev => !prev)
      return
    }

    if (!containerRef.current?.parentElement) return

    try {
      if (!document.fullscreenElement) {
        const element = containerRef.current.parentElement

        if (element.requestFullscreen) {
          await element.requestFullscreen()
        } else if ((element as any).webkitRequestFullscreen) {
          await (element as any).webkitRequestFullscreen()
        } else if ((element as any).mozRequestFullScreen) {
          await (element as any).mozRequestFullScreen()
        } else if ((element as any).msRequestFullscreen) {
          await (element as any).msRequestFullscreen()
        } else {
          // Fallback silencioso para CSS overlay
          setIsFullscreen(true)
          return
        }

        if (screen.orientation) {
          try {
            await screen.orientation.lock?.('landscape')
          } catch (e) {}
        }
        setIsFullscreen(true)
      } else {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen()
        else if ((document as any).mozCancelFullScreen) await (document as any).mozCancelFullScreen()
        else if ((document as any).msExitFullscreen) await (document as any).msExitFullscreen()

        if (screen.orientation) {
          try {
            await screen.orientation.unlock?.()
          } catch (e) {}
        }
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error("Erro ao alternar fullscreen:", err)
      // Fallback silencioso para CSS overlay
      setIsFullscreen(prev => !prev)
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

  const chartUrlFallback = {
    symbol: selectedSymbol,
    interval: selectedInterval,
    studies: selectedStudies.flatMap((key) => scannerStudies[key] || []),
    theme,
  }

  const resolveChartInstance = () => widgetRef.current?.chart?.() ?? null

  const copyChartLink = useCallback(async () => {
    if (!widgetLoaded || copyingChartLink) return
    setCopyingChartLink(true)
    try {
      const { url, native } = await copyChartShareLink(
        resolveChartInstance(),
        widgetRef.current,
        chartUrlFallback
      )
      toast({
        title: t("scanner.toastLinkCopiedTitle"),
        description: native
          ? t("scanner.toastLinkNativeDesc")
          : t("scanner.toastLinkBuiltDesc"),
      })
      return url
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("scanner.toastLinkCopyError")
      toast({ title: t("scanner.toastLinkUnavailableTitle"), description: msg, variant: "destructive" })
      return null
    } finally {
      setCopyingChartLink(false)
    }
  }, [widgetLoaded, copyingChartLink, chartUrlFallback, toast, t])

  const openShareSocial = useCallback(async () => {
    if (!widgetLoaded || openingShareSocial) return
    setOpeningShareSocial(true)
    focusTradingViewIframe(containerRef.current)
    try {
      const chart = resolveChartInstance()
      const widget = widgetRef.current
      const image = await captureChartScreenshot(chart, containerRef.current, widget)
      if (image) {
        await copyChartImageToClipboard(image)
      }
      const chartUrl = await resolveNativeChartShareUrl(chart, widget)
      setSharePrefetch({ image, chartUrl })
      setShowShareSocial(true)
      toast({
        title: image ? t("scanner.toastSnapshotCopiedTitle") : t("scanner.toastOpeningShareTitle"),
        description: image
          ? t("scanner.toastSnapshotDesc")
          : t("scanner.toastOpeningShareDesc"),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("scanner.toastShareError")
      toast({ title: t("scanner.toastErrorTitle"), description: msg, variant: "destructive" })
    } finally {
      setOpeningShareSocial(false)
    }
  }, [widgetLoaded, openingShareSocial, chartUrlFallback, toast, t])

  const runTvKeyboardShortcut = useCallback(
    async (e: KeyboardEvent) => {
      const result = await handleTradingViewKeyboardShortcut(
        e,
        resolveChartInstance(),
        widgetRef.current,
        { urlFallback: chartUrlFallback, chartContainer: containerRef.current }
      )
      if (result === "share-link") {
        toast({
          title: t("scanner.toastLinkCopiedTitle"),
          description: t("scanner.toastLinkNativeDesc"),
        })
      } else if (result === "share-link-fallback") {
        toast({
          title: t("scanner.toastLinkCopiedShortTitle"),
          description: t("scanner.toastLinkBuiltFallbackDesc"),
        })
      } else if (result === "share-link-failed") {
        toast({
          title: t("scanner.toastShortcutUnavailableTitle"),
          description: t("scanner.toastShortcutUnavailableDesc"),
          variant: "destructive",
        })
      }
    },
    [chartUrlFallback, toast, t]
  )

  useEffect(() => {
    if (!widgetLoaded) return
    const onKeyDown = (e: KeyboardEvent) => {
      void runTvKeyboardShortcut(e)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [widgetLoaded, runTvKeyboardShortcut])

  useEffect(() => {
    if (!isScannerAccess || typeof document === "undefined") return
    document.body.classList.add("scanner-access-route")
    return () => document.body.classList.remove("scanner-access-route")
  }, [isScannerAccess])

  useImperativeHandle(externalWidgetRef, (): TradingViewWidgetRef => ({
    getWidget: () => widgetRef.current,
    getChart: () => widgetRef.current?.chart?.() || null,
    shareChart: async () =>
      resolveChartShareUrl(widgetRef.current?.chart?.() ?? null, widgetRef.current ?? null, chartUrlFallback),
    captureChartImage: async () =>
      captureChartScreenshot(
        widgetRef.current?.chart?.() ?? null,
        containerRef.current,
        widgetRef.current
      ),
    extractTradeDraft: async () => {
      const { extractChartShareTradeDraft } = await import("@/lib/chart-share-trade")
      return extractChartShareTradeDraft(resolveChartInstance(), selectedSymbol)
    },
  }))

  return (
    <div
      ref={isScannerAccess ? scannerAccessWrapRef : undefined}
      className={
        isScannerAccess
          ? "bg-black tv-widget-mount flex flex-col w-full tv-scanner-access overflow-visible"
          : `bg-black ${isDesktop ? "min-h-[calc(100vh-8rem)]" : "min-h-screen"}`
      }
    >
      {/* Controls */}
      <div
        ref={isScannerAccess ? controlsRef : undefined}
        className={`bg-gray-900 border-b border-[#D2A63C]/30 space-y-3 ${
          isScannerAccess ? "shrink-0 relative z-10" : ""
        } ${isDesktop ? "p-4" : "p-3"}`}
      >
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
                <span>{t(categoryLabelKeys[key as keyof typeof assetCategories])}</span>
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
          {isDesktop && !isScannerAccess && (
            <div className="rounded-md border border-gray-700 bg-gray-800 text-gray-300 text-xs px-3 flex items-center">
              {t("scanner.layoutDesktop")}
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
                {t("scanner.exitFullscreen")}
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 mr-1.5" />
                {t("scanner.fullscreen")}
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

          {!isNativeApp() && (
            <Button
              onClick={() => void copyChartLink()}
              disabled={!widgetLoaded || copyingChartLink}
              size="sm"
              variant="outline"
              className={`bg-gray-800 text-white border-gray-700 hover:bg-gray-700 ${isDesktop ? "h-9 px-3" : "h-8 px-2"}`}
              title={t("scanner.copyChartLinkTitle")}
            >
              {copyingChartLink ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Share2 className="w-3 h-3" />
              )}
            </Button>
          )}

          {isScannerAccess && (isAdmin || isVip) && (
            <Button
              onClick={() => void openShareSocial()}
              disabled={!widgetLoaded || openingShareSocial}
              size="sm"
              variant="outline"
              className={`bg-gray-800 text-[#D2A63C] border-[#D2A63C]/40 hover:bg-[#D2A63C]/10 ${isDesktop ? "h-9 px-3" : "h-8 px-2"}`}
              title={t("scanner.shareSocialTitle")}
            >
              {openingShareSocial ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <MessageCircle className="w-3 h-3" />
              )}
            </Button>
          )}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className={`bg-gray-800 rounded-lg space-y-3 ${isDesktop ? "p-4" : "p-3"}`}>
            <h3 className="text-white text-sm font-semibold">{t("scanner.settings")}</h3>

            {/* Favorite Timeframes */}
            <div>
              <label className="text-xs text-gray-300 mb-2 block">{t("scanner.favoriteTimeframes")}</label>
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
        ref={isScannerAccess ? chartStageRef : undefined}
        className={
          isScannerAccess
            ? "tv-chart-stage relative z-0 bg-black w-full mx-auto outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]/50"
            : "relative bg-black"
        }
        style={{
          height: widgetHeight,
          minHeight: isScannerAccess && !isFullscreen ? widgetHeight : undefined,
          width: "100%",
          ...(isFullscreen && isNativeApp() ? {
            position: "fixed" as const,
            inset: 0,
            zIndex: 9999,
            width: "100vw",
            height: "100vh", // vh (não dvh): suportado em WebViews antigos; inset:0 já fixa
          } : {}),
        }}
        tabIndex={isScannerAccess ? 0 : undefined}
        role={isScannerAccess ? "region" : undefined}
        aria-label={isScannerAccess ? t("scanner.chartAreaAria") : undefined}
        onKeyDown={
          isScannerAccess
            ? (e) => {
                void runTvKeyboardShortcut(e.nativeEvent)
              }
            : undefined
        }
        onMouseDown={
          isScannerAccess
            ? (e) => {
                if (e.target === e.currentTarget) {
                  focusChartStageWrapper(chartStageRef.current)
                } else {
                  focusTradingViewIframe(containerRef.current)
                }
              }
            : undefined
        }
        onTouchStart={isScannerAccess ? undefined : handleTouchStart}
        onTouchMove={isScannerAccess ? undefined : handleTouchMove}
        onDoubleClick={isScannerAccess ? undefined : handleDoubleClick}
      >
        <div
          ref={containerRef}
          className={isScannerAccess ? "w-full h-full min-h-full tv-chart-mount" : "w-full h-full"}
          style={isScannerAccess ? { minHeight: widgetHeight } : undefined}
        />

        {!widgetLoaded && !error && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/90">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#D2A63C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#D2A63C] font-medium">{t("scanner.loadingChart")}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/90">
            <div className="text-center p-4">
              <p className="text-red-400 mb-4">{error}</p>
              <Button onClick={loadWidget} className="bg-[#D2A63C] text-black">
                {t("scanner.retry")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Botão flutuante de saída — só em native app fullscreen */}
      {isFullscreen && isNativeApp() && (
        <button
          onClick={toggleFullscreen}
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            right: "16px",
            zIndex: 10000,
            background: "rgba(0,0,0,0.75)",
            border: "1px solid #D2A63C",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "#D2A63C",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          <Minimize2 style={{ width: 16, height: 16 }} />
          {t("scanner.exit")}
        </button>
      )}

      {/* Alertas MTM — acesso centralizado (webview app iOS/Android) */}
      {!isFullscreen && !isDesktop && (
        <div className="px-4 pt-3">
          <a
            href="/app-mobile?tab=trading-alerts"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D2A63C]/50 bg-[#D2A63C]/10 py-2.5 text-sm font-semibold text-[#D2A63C] transition-colors hover:bg-[#D2A63C]/20"
          >
            <Bell style={{ width: 16, height: 16 }} />
            {t("scanner.mtmAlertsConfigure")}
          </a>
        </div>
      )}

      {/* Screener / Heatmap */}
      {!isFullscreen && showScreener && (
        <div className="p-4 bg-gray-900 border-t border-[#D2A63C]/30">
          <ScannerScreener mode={isDesktop ? "desktop" : "mobile"} />
        </div>
      )}

      {isScannerAccess && (isAdmin || isVip) && (
        <ChartSocialShareDialog
          open={showShareSocial}
          onOpenChange={(open) => {
            setShowShareSocial(open)
            if (!open) setSharePrefetch(null)
          }}
          symbol={selectedSymbol}
          widgetLoaded={widgetLoaded}
          getChart={resolveChartInstance}
          getWidget={() => widgetRef.current}
          chartContainer={containerRef.current}
          urlFallback={chartUrlFallback}
          prefetch={sharePrefetch}
          captureChartImage={async () =>
            captureChartScreenshot(
              widgetRef.current?.chart?.() ?? null,
              containerRef.current,
              widgetRef.current
            )
          }
        />
      )}

      {/* Checklist de Trading (só app-mobile; scanner-access tem checklist na página) */}
      {!isScannerAccess && !isFullscreen && (
        <div className="p-4 bg-gray-900">
          <Card className="bg-black/50 border-amber-500/30">
            <CardContent className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-amber-400" />
                  <h3 className="text-white font-bold text-lg">{t("scanner.checklistTitle")}</h3>
                </div>
                <Button
                  onClick={handleResetChecklist}
                  size="sm"
                  variant="outline"
                  className="border-amber-500 text-amber-400 hover:bg-amber-500/10 bg-black/50 h-8"
                >
                  <RefreshIcon className="h-3 w-3 mr-1" />
                  {t("scanner.reset")}
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                    {completedItems}/{totalItems} {t("scanner.complete")}
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
                              {t(section.title)}
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
                                {t(item.label)}
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

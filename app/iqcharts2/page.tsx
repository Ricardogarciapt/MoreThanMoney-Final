"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import TradingViewWidget from "@/components/trading-view-widget"
import { useToast } from "@/hooks/use-toast"
import { 
  BarChart3,
  Save,
  FolderOpen,
  Copy,
  Trash2,
  Loader2,
  ArrowLeft,
  LogOut,
} from "lucide-react"
import { MTMChartLayout, ScannerKey } from "@/types/layout"
import { loadLayouts, createLayout, deleteLayout, duplicateLayout, updateLayout } from "@/lib/layoutStorage"
import { useRouter } from "next/navigation"
import { IQInsightsPanel } from "@/components/iq-insights-panel"
import { IQIdeasPanel } from "@/components/iq-ideas-panel"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const IQONIC_ACADEMY_URL = "https://iqonic.vip"
const IQONIC_LOGIN_URL = "https://iqonic.vip/auth/login"

// Admin credentials
const ADMIN_USERNAME = "admin"
const ADMIN_PASSWORD = "admin123"
const ADMIN_SESSION_KEY = "iqcharts_admin_session"

export default function IQCharts2Page() {
  const [mounted, setMounted] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const { toast } = useToast()
  const router = useRouter()
  const [showScreener, setShowScreener] = useState(false)
  const [savedLayouts, setSavedLayouts] = useState<MTMChartLayout[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [layoutNameToSave, setLayoutNameToSave] = useState("")

  // Estados do gráfico (serão passados para o TradingViewWidget)
  const [selectedSymbol, setSelectedSymbol] = useState("OANDA:XAUUSD")
  const [selectedTimeframe, setSelectedTimeframe] = useState("60")
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">("dark")
  const [selectedStudies, setSelectedStudies] = useState<ScannerKey[]>(["KillShot"])

  // Check admin session
  const checkAdminSession = (): boolean => {
    if (typeof window === "undefined") return false
    const adminSession = localStorage.getItem(ADMIN_SESSION_KEY)
    if (adminSession) {
      try {
        const sessionData = JSON.parse(adminSession)
        // Check if session is still valid (24 hours)
        if (Date.now() - sessionData.timestamp < 24 * 60 * 60 * 1000) {
          return true
        } else {
          localStorage.removeItem(ADMIN_SESSION_KEY)
        }
      } catch {
        localStorage.removeItem(ADMIN_SESSION_KEY)
      }
    }
    return false
  }

  // Handle admin login
  const handleAdminLogin = () => {
    if (adminUsername === ADMIN_USERNAME && adminPassword === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        username: ADMIN_USERNAME,
        timestamp: Date.now()
      }))
      setIsAuthenticated(true)
      setIsChecking(false)
      setShowAdminLogin(false)
      setAdminUsername("")
      setAdminPassword("")
      toast({
        title: "✅ Admin Login Successful",
        description: "Welcome, admin!",
      })
    } else {
      toast({
        title: "❌ Invalid Credentials",
        description: "Username or password is incorrect",
        variant: "destructive",
      })
    }
  }

  // Verificar autenticação do IQ Academy
  useEffect(() => {
    let mounted = true
    
    const checkIQAcademyAuth = async () => {
      try {
        setIsChecking(true)
        
        // Check admin session first
        if (checkAdminSession()) {
          console.log("✅ [IQ CHARTS] Admin session found")
          if (mounted) {
            setIsAuthenticated(true)
            setIsChecking(false)
          }
          return
        }
        
        // Verificar se há parâmetros de retorno após login externo
        const urlParams = new URLSearchParams(window.location.search)
        const returnFromLogin = urlParams.get('return') === 'true'
        const loginToken = urlParams.get('token')
        
        // Se retornou do login, aguardar um pouco para sessão sincronizar
        if (returnFromLogin || loginToken) {
          console.log("🔄 [IQ CHARTS] Retornou do login externo, aguardando sincronização...")
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Limpar parâmetros da URL
          if (returnFromLogin || loginToken) {
            window.history.replaceState({}, document.title, window.location.pathname)
          }
        }
        
        // Verificar sessão múltiplas vezes (com retry)
        let attempts = 0
        const maxAttempts = 5
        
        while (attempts < maxAttempts && mounted) {
          attempts++
          console.log(`🔍 [IQ CHARTS] Tentativa ${attempts}/${maxAttempts} de verificar sessão...`)
          
          // Verificar se há sessão no Supabase
          const { data: { session }, error } = await supabase.auth.getSession()
          
          if (error) {
            console.error("❌ [IQ CHARTS] Erro ao verificar sessão:", error)
            if (attempts === maxAttempts) {
              redirectToLogin()
              return
            }
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }

          if (session?.user) {
            console.log("✅ [IQ CHARTS] Sessão encontrada:", session.user.email)
            setIsAuthenticated(true)
            setIsChecking(false)
            return
          }

          // Se não encontrou sessão, aguardar antes de tentar novamente
          if (attempts < maxAttempts) {
            console.log(`⏳ [IQ CHARTS] Sessão não encontrada, aguardando ${attempts * 500}ms...`)
            await new Promise(resolve => setTimeout(resolve, attempts * 500))
          }
        }
        
        // Se chegou aqui, não encontrou sessão após todas as tentativas
        console.log("⚠️ [IQ CHARTS] Nenhuma sessão encontrada após todas as tentativas")
        redirectToLogin()
      } catch (error) {
        console.error("❌ [IQ CHARTS] Erro ao verificar autenticação:", error)
        redirectToLogin()
      }
    }

    const redirectToLogin = () => {
      if (!mounted) return
      setIsChecking(false)
    }

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔔 [IQ CHARTS] Evento de autenticação:", event)
      
      if (event === 'SIGNED_IN' && session?.user) {
        console.log("✅ [IQ CHARTS] Login detectado via onAuthStateChange:", session.user.email)
        if (mounted) {
          setIsAuthenticated(true)
          setIsChecking(false)
        }
      } else if (event === 'SIGNED_OUT') {
        console.log("🚪 [IQ CHARTS] Logout detectado")
        if (mounted) {
          setIsAuthenticated(false)
          setIsChecking(false)
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        console.log("🔄 [IQ CHARTS] Token atualizado:", session.user.email)
        if (mounted) {
          setIsAuthenticated(true)
          setIsChecking(false)
        }
      }
    })

    setMounted(true)
    checkIQAcademyAuth()

    // Adicionar listener para quando a página ganha foco (após retorno do login)
    const handleFocus = () => {
      console.log("🌐 [IQ CHARTS] Página focada, verificando autenticação novamente...")
      checkIQAcademyAuth()
    }
    
    // Adicionar listener para quando a página fica visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("👁️ [IQ CHARTS] Página visível, verificando autenticação...")
        checkIQAcademyAuth()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (mounted && isAuthenticated) {
      setSavedLayouts(loadLayouts())
    }
  }, [mounted, isAuthenticated])


  const handleSaveLayout = () => {
    if (!layoutNameToSave.trim()) {
      toast({
        title: "❌ Error",
        description: "Enter a name for the layout",
        variant: "destructive",
      })
      return
    }

    try {
      const layout: MTMChartLayout = {
        version: "1.0",
        id: crypto.randomUUID(),
        name: layoutNameToSave,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chart: {
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
          theme: selectedTheme,
        },
        scanners: {
          active: selectedStudies,
        },
        ui: {
          favoriteTimeframe: selectedTimeframe,
        },
      }

      createLayout(layout)
      const updatedLayouts = loadLayouts()
      setSavedLayouts(updatedLayouts)
      setLayoutNameToSave("")
      setShowSaveDialog(false)
      
      toast({
        title: "✅ Layout Saved",
        description: `Layout "${layout.name}" saved successfully`,
      })
    } catch (error) {
      console.error("Erro ao salvar layout:", error)
      toast({
        title: "❌ Error",
        description: "Error saving layout",
        variant: "destructive",
      })
    }
  }

  const handleLoadLayout = (layout: MTMChartLayout) => {
    setSelectedSymbol(layout.chart.symbol)
    setSelectedTimeframe(layout.chart.timeframe)
    setSelectedTheme(layout.chart.theme)
    setSelectedStudies(layout.scanners.active)
    setShowLoadDialog(false)
    
    toast({
      title: "✅ Layout Loaded",
      description: `Layout "${layout.name}" applied`,
    })
  }

  const handleDeleteLayout = (layoutId: string) => {
    if (confirm("Are you sure you want to delete this layout?")) {
      deleteLayout(layoutId)
      const updatedLayouts = loadLayouts()
      setSavedLayouts(updatedLayouts)
      toast({
        title: "✅ Layout Deleted",
        description: "Layout removed successfully",
      })
    }
  }

  const handleDuplicateLayout = (layoutId: string) => {
    duplicateLayout(layoutId)
    const updatedLayouts = loadLayouts()
    setSavedLayouts(updatedLayouts)
    toast({
      title: "✅ Layout Duplicated",
      description: "Layout duplicated successfully",
    })
  }

  const handleSaveInsight = (insight: any) => {
    toast({
      title: "✅ Insight Saved",
      description: `Insight "${insight.name}" saved`,
    })
  }

  const handleDeleteInsight = (insightId: string) => {
    toast({
      title: "✅ Insight Deleted",
      description: "Insight removed",
    })
  }

  const handleDuplicateInsight = (insightId: string) => {
    toast({
      title: "✅ Insight Duplicated",
      description: "Insight duplicated",
    })
  }

  const handleLoadInsight = (insight: any) => {
    setSelectedSymbol(insight.chart?.symbol || selectedSymbol)
    setSelectedTimeframe(insight.chart?.timeframe || selectedTimeframe)
    setSelectedTheme(insight.chart?.theme || selectedTheme)
    setSelectedStudies(insight.scanners?.active || selectedStudies)
    
    toast({
      title: "✅ Insight Loaded",
      description: `Insight "${insight.name}" applied`,
    })
  }

  const captureChartPreview = async (): Promise<string | null> => {
    try {
      // Usar html2canvas ou similar para capturar
      // Por enquanto, retornar null e usar screenshot nativo do TradingView
      return null
    } catch (error) {
      console.error("Erro ao capturar preview:", error)
      return null
    }
  }

  const handleLogout = async () => {
    try {
      // Clear admin session if exists
      localStorage.removeItem(ADMIN_SESSION_KEY)
      
      // Try to sign out from Supabase
      try {
        await supabase.auth.signOut()
      } catch (e) {
        // Ignore Supabase errors if not logged in
      }
      
      // Redirect to login
      setIsAuthenticated(false)
      setIsChecking(true)
      window.location.href = IQONIC_LOGIN_URL
    } catch (error) {
      console.error("Erro ao fazer logout:", error)
      toast({
        title: "❌ Error",
        description: "Error logging out",
        variant: "destructive",
      })
    }
  }

  const handleReturnToAcademy = () => {
    // Verificar se há sessão antes de redirecionar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Se tem sessão, pode ir para Academy
        window.location.href = IQONIC_ACADEMY_URL
      } else {
        // Se não tem sessão, ir para login com redirect de volta
        const currentUrl = window.location.href
        const loginUrl = `${IQONIC_LOGIN_URL}?redirect=${encodeURIComponent(currentUrl)}`
        window.location.href = loginUrl
      }
    })
  }

  if (!mounted || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#05060D' }}>
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: '#2563EB' }} />
          <p style={{ color: '#B0B8C1' }}>Checking access...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#05060D' }}>
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4" style={{ color: '#E6EAF0' }}>Access Required</h2>
            <p className="text-sm mb-4" style={{ color: '#B0B8C1' }}>
              You need to log in to IQ Academy to access IQ Charts.
            </p>
            <p className="text-xs mb-6" style={{ color: '#6B7280' }}>
              After logging in at iqonic.vip, return to this page to access.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => {
                const currentUrl = window.location.href
                const loginUrl = `${IQONIC_LOGIN_URL}?redirect=${encodeURIComponent(currentUrl)}`
                window.location.href = loginUrl
              }}
              className="w-full rounded-lg font-medium"
              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
            >
              Go to IQ Academy Login
            </Button>
            
            <Button
              onClick={() => setShowAdminLogin(true)}
              variant="outline"
              className="w-full rounded-lg font-medium"
              style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
            >
              Admin Login
            </Button>
            
            <Button
              onClick={async () => {
                setIsChecking(true)
                // Check admin session first
                if (checkAdminSession()) {
                  setIsAuthenticated(true)
                  setIsChecking(false)
                  return
                }
                // Aguardar um pouco e verificar novamente
                await new Promise(resolve => setTimeout(resolve, 1000))
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.user) {
                  setIsAuthenticated(true)
                  setIsChecking(false)
                } else {
                  setIsChecking(false)
                  toast({
                    title: "⚠️ Still no session",
                    description: "Please log in to IQ Academy first.",
                    variant: "destructive",
                  })
                }
              }}
              variant="outline"
              className="w-full rounded-lg font-medium"
              style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
            >
              Check Again
            </Button>
          </div>
          
          {/* Admin Login Dialog */}
          {showAdminLogin && (
            <Dialog open={showAdminLogin} onOpenChange={setShowAdminLogin}>
              <DialogContent className="border rounded-lg" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
                <DialogHeader>
                  <DialogTitle style={{ color: '#E6EAF0', fontSize: '16px', fontWeight: 600 }}>Admin Login</DialogTitle>
                  <DialogDescription style={{ color: '#B0B8C1', fontSize: '12px' }}>
                    Enter admin credentials to access IQ Charts
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Username</Label>
                    <Input
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAdminLogin()
                        }
                      }}
                      placeholder="admin"
                      className="mt-2 border rounded-lg"
                      style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Password</Label>
                    <Input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAdminLogin()
                        }
                      }}
                      placeholder="••••••••"
                      className="mt-2 border rounded-lg"
                      style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                    />
                  </div>
                  <Button
                    onClick={handleAdminLogin}
                    className="w-full rounded-lg font-medium"
                    style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
                  >
                    Login
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#05060D', color: '#E6EAF0' }}>
      {/* Header Minimalista - Estilo IQ Charts */}
      <div className="border-b sticky top-0 z-50" style={{ backgroundColor: '#05060D', borderColor: '#1F2937' }}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-wide" style={{ letterSpacing: '0.05em' }}>
            IQ CHARTS
          </h1>
          
          {/* Botões de navegação */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleReturnToAcademy}
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
              style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1F2937'
                e.currentTarget.style.color = '#E6EAF0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0E1428'
                e.currentTarget.style.color = '#B0B8C1'
              }}
            >
              <ArrowLeft className="h-3 w-3 mr-1.5" />
              IQ Academy
            </Button>
            
            <Button
              onClick={handleLogout}
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
              style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1F2937'
                e.currentTarget.style.color = '#E6EAF0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0E1428'
                e.currentTarget.style.color = '#B0B8C1'
              }}
            >
              <LogOut className="h-3 w-3 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* TradingView Widget - Estilo IQ Charts */}
      <div className="w-full px-2 md:px-4 mb-6">
        <div className="max-w-[98%] mx-auto rounded-lg border p-2 md:p-4" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: '#B0B8C1' }}>Chart</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showScreener ? "default" : "outline"}
                size="sm"
                className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
                style={
                  showScreener
                    ? { backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }
                    : { backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }
                }
                onClick={() => setShowScreener((prev) => !prev)}
              >
                <BarChart3 className="h-3 w-3 mr-1.5" />
                Screener
              </Button>
              
              {/* IQ Insights Panel */}
              <IQInsightsPanel
                currentSymbol={selectedSymbol}
                currentTimeframe={selectedTimeframe}
                currentTheme={selectedTheme}
                currentStudies={selectedStudies}
                onLoadInsight={handleLoadInsight}
                onCapturePreview={captureChartPreview}
              />
              
              {/* IQ Ideas Panel - Botão Post */}
              <IQIdeasPanel
                currentSymbol={selectedSymbol}
                onCaptureImage={captureChartPreview}
                showPostButton={true}
                showFeed={false}
              />
              
              {/* Salvar Layout */}
              <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogTrigger asChild>
                  <Button 
                    size="sm"
                    className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
                    style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#1F2937'
                      e.currentTarget.style.color = '#E6EAF0'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#0E1428'
                      e.currentTarget.style.color = '#B0B8C1'
                    }}
                  >
                    <Save className="h-3 w-3 mr-1.5" />
                    Save Layout
                  </Button>
                </DialogTrigger>
                <DialogContent className="border rounded-lg" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
                  <DialogHeader>
                    <DialogTitle style={{ color: '#E6EAF0', fontSize: '14px', fontWeight: 600 }}>Save Layout</DialogTitle>
                    <DialogDescription style={{ color: '#B0B8C1', fontSize: '12px' }}>
                      Save the current chart state as a reusable layout
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Layout Name</Label>
                      <Input
                        value={layoutNameToSave}
                        onChange={(e) => setLayoutNameToSave(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSaveLayout()
                          }
                        }}
                        placeholder="Ex: XAU/USD - Golden Zone Setup"
                        className="mt-2 border rounded-lg"
                        style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                        autoFocus
                      />
                    </div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>
                      Saved layouts: {savedLayouts.length}/20
                    </div>
                    <Button
                      onClick={handleSaveLayout}
                      className="w-full rounded-lg font-medium"
                      style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Layout
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Carregar Layout */}
              <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
                    style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#1F2937'
                      e.currentTarget.style.color = '#E6EAF0'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#0E1428'
                      e.currentTarget.style.color = '#B0B8C1'
                    }}
                  >
                    <FolderOpen className="h-3 w-3 mr-1.5" />
                    Load Layout
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto border rounded-lg" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
                  <DialogHeader>
                    <DialogTitle style={{ color: '#E6EAF0', fontSize: '14px', fontWeight: 600 }}>Load Layout</DialogTitle>
                    <DialogDescription style={{ color: '#B0B8C1', fontSize: '12px' }}>
                      Select a saved layout to load
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {savedLayouts.length === 0 ? (
                      <div className="text-center py-8" style={{ color: '#6B7280' }}>
                        No saved layouts
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {savedLayouts.map((layout) => (
                          <div
                            key={layout.id}
                            className="flex items-center justify-between p-3 rounded-lg border transition-colors"
                            style={{ backgroundColor: '#05060D', borderColor: '#1F2937' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#2563EB'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#1F2937'
                            }}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-sm" style={{ color: '#E6EAF0' }}>{layout.name}</div>
                              <div className="text-xs mt-1" style={{ color: '#6B7280' }}>
                                {layout.chart.symbol} • {layout.chart.timeframe} • {layout.scanners.active.length} scanners
                              </div>
                              <div className="text-xs mt-1" style={{ color: '#6B7280' }}>
                                {new Date(layout.createdAt).toLocaleDateString("pt-BR")}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => handleLoadLayout(layout)}
                                size="sm"
                                className="h-7 px-3 text-xs font-medium rounded-lg"
                                style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
                              >
                                LOAD
                              </Button>
                              <Button
                                onClick={() => handleDuplicateLayout(layout.id)}
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 rounded-lg border"
                                style={{ borderColor: '#1F2937', color: '#B0B8C1' }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteLayout(layout.id)}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 rounded-lg"
                                style={{ color: '#FF4D4D' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#FF4D4D20'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <TradingViewWidget 
            showScreener={showScreener}
            externalSymbol={selectedSymbol}
            externalTimeframe={selectedTimeframe}
            externalTheme={selectedTheme}
            externalStudies={selectedStudies}
            onSymbolChange={setSelectedSymbol}
            onTimeframeChange={setSelectedTimeframe}
            onThemeChange={setSelectedTheme}
            onStudiesChange={setSelectedStudies}
          />
        </div>
      </div>

      {/* IQ Ideas Feed - Estilo IQ Charts */}
      <div className="container mx-auto px-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold tracking-wide" style={{ letterSpacing: '0.05em', color: '#E6EAF0' }}>
            IQ IDEAS
          </span>
        </div>
        <div className="rounded-lg border p-4" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
          <IQIdeasPanel
            currentSymbol={selectedSymbol}
            onCaptureImage={captureChartPreview}
            showPostButton={false}
            showFeed={true}
          />
        </div>
      </div>
    </div>
  )
}

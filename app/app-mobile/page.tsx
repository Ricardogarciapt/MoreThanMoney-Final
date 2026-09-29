"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import ProtectedPage from "@/components/protected-page"
import SocialFeed from "@/components/mobile/social-feed"
import PortfolioMobile from "@/components/mobile/portfolio-mobile"
import ScannerTabMobile from "@/components/mobile/scanner-tab-mobile"
import NotificationsPanel from "@/components/notifications-panel"
import LanguageSelectorEnhanced from "@/components/language-selector-enhanced"
import { SiteLogo } from "@/components/site-logo"
import { shouldReduceSafariEffects } from "@/lib/supabase-session"
import {
  Users,
  Wallet,
  BarChart3,
  Loader2,
  Menu,
  LayoutGrid,
  Video,
  MessageSquare,
  Zap,
  Bell,
  X,
} from "lucide-react"
import MobileSidebar from "@/components/mobile/mobile-sidebar"
import LiveSessionsMobile from "@/components/mobile/live-sessions-mobile"
import MentorMobile from "@/components/mobile/mentor-mobile"
import MarketplaceMobile from "@/components/mobile/marketplace-mobile"
import AppsMobile from "@/components/mobile/apps-mobile"
import ChatChannels from "@/components/mobile/chat-channels"
import TradingAlertsMobile from "@/components/mobile/trading-alerts-mobile"
import TapToTradeFeed from "@/components/mobile/tap-to-trade-feed"
import SettingsMobile from "@/components/mobile/settings-mobile"
import OnboardingTutorial, { useOnboarding } from "@/components/mobile/onboarding-tutorial"
import MlmDashboardTab from "@/components/mobile/mlm-dashboard-tab"
import { useAuth } from "@/contexts/auth-context"
import { chavePerfilUi, type PerfilUi } from "@/lib/perfil-ui"
import { useCapacitor } from "@/hooks/use-capacitor"
import { usePushNotifications, type ForegroundMessage } from "@/hooks/use-push-notifications"
import { supabase } from "@/lib/supabase"
import AvisoNotificacoes from "@/components/mobile/aviso-notificacoes"

function AppMobileContent() {
  const STUDIO_URL = "https://mtmbrandbuilder.lovable.app"
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, isAppOnlyUser, isPrimeverse, isLoading: authLoading } = useAuth()

  // ── Capacitor native bridge (iOS/Android) ──────────────────────────
  const { isNative, isIOS: isIOSDevice } = useCapacitor({
    userId: user?.id ?? null,
    onDeepLink: (url) => {
      try {
        const parsed = new URL(url)
        const tab = parsed.searchParams.get("tab")
        if (tab) handleTabChange(tab)
      } catch {}
    },
  })

  // ── Web/PWA push notifications (FCM) ──────────────────────────────
  const handleForegroundMessage = useCallback((msg: ForegroundMessage) => {
    setForegroundNotif(msg)
    if (foregroundTimerRef.current) clearTimeout(foregroundTimerRef.current)
    foregroundTimerRef.current = setTimeout(() => setForegroundNotif(null), 5000)
    // Incrementar contador de não lidas
    setUnreadCount((c) => c + 1)
  }, [])

  const { requestPermission } = usePushNotifications({
    userId: user?.id ?? null,
    isNative,
    onForegroundMessage: handleForegroundMessage,
  })
  const [mounted, setMounted] = useState(false)
  const validTabs = ["social", "chat", "tap-to-trade", "portfolio", "scanner", "apps", "live", "mentor", "settings", "mlm", "trading-alerts", "funded", "marketplace"] as const
  // `funded` é o deep-link antigo do WebTrader: hoje é o sub-separador «Web trader» do Scanner.
  const normalizarTab = (t: string) => (t === "funded" ? "scanner" : t)
  const tabFromUrl = searchParams.get("tab")
  const subScanner = tabFromUrl === "funded" || searchParams.get("sub") === "webtrader" ? "webtrader" : "scanner"
  const channelFromUrl = searchParams.get("channel")
  const [activeTab, setActiveTab] = useState(() =>
    tabFromUrl && validTabs.includes(tabFromUrl as (typeof validTabs)[number]) ? normalizarTab(tabFromUrl) : "social"
  )

  /**
   * O URL manda no separador — SEMPRE, não só no arranque.
   *
   * O useState acima só corre uma vez. Tocar numa notificação faz router.push para
   * /app-mobile?tab=chat&channel=… — mesmo caminho, query diferente — e o React não volta a
   * correr o inicializador: o separador ficava onde estava e o cliente aterrava no sítio errado
   * (ou em sítio nenhum). É o que fazia o encaminhamento das notificações não ir dar a lado
   * nenhum dentro das apps nativas, que vivem inteiras nesta página.
   */
  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl as (typeof validTabs)[number]) && normalizarTab(tabFromUrl) !== activeTab) {
      setActiveTab(normalizarTab(tabFromUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl])
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [userLoaded, setUserLoaded] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [foregroundNotif, setForegroundNotif] = useState<ForegroundMessage | null>(null)
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false)
  const foregroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { shouldShow: showOnboarding, markDone: markOnboardingDone } = useOnboarding()

  // ── RESGATE do deep-link de push (shell iOS nativa / cold start) ───────────
  // A shell WKWebView (APNs nativo) abre a app SEM entregar o URL da notificação à web layer.
  // Fallback server-side (sem rebuild nativo): ao abrir/retomar SEM ?signal na barra, procura a
  // notificação in-app T2T mais recente NÃO LIDA criada nos últimos 3 min (o intervalo entre o
  // tap na push e a app abrir), navega para o URL dela (abre o modal de aceitação) e marca-a
  // lida — 1× por notificação. Em fluxos que já entregam o URL (web/SW/Capacitor), o ?signal
  // presente faz esta rotina não disparar.
  const deepLinkClaimBusy = useRef(false)
  useEffect(() => {
    const claim = async () => {
      if (deepLinkClaimBusy.current) return
      deepLinkClaimBusy.current = true
      try {
        const here = new URLSearchParams(window.location.search)
        if (here.get("signal") || here.get("msg")) return
        const res = await fetch("/api/notifications/user", { credentials: "include", cache: "no-store" })
        if (!res.ok) return
        const { notifications } = await res.json()
        const fresh = (notifications ?? []).find(
          (n: { read?: boolean; created_at?: string; data?: { url?: string } }) =>
            !n.read &&
            typeof n?.data?.url === "string" &&
            n.data.url.includes("tab=tap-to-trade") &&
            // Há dois emissores e dois nomes para o mesmo parâmetro (`signal=` e `sinal=`).
            // Ler só um deixava metade das notificações de sinal a abrir o separador T2T em
            // branco — e agora, sem botão no chat, não há segunda via para aceitar.
            (n.data.url.includes("signal=") || n.data.url.includes("sinal=")) &&
            n.created_at != null &&
            Date.now() - new Date(n.created_at).getTime() < 3 * 60_000,
        )
        if (!fresh) return
        await fetch(`/api/notifications/user?id=${encodeURIComponent(fresh.id)}`, {
          method: "PUT",
          credentials: "include",
        }).catch(() => {})
        router.replace(fresh.data.url)
      } catch {
        /* silencioso — fallback best-effort */
      } finally {
        deepLinkClaimBusy.current = false
      }
    }
    claim()
    const onVis = () => {
      if (document.visibilityState === "visible") claim()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setMounted(true)

    // Persist native-app context so the Navbar stays hidden on every page during this session
    const nativeParam = searchParams.get("native")
    const planParam = searchParams.get("plan")
    if (nativeParam === "1") {
      try {
        sessionStorage.setItem("mtm_native", "1")
        if (planParam) sessionStorage.setItem("mtm_plan", planParam)
      } catch {}
    }

    // (Google Translate é agora permitido na app-mobile — o seletor de idioma
    // ativa-o via cookie googtrans; protegido pelo patch de DOM em google-translate-safe.)

    // Registrar service worker para notificações push (PWA)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('✅ [APP-MOBILE] Service Worker registrado:', registration.scope)
        })
        .catch((error) => {
          console.warn('⚠️ [APP-MOBILE] Erro ao registrar service worker:', error)
        })
    }
    
  }, [])

  useEffect(() => {
    // Usar user do auth-context (única fonte de verdade)
    if (mounted && !authLoading && user && !userLoaded) {
      setCurrentUser(user)
      setUserLoaded(true)
    }
  }, [mounted, authLoading, user, userLoaded])

  // ── Reportar estado de auth ao bridge nativo iOS ──────────────────
  useEffect(() => {
    if (!mounted || authLoading) return
    if (typeof window === 'undefined') return

    // Só activa quando dentro do WebView nativo MTM
    let isNative = false
    try { isNative = sessionStorage.getItem('mtm_native') === '1' } catch {}
    if (!isNative) return

    if (!user) {
      // Utilizador não autenticado — notificar nativo
      window.dispatchEvent(new Event('mtm-auth-logout'))
      return
    }

    /**
     * Plano web do utilizador — é ISTO que o shell nativo usa para decidir se mostra o paywall.
     *
     * Lia-se só `member_category`, e por isso um admin ou um VIP marcado em `user_type` saíam
     * daqui como `none`: a app nativa pedia-lhes para comprar o que já têm. O Premium pago em
     * `subscription_plan` (com a categoria ainda em 'standard') dava o mesmo resultado.
     */
    const chave = chavePerfilUi(user as PerfilUi)
    const plan =
      chave === 'admin' || chave === 'vip' || chave === 'premium' || chave === 'trial'
        ? 'premium'
        : chave === 'iq' || chave === 'skool' || chave === 'membro'
          ? 'app_member'
          : 'none'

    window.dispatchEvent(new CustomEvent('mtm-auth-state', {
      detail: {
        userId: user.id,
        email:  user.email ?? '',
        name:   (user as any).full_name ?? (user as any).username ?? '',
        plan,
        // PrimeVerse: Member sem upsell → shell nativo suprime o paywall/IAP
        primeverse: isPrimeverse,
      }
    }))
  }, [mounted, authLoading, user, isAppOnlyUser, isPrimeverse])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab === "studio") {
      const app = searchParams.get("app")
      const path = app
        ? `/app-mobile?tab=apps&app=${app}`
        : "/app-mobile?tab=apps"
      router.replace(path, { scroll: false })
      return
    }
    if (tab && validTabs.includes(tab as (typeof validTabs)[number])) {
      setActiveTab(normalizarTab(tab))
    }
  }, [searchParams, router])

  const socialCategory = searchParams.get("category")

  const handleTabChange = (tab: string) => {
    const nextTab = tab === "studio" ? "apps" : normalizarTab(tab)
    setActiveTab(nextTab)
    const path =
      nextTab === "apps"
        ? "/app-mobile?tab=apps"
        : `/app-mobile?tab=${nextTab}`
    router.push(path, { scroll: false })
  }

  const embeddedApp = searchParams.get("app")

  // Swipe para mudar tab — desativado no separador "Ao vivo" e em cima de &lt;video&gt;.
  // Também DESLIGADO nas apps nativas (têm tab bar própria e o gesto tirava o cliente do WebTrader
  // sem forma de voltar) e em toda a aba Trading (Scanner/Web trader: arrastar é negociar).
  const swipeDesligado = () =>
    activeTab === "live" ||
    activeTab === "scanner" ||
    (activeTab === "apps" && embeddedApp) ||
    (typeof navigator !== "undefined" && /MTMNativeApp|MTMSystemAndroid/i.test(navigator.userAgent))

  const handleTouchStart = (e: React.TouchEvent) => {
    if (swipeDesligado()) return

    const target = e.target as HTMLElement
    if (target.closest("video")) return
    if (target.closest("[data-live-player-guard]")) return
    // No WebTrader arrastar é negociar (pan do gráfico, SL/TP): nunca muda de separador.
    if (target.closest("[data-webtrader]")) return

    const isHorizontalScrollable =
      target.closest('[class*="overflow-x-auto"]') || target.closest('[class*="overflow-x-scroll"]')

    if (!isHorizontalScrollable) {
      setTouchStart(e.targetTouches[0].clientX)
      setTouchEnd(0)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipeDesligado()) return

    const target = e.target as HTMLElement
    if (target.closest("video")) return
    if (target.closest("[data-live-player-guard]")) return

    const isHorizontalScrollable =
      target.closest('[class*="overflow-x-auto"]') || target.closest('[class*="overflow-x-scroll"]')

    if (!isHorizontalScrollable && touchStart !== 0) {
      setTouchEnd(e.targetTouches[0].clientX)
    }
  }

  const handleTouchEnd = () => {
    if (swipeDesligado()) {
      setTouchStart(0)
      setTouchEnd(0)
      return
    }

    if (!touchStart || !touchEnd || touchStart === 0) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    const tabs = ['social', 'chat', 'live', 'apps', 'portfolio', 'scanner']
    const currentIndex = tabs.indexOf(activeTab)

    if (isLeftSwipe && currentIndex < tabs.length - 1) {
      handleTabChange(tabs[currentIndex + 1])
    }

    if (isRightSwipe && currentIndex > 0) {
      handleTabChange(tabs[currentIndex - 1])
    }

    setTouchStart(0)
    setTouchEnd(0)
  }

  // ── Contador de notificações não lidas ────────────────────────────
  useEffect(() => {
    if (!user?.id) return

    const loadUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false)
      setUnreadCount(count ?? 0)
    }

    loadUnread()

    // Real-time: actualizar badge quando chegam novas notificações
    const channel = supabase
      .channel(`app-mobile-notif-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        loadUnread()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  // ── Pedido de permissão web/PWA (delay de 3s) — educado: não re-pede se o
  //    utilizador dispensou nos últimos 7 dias (evita ser abusivo). ───────────
  useEffect(() => {
    if (!userLoaded || isNative) return
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission !== "default") return
    let snoozed = 0
    try { snoozed = Number(localStorage.getItem("mtm_push_prompt_snooze") || 0) } catch {}
    if (Date.now() - snoozed < 7 * 86400000) return
    const t = setTimeout(() => setShowPermissionPrompt(true), 3000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoaded, isNative])

  // ── Cleanup foreground timer ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (foregroundTimerRef.current) clearTimeout(foregroundTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const scrollContainer = contentRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const currentScroll = scrollContainer.scrollTop
      setIsHeaderCollapsed(currentScroll > 16)
    }

    handleScroll()
    scrollContainer.addEventListener("scroll", handleScroll)

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll)
    }
  }, [contentRef])

  if (!mounted || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!user) {
    router.replace("/app-mobile/login")
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <ProtectedPage redirectPath="/app-mobile/login" loadingMessage="A carregar app mobile...">
      <main className="app-mobile-page app-mobile-container bg-gray-900 h-[100dvh] overflow-hidden flex flex-col">
        {/* Onboarding Tutorial (first use) */}
        {userLoaded && showOnboarding && (
          <OnboardingTutorial
            onComplete={markOnboardingDone}
            onTabChange={handleTabChange}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
        )}

        {/* Mobile Sidebar */}
        <MobileSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          currentUser={currentUser}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isAppOnlyUser={isAppOnlyUser}
        />

        {/* Header Mobile — Glass */}
        <div
          className={`app-mobile-navbar sticky top-0 z-40 transition-all duration-300 ${
            shouldReduceSafariEffects()
              ? "bg-gray-900 border-b border-gray-800"
              : "bg-black/50 backdrop-blur-xl border-b border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.05)]"
          }`}
        >
          <div className={`flex items-center justify-between gap-4 px-4 transition-all duration-300 ${isHeaderCollapsed ? "py-2" : "py-3"}`}>
            {/* Menu Button */}
            <button
              data-tutorial="menu"
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-white/20 transition-all active:scale-95 border border-white/10"
              title="Menu"
            >
              <Menu className="w-5 h-5 text-white" />
            </button>

            {/* Logo & Title */}
            <div className="flex items-center gap-3 flex-1">
              <SiteLogo
                width={isHeaderCollapsed ? 32 : 40}
                height={isHeaderCollapsed ? 32 : 40}
                className="rounded-lg transition-all"
                priority
                alt="MTM Logo"
              />
              <div>
                <h1 className={`font-bold text-white transition-all ${isHeaderCollapsed ? "text-sm" : "text-lg"}`}>
                  MTM System
                </h1>
                {!isHeaderCollapsed && (
                  <p className="text-xs text-gray-400 truncate max-w-[150px]">
                    {currentUser?.full_name || currentUser?.username || 'MoreThanMoney'}
                  </p>
                )}
              </div>
            </div>

            {/* Seletor de idioma (mesmo componente do site — 21 línguas, Google Translate) */}
            <div className="shrink-0">
              <LanguageSelectorEnhanced />
            </div>

            {/* Notification Bell */}
            <button
              data-tutorial="notifications"
              onClick={() => {
                setIsNotificationsOpen(true)
                setUnreadCount(0)
              }}
              className="relative w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-white/20 transition-all active:scale-95 border border-white/10"
              title="Notificações"
            >
              <Bell className="w-5 h-5 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-lg">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Área de conteúdo com scroll controlado */}
        <div
          ref={contentRef}
          className="app-mobile-scroll-area flex-1 overflow-y-auto min-h-0"
          // 6rem = barra de separadores WEB (no browser/PWA). Nas apps a barra é nativa; se ela
          // tapar a página, o fim da lista sobe acima dela (--mtm-fundo-livre, globals.css).
          style={{ paddingBottom: "max(6rem, calc(var(--mtm-fundo-livre) + 1.5rem))" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full min-h-[60vh]">
            <TabsContent value="social" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <SocialFeed initialCategory={socialCategory} />
            </TabsContent>

            <TabsContent value="chat" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              {activeTab === "chat" && <ChatChannels initialSlug={channelFromUrl} initialMessageId={searchParams.get("msg")} />}
            </TabsContent>

            <TabsContent value="tap-to-trade" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              {activeTab === "tap-to-trade" && <TapToTradeFeed />}
            </TabsContent>

            <TabsContent value="live" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <LiveSessionsMobile
                isActive={activeTab === "live"}
                initialStreamId={searchParams.get("stream")}
                initialEducatorId={searchParams.get("educator")}
              />
            </TabsContent>

            <TabsContent value="portfolio" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <PortfolioMobile />
            </TabsContent>

            <TabsContent value="mentor" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <MentorMobile />
            </TabsContent>

            <TabsContent value="scanner" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <ScannerTabMobile ativo={activeTab === "scanner"} sub={subScanner} />
            </TabsContent>

            <TabsContent value="apps" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <AppsMobile />
            </TabsContent>

            {/* Montado só quando activo: a vitrine faz dois pedidos ao abrir, e não vale a pena
                fazê-los a quem nunca toca no separador. */}
            <TabsContent value="marketplace" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              {activeTab === "marketplace" && <MarketplaceMobile />}
            </TabsContent>

            <TabsContent value="settings" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <SettingsMobile />
            </TabsContent>

            <TabsContent value="mlm" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <MlmDashboardTab />
            </TabsContent>

            <TabsContent value="trading-alerts" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              {activeTab === "trading-alerts" && <TradingAlertsMobile />}
            </TabsContent>


          </Tabs>
        </div>

        {/* Bottom Navigation - FIXA NO FUNDO */}
        <div
          id="app-mobile-bottom-tabs"
          data-tutorial="bottom-nav"
          className="app-mobile-bottom-tabs fixed bottom-0 left-0 right-0 z-[110] bg-black border-t border-gray-800 px-2 pt-2"
          style={{ display: (mounted && typeof navigator !== 'undefined' && navigator.userAgent.includes('MTMNativeApp')) ? 'none' : "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.25rem", paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            data-tutorial-tab="social"
            onClick={() => handleTabChange("social")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "social"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <Users className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "social" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "social" ? "text-[#D2A63C]" : ""}`}>Feed</div>
          </button>

          <button
            data-tutorial-tab="chat"
            onClick={() => handleTabChange("chat")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "chat"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <MessageSquare className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "chat" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "chat" ? "text-[#D2A63C]" : ""}`}>Chat</div>
          </button>

          <button
            data-tutorial-tab="live"
            onClick={() => handleTabChange("live")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "live"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <Video className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "live" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "live" ? "text-[#D2A63C]" : ""}`}>Ao vivo</div>
          </button>

          <button
            data-tutorial-tab="tap-to-trade"
            onClick={() => handleTabChange("tap-to-trade")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "tap-to-trade"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <Zap className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "tap-to-trade" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "tap-to-trade" ? "text-[#D2A63C]" : ""}`}>T2T</div>
          </button>

          <button
            data-tutorial-tab="portfolio"
            onClick={() => handleTabChange("portfolio")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "portfolio"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <Wallet className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "portfolio" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "portfolio" ? "text-[#D2A63C]" : ""}`}>Portfólio</div>
          </button>

          <button
            data-tutorial-tab="scanner"
            onClick={() => handleTabChange("scanner")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "scanner"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <BarChart3 className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "scanner" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "scanner" ? "text-[#D2A63C]" : ""}`}>Trading</div>
          </button>
        </div>

        {/* ── Notifications Drawer ─────────────────────────────────── */}
        {isNotificationsOpen && (
          <div className="fixed inset-0 z-[200] flex">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsNotificationsOpen(false)}
            />
            {/* Panel */}
            <div
              className="relative ml-auto w-full max-w-sm h-full bg-gray-900 flex flex-col shadow-2xl"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
              {/* Header do drawer */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[#D2A63C]" />
                  <span className="text-white font-semibold text-base">Notificações</span>
                </div>
                <button
                  onClick={() => setIsNotificationsOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {/* Content com scroll */}
              <div className="flex-1 overflow-y-auto p-4">
                <NotificationsPanel
                  onClose={() => setIsNotificationsOpen(false)}
                  className="border-0 bg-transparent"
                  isAppOnlyUser={isAppOnlyUser}
                />
              </div>
            </div>
          </div>
        )}

        {/* Aviso único da mudança das notificações (21/08) — aparece uma vez por dispositivo. */}
      <AvisoNotificacoes onAbrirDefinicoes={() => setActiveTab("settings")} />

      {/* ── Foreground notification banner — glass ───────────────── */}
        {foregroundNotif && (
          <div
            className="fixed left-3 right-3 z-[190] bg-black/60 backdrop-blur-xl border border-white/15 rounded-2xl p-3.5 shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)' }}
          >
            <div className="w-8 h-8 rounded-lg bg-[#D2A63C]/20 border border-[#D2A63C]/30 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-[#D2A63C]" />
            </div>
            <div className="flex-1 min-w-0">
              {foregroundNotif.title && (
                <p className="text-sm font-semibold text-white leading-tight">{foregroundNotif.title}</p>
              )}
              {foregroundNotif.body && (
                <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{foregroundNotif.body}</p>
              )}
            </div>
            <button
              onClick={() => setForegroundNotif(null)}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-gray-300" />
            </button>
          </div>
        )}

        {/* ── Pedido de permissão de notificações — glass ──────────── */}
        {showPermissionPrompt && !isNative && (
          <div
            className="fixed left-3 right-3 z-[180] bg-black/70 backdrop-blur-xl border border-white/12 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-2 duration-300"
            style={{ bottom: 'calc(var(--mtm-fundo-livre) + 84px)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#D2A63C]/15 border border-[#D2A63C]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell className="w-5 h-5 text-[#D2A63C]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white mb-0.5">Activar notificações</p>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                  Alertas de mercado, oportunidades DCA e avisos de subscrição em tempo real.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setShowPermissionPrompt(false)
                      await requestPermission()
                    }}
                    className="flex-1 py-2 bg-[#D2A63C] hover:bg-[#c49a2e] text-black text-sm font-bold rounded-xl transition-colors"
                  >
                    Activar
                  </button>
                  <button
                    onClick={() => {
                      try { localStorage.setItem("mtm_push_prompt_snooze", String(Date.now())) } catch {}
                      setShowPermissionPrompt(false)
                    }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm rounded-xl transition-colors border border-white/10"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </ProtectedPage>
  )
}

export default function AppMobilePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    }>
      <AppMobileContent />
    </Suspense>
  )
}

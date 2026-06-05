"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import ProtectedPage from "@/components/protected-page"
import SocialFeed from "@/components/mobile/social-feed"
import PortfolioMobile from "@/components/mobile/portfolio-mobile"
import ScannerMobile from "@/components/mobile/scanner-mobile"
import NotificationsPanel from "@/components/notifications-panel"
import Image from "next/image"
import {
  Users,
  Wallet,
  BarChart3,
  Loader2,
  Menu,
  LayoutGrid,
  Video,
  MessageSquare,
  Bell,
  X,
} from "lucide-react"
import MobileSidebar from "@/components/mobile/mobile-sidebar"
import LiveSessionsMobile from "@/components/mobile/live-sessions-mobile"
import MentorMobile from "@/components/mobile/mentor-mobile"
import AppsMobile from "@/components/mobile/apps-mobile"
import ChatChannels from "@/components/mobile/chat-channels"
import SettingsMobile from "@/components/mobile/settings-mobile"
import OnboardingTutorial, { useOnboarding } from "@/components/mobile/onboarding-tutorial"
import { useAuth } from "@/contexts/auth-context"
import { useCapacitor } from "@/hooks/use-capacitor"
import { usePushNotifications, type ForegroundMessage } from "@/hooks/use-push-notifications"
import { supabase } from "@/lib/supabase"

function AppMobileContent() {
  const STUDIO_URL = "https://mtmbrandbuilder.lovable.app"
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, isAppOnlyUser, isLoading: authLoading } = useAuth()

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
  const validTabs = ["social", "chat", "portfolio", "scanner", "apps", "live", "mentor", "settings"] as const
  const tabFromUrl = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState(() =>
    tabFromUrl && validTabs.includes(tabFromUrl as (typeof validTabs)[number]) ? tabFromUrl : "social"
  )
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

    // Remover elemento do Google Translate completamente
    const removeGoogleTranslate = () => {
      // Remover elemento principal
      const translateElement = document.getElementById('google_translate_element')
      if (translateElement) {
        translateElement.remove()
      }
      
      // Remover todos os elementos relacionados ao Google Translate
      const selectors = [
        '.skiptranslate',
        '.goog-te-gadget',
        '.goog-te-gadget-simple',
        '[id*=":0.targetLanguage"]',
        '.VIpgJd-ZVi9od-xl07Ob-lTBxed',
        '.goog-te-banner-frame',
        '.goog-te-menu-value'
      ]
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector)
        elements.forEach(el => {
          try {
            el.remove()
          } catch (e) {
            // Ignorar erros ao remover
          }
        })
      })
    }
    
    // Remover imediatamente
    removeGoogleTranslate()
    
    // Usar MutationObserver para remover quando elementos são adicionados
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            const element = node as Element
            if (element.id === 'google_translate_element' || 
                element.classList.contains('skiptranslate') ||
                element.classList.contains('goog-te-gadget')) {
              element.remove()
            }
          }
        })
      })
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
    
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
    
    return () => {
      observer.disconnect()
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

    // Determinar plano web do utilizador
    const category = (user as any).member_category as string | null
    const appOnly = isAppOnlyUser
    let plan = 'none'
    if (category === 'premium' || category === 'vip') {
      plan = 'premium'
    } else if (category === 'standard' || category === 'iq' || category === 'skool' || appOnly) {
      plan = 'app_member'
    }

    window.dispatchEvent(new CustomEvent('mtm-auth-state', {
      detail: {
        userId: user.id,
        email:  user.email ?? '',
        name:   (user as any).full_name ?? (user as any).username ?? '',
        plan,
      }
    }))
  }, [mounted, authLoading, user, isAppOnlyUser])

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
      setActiveTab(tab)
    }
  }, [searchParams, router])

  const socialCategory = searchParams.get("category")

  const handleTabChange = (tab: string) => {
    const nextTab = tab === "studio" ? "apps" : tab
    setActiveTab(nextTab)
    const path =
      nextTab === "apps"
        ? "/app-mobile?tab=apps"
        : `/app-mobile?tab=${nextTab}`
    router.push(path, { scroll: false })
  }

  const embeddedApp = searchParams.get("app")

  // Swipe para mudar tab — desativado no separador "Ao vivo" e em cima de &lt;video&gt;
  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTab === "live" || (activeTab === "apps" && embeddedApp)) return

    const target = e.target as HTMLElement
    if (target.closest("video")) return
    if (target.closest("[data-live-player-guard]")) return

    const isHorizontalScrollable =
      target.closest('[class*="overflow-x-auto"]') || target.closest('[class*="overflow-x-scroll"]')

    if (!isHorizontalScrollable) {
      setTouchStart(e.targetTouches[0].clientX)
      setTouchEnd(0)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (activeTab === "live" || (activeTab === "apps" && embeddedApp)) return

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
    if (activeTab === "live" || (activeTab === "apps" && embeddedApp)) {
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

  // ── Pedido de permissão web/PWA (delay de 3s, apenas uma vez) ─────
  useEffect(() => {
    if (!userLoaded || isNative) return
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission === "default") {
      const t = setTimeout(() => setShowPermissionPrompt(true), 3000)
      return () => clearTimeout(t)
    }
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
    router.replace("/login?redirect=/app-mobile")
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/app-mobile" loadingMessage="A carregar app mobile...">
      <main className="app-mobile-page bg-gray-900 min-h-screen flex flex-col">
        {/* Onboarding Tutorial (first use) */}
        {userLoaded && showOnboarding && (
          <OnboardingTutorial
            onComplete={markOnboardingDone}
            onTabChange={handleTabChange}
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

        {/* Header Mobile - Simplified */}
        <div
          className="app-mobile-navbar sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 transition-all duration-300"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className={`flex items-center justify-between gap-4 px-4 transition-all duration-300 ${isHeaderCollapsed ? "py-2" : "py-3"}`}>
            {/* Menu Button */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-gray-800/80 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-gray-700 transition-all active:scale-95"
              title="Menu"
            >
              <Menu className="w-5 h-5 text-white" />
            </button>

            {/* Logo & Title */}
            <div className="flex items-center gap-3 flex-1">
              <Image
                src="/logo-new.png"
                alt="MTM Logo"
                width={isHeaderCollapsed ? 32 : 40}
                height={isHeaderCollapsed ? 32 : 40}
                className="rounded-lg transition-all"
                priority
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

            {/* Notification Bell */}
            <button
              onClick={() => {
                setIsNotificationsOpen(true)
                setUnreadCount(0)
              }}
              className="relative w-10 h-10 bg-gray-800/80 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-gray-700 transition-all active:scale-95"
              title="Notificações"
            >
              <Bell className="w-5 h-5 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Área de conteúdo com scroll controlado */}
        <div
          ref={contentRef}
          className="app-mobile-scroll-area flex-1 overflow-y-auto pb-24 min-h-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full min-h-[60vh]">
            <TabsContent value="social" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <SocialFeed initialCategory={socialCategory} />
            </TabsContent>

            <TabsContent value="chat" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <ChatChannels />
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
              <ScannerMobile />
            </TabsContent>

            <TabsContent value="apps" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <AppsMobile />
            </TabsContent>

            <TabsContent value="settings" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <SettingsMobile />
            </TabsContent>

          </Tabs>
        </div>

        {/* Bottom Navigation - FIXA NO FUNDO */}
        <div
          id="app-mobile-bottom-tabs"
          className="app-mobile-bottom-tabs fixed bottom-0 left-0 right-0 z-[110] bg-black border-t border-gray-800 px-2 pt-2"
          style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.25rem", paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
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
            onClick={() => handleTabChange("apps")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "apps"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <LayoutGrid className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "apps" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "apps" ? "text-[#D2A63C]" : ""}`}>Apps</div>
          </button>

          <button
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
            onClick={() => handleTabChange("scanner")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "scanner"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <BarChart3 className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "scanner" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "scanner" ? "text-[#D2A63C]" : ""}`}>Scanner</div>
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
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Foreground notification banner ───────────────────────── */}
        {foregroundNotif && (
          <div
            className="fixed left-4 right-4 z-[190] bg-gray-800 border border-[#D2A63C]/30 rounded-xl p-3 shadow-xl flex items-start gap-3 transition-all"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
          >
            <Bell className="w-5 h-5 text-[#D2A63C] flex-shrink-0 mt-0.5" />
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
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        )}

        {/* ── Pedido de permissão de notificações (web/PWA) ────────── */}
        {showPermissionPrompt && !isNative && (
          <div
            className="fixed left-4 right-4 z-[180] bg-gray-800 border border-[#D2A63C]/20 rounded-xl p-4 shadow-xl"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
          >
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-[#D2A63C] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white mb-1">Activar notificações</p>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                  Recebe alertas de mercado, oportunidades DCA e avisos de subscrição em tempo real.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setShowPermissionPrompt(false)
                      await requestPermission()
                    }}
                    className="flex-1 py-2 bg-[#D2A63C] hover:bg-[#c49a2e] text-black text-sm font-semibold rounded-lg transition-colors"
                  >
                    Activar
                  </button>
                  <button
                    onClick={() => setShowPermissionPrompt(false)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
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

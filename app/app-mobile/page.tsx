"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import ProtectedPage from "@/components/protected-page"
import SocialFeed from "@/components/mobile/social-feed"
import PortfolioMobile from "@/components/mobile/portfolio-mobile"
import ScannerMobile from "@/components/mobile/scanner-mobile"
import Image from "next/image"
import {
  Users,
  Wallet,
  BarChart3,
  Loader2,
  Menu,
  Rocket,
  ExternalLink,
  Video,
} from "lucide-react"
import MobileSidebar from "@/components/mobile/mobile-sidebar"
import LiveSessionsMobile from "@/components/mobile/live-sessions-mobile"
import MentorMobile from "@/components/mobile/mentor-mobile"
import { useAuth } from "@/contexts/auth-context"

function AppMobileContent() {
  const STUDIO_URL = "https://mtmbrandbuilder.lovable.app"
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("social")
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [userLoaded, setUserLoaded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    
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

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && ["social", "portfolio", "scanner", "studio", "live", "mentor"].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    router.push(`/app-mobile?tab=${tab}`, { scroll: false })
  }

  // Swipe para mudar tab — desativado no separador "Ao vivo" e em cima de &lt;video&gt;
  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTab === "live") return

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
    if (activeTab === "live") return

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
    if (activeTab === "live") {
      setTouchStart(0)
      setTouchEnd(0)
      return
    }

    if (!touchStart || !touchEnd || touchStart === 0) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    const tabs = ['social', 'live', 'mentor', 'studio', 'portfolio', 'scanner']
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

  if (!mounted || authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/app-mobile" loadingMessage="A carregar app mobile...">
      <main className="app-mobile-page bg-gray-900 min-h-screen flex flex-col">
        {/* Mobile Sidebar */}
        <MobileSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          currentUser={currentUser}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        {/* Header Mobile - Simplified */}
        <div
          className={`app-mobile-navbar sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 transition-all duration-300 ${
            isHeaderCollapsed ? "py-2" : "py-4"
          }`}
        >
          <div className="flex items-center justify-between gap-4 px-4">
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
              <SocialFeed />
            </TabsContent>

            <TabsContent value="live" className="mt-0 min-h-[60vh] data-[state=inactive]:hidden">
              <LiveSessionsMobile />
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

            <TabsContent value="studio" className="mt-0 data-[state=inactive]:hidden">
              <div className="relative w-full bg-black">
                <a
                  href={STUDIO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-3 top-3 z-10 rounded-md border border-[#D2A63C]/40 bg-black/70 px-2 py-1 text-[11px] text-[#D2A63C] inline-flex items-center gap-1 backdrop-blur-sm hover:opacity-80"
                >
                  Abrir fora
                  <ExternalLink className="w-3 h-3" />
                </a>
                <iframe
                  src={STUDIO_URL}
                  title="MTM Studio"
                  className="w-full bg-black"
                  style={{ height: "calc(100dvh - 9.5rem)" }}
                  loading="lazy"
                />
              </div>
            </TabsContent>

          </Tabs>
        </div>

        {/* Bottom Navigation - FIXA NO FUNDO */}
        <div
          id="app-mobile-bottom-tabs"
          className="app-mobile-bottom-tabs fixed bottom-0 left-0 right-0 z-[110] bg-black border-t border-gray-800 px-2 py-2"
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.25rem" }}
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
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "social" ? "text-[#D2A63C]" : ""}`}>Social</div>
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
            onClick={() => handleTabChange("studio")}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === "studio"
                ? "bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]"
                : "text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent"
            }`}
          >
            <Rocket className={`w-5 h-5 mx-auto mb-0.5 ${activeTab === "studio" ? "text-[#D2A63C]" : ""}`} />
            <div className={`text-[10px] font-medium leading-tight ${activeTab === "studio" ? "text-[#D2A63C]" : ""}`}>Studio</div>
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

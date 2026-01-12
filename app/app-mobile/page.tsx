"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ProtectedPage from "@/components/protected-page"
import SocialFeed from "@/components/mobile/social-feed"
import PortfolioMobile from "@/components/mobile/portfolio-mobile"
import ScannerMobile from "@/components/mobile/scanner-mobile"
import MindsetMobile from "@/components/mobile/mindset-mobile"
import FitnessMobile from "@/components/mobile/fitness-mobile"
import { supabase } from "@/lib/supabase"
import { clearCachedSession } from "@/lib/auth-cache"
import Image from "next/image"
import {
  Users,
  Wallet,
  BarChart3,
  Brain,
  Dumbbell,
  LogOut,
  Loader2,
  Menu,
} from "lucide-react"
import MobileSidebar from "@/components/mobile/mobile-sidebar"
import { useAuthenticatedSession } from "@/hooks/use-authenticated-session"

function AppMobileContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAuthenticated, userId, loading: authLoading } = useAuthenticatedSession()
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
    // Só carregar user uma vez quando autenticado
    if (mounted && !authLoading && isAuthenticated && userId && !userLoaded) {
      loadUser()
      setUserLoaded(true)
    }
  }, [mounted, authLoading, isAuthenticated, userId, userLoaded])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && ["social", "portfolio", "scanner", "fitness", "mindset"].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const loadUser = async () => {
    try {
      if (!userId) return

      // Tentar buscar perfil via API primeiro (mais confiável)
      try {
        const apiResponse = await fetch(`/api/profile/get?userId=${userId}`, {
          credentials: 'include'
        })
        
        if (apiResponse.ok) {
          const apiData = await apiResponse.json()
          if (apiData.profile) {
            console.log('✅ [APP-MOBILE] Perfil carregado via API')
            setCurrentUser(apiData.profile)
            return
          }
        }
      } catch (apiError) {
        console.warn('⚠️ [APP-MOBILE] Erro ao carregar perfil via API, tentando direto:', apiError)
      }

      // Fallback: tentar Supabase direto
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        
        if (error) {
          console.error('❌ [APP-MOBILE] Erro ao carregar perfil:', error)
          // Usar dados básicos da sessão como último recurso
          setCurrentUser({
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Utilizador',
            username: session.user.email?.split('@')[0] || 'user',
            avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
            user_type: 'member',
            is_active: true
          })
        } else {
          setCurrentUser(profile)
        }
      }
    } catch (error) {
      console.error('❌ [APP-MOBILE] Erro crítico ao carregar user:', error)
    }
  }

  const handleLogout = async () => {
    clearCachedSession()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    router.push(`/app-mobile?tab=${tab}`, { scroll: false })
  }

  // Detectar swipe para mudar tabs
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    const isHorizontalScrollable = target.closest('[class*="overflow-x-auto"]') || 
                                    target.closest('[class*="overflow-x-scroll"]')
    
    if (!isHorizontalScrollable) {
      setTouchStart(e.targetTouches[0].clientX)
      setTouchEnd(0)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    const isHorizontalScrollable = target.closest('[class*="overflow-x-auto"]') || 
                                    target.closest('[class*="overflow-x-scroll"]')
    
    if (!isHorizontalScrollable && touchStart !== 0) {
      setTouchEnd(e.targetTouches[0].clientX)
    }
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd || touchStart === 0) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    const tabs = ['social', 'portfolio', 'scanner', 'mindset', 'fitness']
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

  if (!mounted || authLoading) {
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
          className="app-mobile-scroll-area flex-1 overflow-y-auto pb-24"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsContent value="social" className="mt-0 h-full">
              <SocialFeed />
            </TabsContent>

            <TabsContent value="portfolio" className="mt-0 h-full">
              <PortfolioMobile />
            </TabsContent>

            <TabsContent value="scanner" className="mt-0 h-full">
              <ScannerMobile />
            </TabsContent>

            <TabsContent value="mindset" className="mt-0 h-full">
              <MindsetMobile />
            </TabsContent>

            <TabsContent value="fitness" className="mt-0 h-full">
              <FitnessMobile />
            </TabsContent>
          </Tabs>
        </div>

        {/* Bottom Navigation - FIXA NO FUNDO */}
        <div 
          className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-gray-800 px-2 py-2" 
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}
        >
          <button
            onClick={() => handleTabChange('social')}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === 'social'
                ? 'bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]'
                : 'text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent'
            }`}
          >
            <Users className={`w-5 h-5 mx-auto mb-1 ${activeTab === 'social' ? 'text-[#D2A63C]' : ''}`} />
            <div className={`text-[10px] font-medium ${activeTab === 'social' ? 'text-[#D2A63C]' : ''}`}>Social</div>
          </button>
          
          <button
            onClick={() => handleTabChange('portfolio')}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === 'portfolio'
                ? 'bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]'
                : 'text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent'
            }`}
          >
            <Wallet className={`w-5 h-5 mx-auto mb-1 ${activeTab === 'portfolio' ? 'text-[#D2A63C]' : ''}`} />
            <div className={`text-[10px] font-medium ${activeTab === 'portfolio' ? 'text-[#D2A63C]' : ''}`}>Portfólio</div>
          </button>
          
          <button
            onClick={() => handleTabChange('scanner')}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === 'scanner'
                ? 'bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]'
                : 'text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent'
            }`}
          >
            <BarChart3 className={`w-5 h-5 mx-auto mb-1 ${activeTab === 'scanner' ? 'text-[#D2A63C]' : ''}`} />
            <div className={`text-[10px] font-medium ${activeTab === 'scanner' ? 'text-[#D2A63C]' : ''}`}>Scanner</div>
          </button>
          
          <button
            onClick={() => handleTabChange('mindset')}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === 'mindset'
                ? 'bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]'
                : 'text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent'
            }`}
          >
            <Brain className={`w-5 h-5 mx-auto mb-1 ${activeTab === 'mindset' ? 'text-[#D2A63C]' : ''}`} />
            <div className={`text-[10px] font-medium ${activeTab === 'mindset' ? 'text-[#D2A63C]' : ''}`}>Mindset</div>
          </button>
          
          <button
            onClick={() => handleTabChange('fitness')}
            className={`py-3 rounded-lg transition-all relative ${
              activeTab === 'fitness'
                ? 'bg-black/80 text-[#D2A63C] shadow-[0_0_20px_rgba(210,166,60,0.6),0_4px_12px_rgba(210,166,60,0.4)] border-2 border-[#D2A63C]'
                : 'text-gray-300 hover:bg-[#D2A63C]/20 border-2 border-transparent'
            }`}
          >
            <Dumbbell className={`w-5 h-5 mx-auto mb-1 ${activeTab === 'fitness' ? 'text-[#D2A63C]' : ''}`} />
            <div className={`text-[10px] font-medium ${activeTab === 'fitness' ? 'text-[#D2A63C]' : ''}`}>Fitness</div>
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

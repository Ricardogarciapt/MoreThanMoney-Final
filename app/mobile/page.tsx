"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ProtectedPage from "@/components/protected-page"
import SocialFeed from "@/components/mobile/social-feed"
import PortfolioMobile from "@/components/mobile/portfolio-mobile"
import ScannerMobile from "@/components/mobile/scanner-mobile"
import { supabase } from "@/lib/supabase"
import { clearCachedSession } from "@/lib/auth-cache"
import {
  Users,
  Wallet,
  BarChart3,
  LogOut,
  User,
} from "lucide-react"

export default function MobilePage() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("social")
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    setMounted(true)
    
    // Registrar service worker para notificações push (PWA)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('✅ [MOBILE] Service Worker registrado:', registration.scope)
        })
        .catch((error) => {
          console.warn('⚠️ [MOBILE] Erro ao registrar service worker:', error)
        })
    }
  }, [])

  useEffect(() => {
    if (mounted) {
      loadUser()
    }
  }, [mounted])

  const loadUser = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.log('❌ [MOBILE] Sem sessão')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.error('❌ [MOBILE] Erro ao carregar perfil:', profileError)
        return
      }

      setCurrentUser(profile)
      console.log('✅ [MOBILE] Utilizador carregado:', profile.email)
    } catch (error) {
      console.error('❌ [MOBILE] Erro:', error)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      await clearCachedSession()
      window.location.href = '/login'
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  // Navegação por swipe (touch)
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.touches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const minSwipeDistance = 50

    if (distance > minSwipeDistance) {
      // Swipe esquerda - próximo tab
      const tabs = ["social", "portfolio", "scanner"]
      const currentIndex = tabs.indexOf(activeTab)
      if (currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1])
      }
    } else if (distance < -minSwipeDistance) {
      // Swipe direita - tab anterior
      const tabs = ["social", "portfolio", "scanner"]
      const currentIndex = tabs.indexOf(activeTab)
      if (currentIndex > 0) {
        setActiveTab(tabs[currentIndex - 1])
      }
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <ProtectedPage>
      <div 
        className="h-screen flex flex-col bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header Clean - Minimalista */}
        <header className="sticky top-0 z-50 bg-black border-b border-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Logo/Title */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-sm">MTM</span>
              </div>
              <h1 className="text-white font-bold text-lg">MoreThanMoney</h1>
            </div>

            {/* User Avatar/Logout */}
            {currentUser && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#D2A63C]/20 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-[#D2A63C]" />
                </div>
                <button
                  onClick={handleLogout}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Sair"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Conteúdo Principal */}
        <main className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsContent value="social" className="flex-1 overflow-y-auto m-0">
              <SocialFeed />
            </TabsContent>
            
            <TabsContent value="portfolio" className="flex-1 overflow-y-auto m-0">
              <PortfolioMobile />
            </TabsContent>
            
            <TabsContent value="scanner" className="flex-1 overflow-y-auto m-0">
              <ScannerMobile />
            </TabsContent>
          </Tabs>
        </main>

        {/* Bottom Navigation - Clean */}
        <nav className="sticky bottom-0 bg-black border-t border-gray-800">
          <TabsList className="w-full h-16 grid grid-cols-3 gap-0 bg-transparent">
            <TabsTrigger
              value="social"
              className="flex flex-col gap-1 data-[state=active]:text-[#D2A63C] data-[state=active]:bg-transparent"
            >
              <Users className="w-6 h-6" />
              <span className="text-xs">Social</span>
            </TabsTrigger>
            
            <TabsTrigger
              value="portfolio"
              className="flex flex-col gap-1 data-[state=active]:text-[#D2A63C] data-[state=active]:bg-transparent"
            >
              <Wallet className="w-6 h-6" />
              <span className="text-xs">Portfolio</span>
            </TabsTrigger>
            
            <TabsTrigger
              value="scanner"
              className="flex flex-col gap-1 data-[state=active]:text-[#D2A63C] data-[state=active]:bg-transparent"
            >
              <BarChart3 className="w-6 h-6" />
              <span className="text-xs">Scanner</span>
            </TabsTrigger>
          </TabsList>
        </nav>
      </div>
    </ProtectedPage>
  )
}

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import UserDropdown from "@/components/user-dropdown"
import NotificationsBell from "@/components/notifications-bell"
import LanguageSelectorEnhanced from "@/components/language-selector-enhanced"
import LoginModal from "@/components/login-modal"
import { Menu, X, ChevronDown, Home, GraduationCap, TrendingUp, Rocket, Zap } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

export default function Navbar() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isEducacaoOpen, setIsEducacaoOpen] = useState(false)
  const [isTradingOpen, setIsTradingOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const { isAuthenticated } = useAuth()

  // Detectar scroll para mudar estilo
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navigation = [
    { 
      name: "Início", 
      href: "/new-landing",
      icon: Home
    },
    {
      name: "Educação",
      href: "/iqonic",
      icon: GraduationCap,
      submenu: [
        { name: "Apresentação IQONIC", href: "/iqonic" },
        { name: "IQonic Academy", href: "https://iqonic.vip", external: true },
        { name: "Educação MTM", href: "/mtm" },
        { name: "AI Com Os Gemeos", href: "https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b", external: true },
        { name: "BackOffice IQ", href: "https://user.iqonic.life", external: true },
      ],
    },
    {
      name: "Trading",
      href: "/swipetotrade",
      icon: TrendingUp,
      submenu: [
        { name: "IQ Sync - Configurar", href: "/swipetotrade" },
        { name: "Ideias de Trading", href: "/trading-ideas" },
        { name: "Os nossos Scanners", href: "/scanner" },
        { name: "Scanner ao Vivo", href: "/scanner-access" },
        { name: "Automatização", href: "/automation" },
        { name: "Portefólios", href: "/portfolios" },
      ],
    },
    { 
      name: "Onboarding", 
      href: "/onboarding",
      icon: Rocket
    },
    { 
      name: "Início Rápido", 
      href: "/fast-start",
      icon: Zap
    },
  ]

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const closeMenu = () => {
    setIsMenuOpen(false)
    setIsEducacaoOpen(false)
    setIsTradingOpen(false)
  }

  const openLoginModal = () => {
    setIsLoginModalOpen(true)
  }

  const closeLoginModal = () => {
    setIsLoginModalOpen(false)
  }

  const isActive = (href: string) => {
    if (href === "/new-landing") {
      return pathname === "/" || pathname === "/new-landing"
    }
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-black/95 backdrop-blur-lg border-b border-mtm-primary/30 shadow-lg' 
          : 'bg-gradient-to-b from-black/95 via-black/90 to-transparent backdrop-blur-sm'
      }`}>
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16 md:h-20">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link href="/new-landing" className="flex items-center group">
                <Image
                  src="/logo-new.png"
                  alt="More Than Money"
                  width={180}
                  height={60}
                  className="h-10 md:h-14 w-auto transition-transform group-hover:scale-105"
                  priority
                />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex lg:items-center lg:space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return item.submenu ? (
                  <div
                    key={item.name}
                    className="relative group"
                    onMouseEnter={() => {
                      if (item.name === "Educação") setIsEducacaoOpen(true)
                      if (item.name === "Trading") setIsTradingOpen(true)
                    }}
                    onMouseLeave={() => {
                      if (item.name === "Educação") setIsEducacaoOpen(false)
                      if (item.name === "Trading") setIsTradingOpen(false)
                    }}
                  >
                    <button
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                        isActive(item.href)
                          ? 'text-mtm-primary bg-mtm-primary/10 shadow-lg shadow-mtm-primary/20'
                          : 'text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${
                        (item.name === "Educação" && isEducacaoOpen) || 
                        (item.name === "Trading" && isTradingOpen)
                          ? 'rotate-180' 
                          : ''
                      }`} />
                    </button>

                    {((item.name === "Educação" && isEducacaoOpen) ||
                      (item.name === "Trading" && isTradingOpen)) && (
                      <div className="absolute left-0 mt-2 w-56 rounded-xl shadow-2xl bg-black/95 backdrop-blur-lg border border-mtm-primary/30 ring-1 ring-mtm-primary/20 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="py-2">
                          {item.submenu.map((subitem) => (
                            <Link
                              key={subitem.name}
                              href={subitem.href}
                              target={subitem.external ? "_blank" : undefined}
                              rel={subitem.external ? "noopener noreferrer" : undefined}
                              className={`block px-4 py-2.5 text-sm transition-all duration-200 ${
                                isActive(subitem.href)
                                  ? "text-mtm-primary bg-mtm-primary/10 border-l-2 border-mtm-primary"
                                  : "text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5 hover:border-l-2 hover:border-mtm-primary/50"
                              }`}
                            >
                              {subitem.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                      isActive(item.href)
                        ? 'text-mtm-primary bg-mtm-primary/10 shadow-lg shadow-mtm-primary/20'
                        : 'text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>

            {/* Desktop Right Side */}
            <div className="hidden lg:flex lg:items-center lg:space-x-3">
              <LanguageSelectorEnhanced />
              {isAuthenticated && <NotificationsBell />}
              <UserDropdown />
            </div>

            {/* Mobile menu button */}
            <div className="lg:hidden flex items-center space-x-2">
              {isAuthenticated && <NotificationsBell />}
              <button
                onClick={toggleMenu}
                className="inline-flex items-center justify-center p-2 rounded-lg text-mtm-primary hover:bg-mtm-primary/10 transition-colors"
                aria-label="Menu"
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu - Full Screen Overlay */}
        {isMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/95 backdrop-blur-lg">
            <div className="flex flex-col h-full">
              {/* Mobile Header */}
              <div className="flex items-center justify-between p-4 border-b border-mtm-primary/30">
                <Image
                  src="/logo-new.png"
                  alt="More Than Money"
                  width={150}
                  height={50}
                  className="h-10 w-auto"
                />
                <button
                  onClick={closeMenu}
                  className="p-2 rounded-lg text-mtm-primary hover:bg-mtm-primary/10"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Mobile Navigation */}
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
                {navigation.map((item) => {
                  const Icon = item.icon
                  return item.submenu ? (
                    <div key={item.name} className="space-y-1">
                      <button
                        onClick={() => {
                          if (item.name === "Educação") setIsEducacaoOpen(!isEducacaoOpen)
                          if (item.name === "Trading") setIsTradingOpen(!isTradingOpen)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium transition-all ${
                          isActive(item.href)
                            ? "text-mtm-primary bg-mtm-primary/10 border border-mtm-primary/30"
                            : "text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="h-5 w-5" />
                          <span>{item.name}</span>
                        </div>
                        <ChevronDown 
                          className={`h-5 w-5 transition-transform ${
                            (item.name === "Educação" && isEducacaoOpen) || 
                            (item.name === "Trading" && isTradingOpen)
                              ? 'rotate-180' 
                              : ''
                          }`} 
                        />
                      </button>
                      {((item.name === "Educação" && isEducacaoOpen) || 
                        (item.name === "Trading" && isTradingOpen)) && (
                        <div className="pl-4 space-y-1 border-l-2 border-mtm-primary/30 ml-4">
                          {item.submenu.map((subitem) => (
                            <Link
                              key={subitem.name}
                              href={subitem.href}
                              target={subitem.external ? "_blank" : undefined}
                              rel={subitem.external ? "noopener noreferrer" : undefined}
                              onClick={closeMenu}
                              className={`block px-4 py-2.5 rounded-lg text-sm transition-all ${
                                isActive(subitem.href)
                                  ? "text-mtm-primary bg-mtm-primary/10"
                                  : "text-gray-400 hover:text-mtm-primary hover:bg-mtm-primary/5"
                              }`}
                            >
                              {subitem.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={closeMenu}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-base font-medium transition-all ${
                        isActive(item.href)
                          ? "text-mtm-primary bg-mtm-primary/10 border border-mtm-primary/30"
                          : "text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5 border border-transparent"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </div>

              {/* Mobile Footer */}
              <div className="border-t border-mtm-primary/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <LanguageSelectorEnhanced />
                </div>
                <UserDropdown />
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Spacer para navbar fixa */}
      <div className="h-16 md:h-20" />

      {/* Login Modal */}
      <LoginModal isOpen={isLoginModalOpen} onClose={closeLoginModal} />
    </>
  )
}

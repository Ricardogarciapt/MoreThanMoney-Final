"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import UserDropdown from "@/components/user-dropdown"
import NotificationsBell from "@/components/notifications-bell"
// import GoogleTranslate from "@/components/google-translate" // Desativado temporariamente
import LanguageSelectorEnhanced from "@/components/language-selector-enhanced"
import LoginModal from "@/components/login-modal"
import { Menu, X, ChevronDown } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"

export default function Navbar() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isScannerSubmenuOpen, setIsScannerSubmenuOpen] = useState(false)
  const [isIqonicSubmenuOpen, setIsIqonicSubmenuOpen] = useState(false)
  const [isEducacaoMtmSubmenuOpen, setIsEducacaoMtmSubmenuOpen] = useState(false)
  const [mobileEducacaoOpen, setMobileEducacaoOpen] = useState(false)
  const [mobileTradingOpen, setMobileTradingOpen] = useState(false)
  const [showAscendiaPopup, setShowAscendiaPopup] = useState(false)
  const { isAuthenticated, user } = useAuth()

  const navigation = [
    { name: "Início", href: "/new-landing" },
    {
      name: "Educação",
      href: "/iqonic",
      submenu: [
        { name: "Apresentação IQONIC", href: "/iqonic" },
        { name: "IQonic Academy", href: "https://iqonic.vip" },
        { name: "Sistema Ascendia", href: "#ascendia", isAscendia: true },
        { name: "Educação MTM", href: "/mtm" },
        { name: "AI Com Os Gemeos", href: "https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b" },
        { name: "BackOffice IQ", href: "https://user.iqonic.life" },
      ],
    },
    {
      name: "Trading",
      href: "/swipetotrade",
      submenu: [
        { name: "IQ Sync - Configurar", href: "/swipetotrade" },
        { name: "Ideias de Trading", href: "/trading-ideas" },
        { name: "Os nossos Scanners", href: "/scanner" },
        { name: "Scanner ao Vivo", href: "/scanner-access" },
        { name: "Automatização", href: "/automation" },
        { name: "Portefólios", href: "/portfolios" },
      ],
    },
    { name: "Onboarding", href: "/onboarding" },
    { name: "Início Rápido", href: "/fast-start" },
  ]

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const openLoginModal = () => {
    setIsLoginModalOpen(true)
  }

  const closeLoginModal = () => {
    setIsLoginModalOpen(false)
  }

  return (
    <nav className="bg-[#BB8525]/90 backdrop-blur-md border-b border-[#D2A63C]/30 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/new-landing" className="flex items-center">
              <Image
                src="https://www.morethanmoney.pt/logo-new.png"
                alt="More Than Money - A GamePlan"
                width={450}
                height={150}
                className="h-12 md:h-16 w-auto"
                priority
                onError={() => {
                  console.error("Error loading logo image")
                  // Find the fallback text element and show it
                  const fallbackElement = document.querySelector(".navbar-logo-fallback")
                  if (fallbackElement) {
                    fallbackElement.classList.remove("hidden")
                  }
                }}
              />
              <span className="hidden navbar-logo-fallback text-[#F3F3E6] text-xl font-bold ml-2">More Than Money</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex lg:items-center lg:space-x-1">
            {navigation.map((item) =>
              item.submenu ? (
                <div
                  key={item.name}
                  className="relative"
                  onMouseEnter={() => {
                    if (item.name === "Educação") setIsIqonicSubmenuOpen(true)
                    if (item.name === "Trading") setIsScannerSubmenuOpen(true)
                  }}
                  onMouseLeave={() => {
                    if (item.name === "Educação") setIsIqonicSubmenuOpen(false)
                    if (item.name === "Trading") setIsScannerSubmenuOpen(false)
                  }}
                >
                  <button
                    className="px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 whitespace-nowrap text-gray-300 hover:text-[#F3F3E6] hover:bg-[#D2A63C]/5"
                  >
                    <span>{item.name}</span>
                    <ChevronDown className="h-4 w-4 transition-transform" />
                  </button>

                  {((item.name === "Educação" && isIqonicSubmenuOpen) ||
                    (item.name === "Trading" && isScannerSubmenuOpen)) && (
                    <div className="absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-black/90 border border-mtm-primary500/30 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                      <div className="py-1">
                        {item.submenu.map((subitem) => (
                          (subitem as any).submenu ? (
                            <div key={subitem.name} className="relative group">
                              <div className="block px-4 py-2 text-sm text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5 cursor-pointer">
                                {subitem.name}
                                <ChevronDown className="inline-block w-3 h-3 ml-1" />
                              </div>
                              <div className="absolute left-full top-0 ml-1 w-48 rounded-md shadow-lg bg-black/90 border border-mtm-primary500/30 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                                <div className="py-1">
                                  {(subitem as any).submenu.map((nestedItem: any) => (
                                    <Link
                                      key={nestedItem.name}
                                      href={nestedItem.href}
                                      className={`block px-4 py-2 text-sm transition-colors ${
                                        pathname === nestedItem.href
                                          ? "text-mtm-primary-500 bg-gold-500/10"
                                          : "text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                                      }`}
                                    >
                                      {nestedItem.name}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (subitem as any).isAscendia ? (
                            <button
                              key={subitem.name}
                              onClick={() => setShowAscendiaPopup(true)}
                              className="block w-full text-left px-4 py-2 text-sm transition-colors text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                            >
                              {subitem.name}
                            </button>
                          ) : (
                            <Link
                              key={subitem.name}
                              href={subitem.href}
                              className={`block px-4 py-2 text-sm transition-colors ${
                                pathname === subitem.href
                                  ? "text-mtm-primary-500 bg-gold-500/10"
                                  : "text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                              }`}
                            >
                              {subitem.name}
                            </Link>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div key={item.name} className="relative">
                  <Link
                    href={item.href}
                    className="px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap text-gray-300 hover:text-[#F3F3E6] hover:bg-[#D2A63C]/5"
                  >
                    {item.name}
                  </Link>
                </div>
              ),
            )}
          </div>

          {/* Login/User Area */}
          <div className="hidden md:flex md:items-center md:space-x-3">
            <LanguageSelectorEnhanced />
            {/* <GoogleTranslate /> */}
            {isAuthenticated && <NotificationsBell />}
            <UserDropdown />
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-9 rounded-md px-3 text-[#F3F3E6] hover:text-[#D2A63C] hover:bg-[#D2A63C]/10"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="p-2 md:p-4 space-y-1 sm:px-3 bg-black/90 border-b border-mtm-primary500/30">
            {navigation.map((item) =>
              item.submenu ? (
                <div key={item.name} className="space-y-1">
                  <button
                    onClick={() => {
                      if (item.name === "Educação") setMobileEducacaoOpen(!mobileEducacaoOpen)
                      if (item.name === "Trading") setMobileTradingOpen(!mobileTradingOpen)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-base font-medium ${
                      pathname === item.href || pathname.startsWith(item.href + "/")
                        ? "text-mtm-primary-500 bg-gold-500/10"
                        : "text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                    }`}
                  >
                    <span>{item.name}</span>
                    <ChevronDown 
                      className={`w-4 h-4 transition-transform ${
                        (item.name === "Educação" && mobileEducacaoOpen) || 
                        (item.name === "Trading" && mobileTradingOpen) 
                          ? 'rotate-180' 
                          : ''
                      }`} 
                    />
                  </button>
                  {((item.name === "Educação" && mobileEducacaoOpen) || 
                    (item.name === "Trading" && mobileTradingOpen)) && (
                    <div className="pl-4 space-y-1 border-l border-mtm-primary500/30 ml-3">
                      {item.submenu.map((subitem) => (
                      (subitem as any).submenu ? (
                        <div key={subitem.name} className="space-y-1">
                          <div className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300">
                            {subitem.name}
                          </div>
                          <div className="pl-4 space-y-1 border-l border-mtm-primary500/30 ml-3">
                            {(subitem as any).submenu.map((nestedItem: any) => (
                              <Link
                                key={nestedItem.name}
                                href={nestedItem.href}
                                className={`block px-3 py-2 rounded-md text-xs font-medium ${
                                  pathname === nestedItem.href
                                    ? "text-mtm-primary-500 bg-gold-500/10"
                                    : "text-gray-400 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                                }`}
                                onClick={() => setIsMenuOpen(false)}
                              >
                                {nestedItem.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : (subitem as any).isAscendia ? (
                        <button
                          key={subitem.name}
                          onClick={() => {
                            setIsMenuOpen(false)
                            setShowAscendiaPopup(true)
                          }}
                          className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                        >
                          {subitem.name}
                        </button>
                      ) : (
                        <Link
                          key={subitem.name}
                          href={subitem.href}
                          className={`block px-3 py-2 rounded-md text-sm font-medium ${
                            pathname === subitem.href
                              ? "text-mtm-primary-500 bg-gold-500/10"
                              : "text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                          }`}
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {subitem.name}
                        </Link>
                      )
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === item.href
                      ? "text-mtm-primary-500 bg-gold-500/10"
                      : "text-gray-300 hover:text-mtm-primary-400 hover:bg-gold-500/5"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ),
            )}
            {/* User Dropdown Mobile */}
            <div className="mt-4 px-3 py-2 border-t border-mtm-primary500/30">
              {isAuthenticated && (
                <div className="px-3 py-2">
                  <NotificationsBell />
                </div>
              )}
              <UserDropdown />
            </div>
            
            {/* Google Translate Mobile */}
            <div className="mt-2 px-3 py-2 border-t border-mtm-primary500/30">
              <div className="text-xs text-gray-400 mb-2">Traduzir Página:</div>
              <LanguageSelectorEnhanced />
              {/* <GoogleTranslate /> */}
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal isOpen={isLoginModalOpen} onClose={closeLoginModal} />
      
      {/* Ascendia Popup */}
      {showAscendiaPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-[#D2A63C] rounded-xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-200">
            {/* Close button */}
            <button
              onClick={() => {
                setShowAscendiaPopup(false)
                // Aguardar animação fechar e redirecionar
                setTimeout(() => {
                  window.open('https://academy.myascendia.com/login.php', '_blank')
                }, 300)
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Content */}
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>

              <h3 className="text-2xl font-bold text-[#D2A63C]">
                Sistema Ascendia
              </h3>

              <div className="space-y-3 text-sm text-gray-300">
                <p className="leading-relaxed">
                  Usem este link para poderem ter acesso ao <span className="font-semibold text-[#D2A63C]">Sistema Ascendia</span>.
                </p>
                <p className="bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-lg p-3">
                  <span className="font-semibold text-white">💡 Importante:</span><br/>
                  Entrem com os vossos dados da <span className="font-semibold text-[#D2A63C]">Iqonic</span>
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAscendiaPopup(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowAscendiaPopup(false)
                    window.open('https://academy.myascendia.com/login.php', '_blank')
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black rounded-lg transition-all font-bold shadow-lg hover:shadow-xl"
                >
                  Aceder →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import UserDropdown from "@/components/user-dropdown"
import LanguageSelectorEnhanced from "@/components/language-selector-enhanced"
import { Menu, X, ChevronDown, Home, GraduationCap, TrendingUp, Rocket, Zap } from "lucide-react"

type NavSubItem = {
  name: string
  href: string
  external?: boolean
}

type NavItem = {
  name: string
  href: string
  icon: any
  external?: boolean
  submenu?: NavSubItem[]
}

export default function Navbar() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openDesktopSubmenu, setOpenDesktopSubmenu] = useState<string | null>(null)
  const [openMobileSubmenu, setOpenMobileSubmenu] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    setIsMenuOpen(false)
    setOpenDesktopSubmenu(null)
    setOpenMobileSubmenu(null)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : ""

    return () => {
      document.body.style.overflow = ""
    }
  }, [isMenuOpen])

  const navigation: NavItem[] = [
    {
      name: "Início",
      href: "/new-landing",
      icon: Home,
    },
    {
      name: "Educação",
      href: "/iqonic",
      icon: GraduationCap,
      submenu: [
        { name: "Apresentação IQONIC", href: "/iqonic" },
        { name: "IQonic Academy", href: "https://iqonic.vip", external: true },
        { name: "Educação MTM", href: "/mtm" },
        { name: "Live Sessions", href: "/live-sessions" },
        { name: "AI Com Os Gemeos", href: "https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b", external: true },
        { name: "BackOffice IQ", href: "https://user.iqonic.life", external: true },
      ],
    },
    {
      name: "Trading",
      href: "/swipetotrade",
      icon: TrendingUp,
      submenu: [
        { name: "Automatização", href: "/automation" },
        { name: "IQ SYNC", href: "/swipetotrade" },
        { name: "Ideias de Trading", href: "/trading-ideas" },
        { name: "Os nossos Scanners", href: "/scanner" },
        { name: "Scanner ao Vivo", href: "/scanner-access" },
        { name: "Trading Desk", href: "/trading" },
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
    {
      name: "MTM Studio",
      href: "https://mtmbrandbuilder.lovable.app",
      icon: Rocket,
      external: true,
    },
  ]

  const closeMenu = () => {
    setIsMenuOpen(false)
    setOpenMobileSubmenu(null)
  }

  const isActive = (href: string) => {
    if (href === "/new-landing") {
      return pathname === "/" || pathname === "/new-landing"
    }
    return pathname === href || pathname.startsWith(href + "/")
  }

  const toggleMobileSubmenu = (name: string) => {
    setOpenMobileSubmenu((prev) => (prev === name ? null : name))
  }

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[30000] transition-all duration-300 ${
          isScrolled
            ? "bg-gradient-to-r from-black via-gray-900 to-black backdrop-blur-md border-b border-mtm-primary/30 shadow-lg shadow-mtm-primary/20"
            : "bg-gradient-to-r from-black/95 via-gray-900/95 to-black/95 backdrop-blur-md border-b border-mtm-primary/20"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16 md:h-20">
            <div className="flex-shrink-0">
              <Link href="/new-landing" className="flex items-center group" onClick={closeMenu}>
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

            <div className="hidden lg:flex lg:items-center lg:space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return item.submenu ? (
                  <div
                    key={item.name}
                    className="relative group"
                    onMouseEnter={() => setOpenDesktopSubmenu(item.name)}
                    onMouseLeave={() => setOpenDesktopSubmenu(null)}
                  >
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                        isActive(item.href)
                          ? "text-mtm-primary bg-mtm-primary/10 shadow-lg shadow-mtm-primary/20"
                          : "text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${openDesktopSubmenu === item.name ? "rotate-180" : ""}`} />
                    </button>

                    {openDesktopSubmenu === item.name && (
                      <div className="absolute left-0 mt-2 w-56 rounded-xl shadow-2xl backdrop-blur-lg border border-mtm-primary/30 ring-1 ring-mtm-primary/20 z-50 animate-in fade-in slide-in-from-top-2 duration-200 bg-gradient-to-r from-black via-gray-900 to-black">
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
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
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

            <div className="hidden lg:flex lg:items-center lg:space-x-3">
              <LanguageSelectorEnhanced />
              <UserDropdown />
            </div>

            <div className="lg:hidden flex items-center">
              <button
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="inline-flex items-center justify-center p-2 rounded-lg text-mtm-primary hover:bg-mtm-primary/10 transition-colors"
                aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
                type="button"
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-[32000]">
            <button
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Fechar menu"
              onClick={closeMenu}
              type="button"
            />

            <aside className="absolute right-0 top-0 h-full w-[88%] max-w-sm bg-gradient-to-b from-black via-gray-900 to-black border-l border-mtm-primary/30 shadow-2xl shadow-black/60 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-4 border-b border-mtm-primary/30">
                <Link href="/new-landing" onClick={closeMenu}>
                  <Image
                    src="/logo-new.png"
                    alt="More Than Money"
                    width={150}
                    height={50}
                    className="h-10 w-auto"
                  />
                </Link>
                <button
                  onClick={closeMenu}
                  className="p-2 rounded-lg text-mtm-primary hover:bg-mtm-primary/10"
                  aria-label="Fechar menu"
                  type="button"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
                {navigation.map((item) => {
                  const Icon = item.icon
                  return item.submenu ? (
                    <div key={item.name} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => toggleMobileSubmenu(item.name)}
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
                        <ChevronDown className={`h-5 w-5 transition-transform ${openMobileSubmenu === item.name ? "rotate-180" : ""}`} />
                      </button>
                      {openMobileSubmenu === item.name && (
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
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
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

              <div className="border-t border-mtm-primary/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <LanguageSelectorEnhanced />
                </div>
                <UserDropdown />
              </div>
            </aside>
          </div>
        )}
      </nav>

      <div className="h-16 md:h-20" />
    </>
  )
}

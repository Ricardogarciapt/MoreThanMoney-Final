"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { SiteLogo } from "@/components/site-logo"
import { usePathname } from "next/navigation"
import UserDropdown from "@/components/user-dropdown"
import LanguageSelectorEnhanced from "@/components/language-selector-enhanced"
import { useT } from "@/components/i18n-provider"
import { Menu, X, ChevronDown, Home, GraduationCap, TrendingUp, Rocket, Zap, Brain, MonitorPlay } from "lucide-react"
import { shouldReduceSafariEffects } from "@/lib/supabase-session"

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
  const t = useT()
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openDesktopSubmenu, setOpenDesktopSubmenu] = useState<string | null>(null)
  const [openMobileSubmenu, setOpenMobileSubmenu] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const desktopCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const desktopAnchorsRef = useRef<Record<string, HTMLButtonElement | null>>({})
  const [desktopMenuPos, setDesktopMenuPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const DESKTOP_NAV_Z = 2147483640
  const DESKTOP_MENU_Z = 2147483646
  const MOBILE_OVERLAY_Z = 2147483647
  const reduceEffects = shouldReduceSafariEffects()
  const navBlur = reduceEffects ? "" : "backdrop-blur-md"
  const overlayBlur = reduceEffects ? "bg-black/85" : "bg-black/70 backdrop-blur-sm"

  const navigation: NavItem[] = [
    {
      name: t("navfooter.navHome"),
      href: "/new-landing",
      icon: Home,
    },
    {
      name: t("navfooter.navPresentations"),
      href: "/apresentacao",
      icon: MonitorPlay,
      submenu: [
        { name: t("navfooter.subMtmSystem"), href: "/apresentacao" },
      ],
    },
    {
      name: t("navfooter.navEducation"),
      href: "/mtm",
      icon: GraduationCap,
      submenu: [
        { name: t("navfooter.subMtmEducation"), href: "/mtm" },
        { name: t("navfooter.subDocs"), href: "/docs" },
        { name: t("navfooter.subLiveSessions"), href: "/live-sessions" },
      ],
    },
    {
      name: t("navfooter.navTrading"),
      href: "/automation",
      icon: TrendingUp,
      submenu: [
        { name: t("navfooter.subAutomation"), href: "/automation" },
        { name: "MTMcopier", href: "/mtmcopy" },
        { name: t("navfooter.subOurScanners"), href: "/scanner" },
        { name: t("navfooter.subLiveScanner"), href: "/scanner-access" },
        { name: t("navfooter.subMtmAlerts"), href: "/alertas-mtm" },
        { name: t("navfooter.subPortfolios"), href: "/portfolios" },
        { name: t("navfooter.subMtmTerminal"), href: "/mtm-terminal" },
        { name: t("navfooter.subTradingDesk"), href: "/trading" },
      ],
    },
    {
      name: t("navfooter.navOnboarding"),
      href: "/onboarding",
      icon: Rocket,
    },
    {
      name: t("navfooter.navFastStart"),
      href: "/fast-start",
      icon: Zap,
    },
    {
      name: t("navfooter.navAiApps"),
      href: "/app-mobile?tab=apps",
      icon: Brain,
      submenu: [
        { name: "MTM Studio", href: "https://mtmbrandbuilder.lovable.app", external: true },
        { name: "MTM Partnership Engine", href: "https://mtmugcapp.lovable.app", external: true },
        { name: "MTM AiOS", href: "https://mtmaios.lovable.app", external: true },
      ],
    },
  ]

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false)
    setOpenMobileSubmenu(null)
  }, [])

  const clearDesktopCloseTimer = useCallback(() => {
    if (desktopCloseTimerRef.current) {
      clearTimeout(desktopCloseTimerRef.current)
      desktopCloseTimerRef.current = null
    }
  }, [])

  const scheduleCloseDesktopSubmenu = useCallback(() => {
    clearDesktopCloseTimer()
    desktopCloseTimerRef.current = setTimeout(() => {
      setOpenDesktopSubmenu(null)
      desktopCloseTimerRef.current = null
    }, 220)
  }, [clearDesktopCloseTimer])

  const openDesktopItem = useMemo(
    () => navigation.find((item) => item.name === openDesktopSubmenu) || null,
    [navigation, openDesktopSubmenu]
  )

  const updateDesktopMenuPosition = useCallback((itemName: string | null) => {
    if (!itemName) {
      setDesktopMenuPos(null)
      return
    }
    const btn = desktopAnchorsRef.current[itemName]
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setDesktopMenuPos({
      left: Math.max(12, rect.left),
      top: rect.bottom + 8,
      width: 224,
    })
  }, [])

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    closeMenu()
    setOpenDesktopSubmenu(null)
    setDesktopMenuPos(null)
  }, [pathname])

  /* No mobile, abrir submenu Educação em rotas de live */
  useEffect(() => {
    const onLive =
      pathname?.startsWith("/live-sessions") ||
      pathname === "/live" ||
      Boolean(pathname?.startsWith("/live/"))
    if (isMenuOpen && onLive) {
      setOpenMobileSubmenu(t("navfooter.navEducation"))
    }
  }, [isMenuOpen, pathname, t])

  useEffect(() => () => clearDesktopCloseTimer(), [clearDesktopCloseTimer])

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : ""

    return () => {
      document.body.style.overflow = ""
    }
  }, [isMenuOpen])

  /** Rota interna ativa (ignora links externos). */
  const isRouteActive = (href: string, external?: boolean) => {
    if (external || href.startsWith("http")) return false
    if (!pathname) return false
    if (href === "/new-landing") {
      return pathname === "/" || pathname === "/new-landing"
    }
    if (href === "/live-sessions") {
      return (
        pathname === "/live-sessions" ||
        pathname.startsWith("/live-sessions/") ||
        pathname === "/live" ||
        pathname.startsWith("/live/")
      )
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const isParentActive = (item: NavItem) => {
    if (!item.submenu) return isRouteActive(item.href, item.external)
    if (isRouteActive(item.href, item.external)) return true
    return item.submenu.some((s) => isRouteActive(s.href, s.external))
  }

  const toggleMobileSubmenu = (name: string) => {
    setOpenMobileSubmenu((prev) => (prev === name ? null : name))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      closeMenu()
      setOpenDesktopSubmenu(null)
      setDesktopMenuPos(null)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!openDesktopSubmenu) return
      const anchor = desktopAnchorsRef.current[openDesktopSubmenu]
      const target = e.target as Node
      const menu = document.getElementById("navbar-desktop-submenu")
      if (anchor?.contains(target)) return
      if (menu?.contains(target)) return
      setOpenDesktopSubmenu(null)
      setDesktopMenuPos(null)
    }

    const onLayoutChange = () => updateDesktopMenuPosition(openDesktopSubmenu)

    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", onLayoutChange)
    window.addEventListener("scroll", onLayoutChange, true)
    document.addEventListener("pointerdown", onPointerDown)

    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onLayoutChange)
      window.removeEventListener("scroll", onLayoutChange, true)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [openDesktopSubmenu, closeMenu, updateDesktopMenuPosition])

  useEffect(() => {
    updateDesktopMenuPosition(openDesktopSubmenu)
  }, [openDesktopSubmenu, updateDesktopMenuPosition])

  return (
    <>
      <nav
        className={`fixed left-0 right-0 top-0 isolate transition-all duration-300 ${
          isScrolled
            ? `bg-gradient-to-r from-black via-gray-900 to-black ${navBlur} border-b border-mtm-primary/30 shadow-lg shadow-mtm-primary/20`
            : `bg-gradient-to-r from-black via-gray-900 to-black ${navBlur} border-b border-mtm-primary/20`
        }`}
        style={{ zIndex: DESKTOP_NAV_Z }}
      >
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16 md:h-20">
            <div className="flex-shrink-0">
              <Link href="/new-landing" className="flex items-center group" onClick={closeMenu}>
                <SiteLogo
                  width={56}
                  height={56}
                  className="h-10 md:h-14 w-auto transition-transform group-hover:scale-105"
                  priority
                  alt="More Than Money"
                />
              </Link>
            </div>

            <div className="hidden lg:flex lg:items-center lg:space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return item.submenu ? (
                  <div
                    key={item.name}
                    className="group relative"
                    onMouseEnter={() => {
                      clearDesktopCloseTimer()
                      setOpenDesktopSubmenu(item.name)
                    }}
                    onMouseLeave={scheduleCloseDesktopSubmenu}
                  >
                    <button
                      ref={(el) => {
                        desktopAnchorsRef.current[item.name] = el
                      }}
                      type="button"
                      aria-expanded={openDesktopSubmenu === item.name}
                      aria-haspopup="menu"
                      onClick={() => {
                        clearDesktopCloseTimer()
                        setOpenDesktopSubmenu((prev) => (prev === item.name ? null : item.name))
                      }}
                      className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                        isParentActive(item)
                          ? "bg-mtm-primary/10 text-mtm-primary shadow-lg shadow-mtm-primary/20"
                          : "text-gray-300 hover:bg-mtm-primary/5 hover:text-mtm-primary"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${openDesktopSubmenu === item.name ? "rotate-180" : ""}`} />
                    </button>

                  </div>
                ) : (
                  <Link
                    key={item.name}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                      isRouteActive(item.href, item.external)
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
                aria-label={isMenuOpen ? t("navfooter.closeMenu") : t("navfooter.openMenu")}
                type="button"
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {isClient && isMenuOpen && createPortal(
          <div className="fixed inset-0 lg:hidden" style={{ zIndex: MOBILE_OVERLAY_Z }}>
            <button
              className={`absolute inset-0 ${overlayBlur}`}
              aria-label={t("navfooter.closeMenu")}
              onClick={closeMenu}
              type="button"
            />

            <aside className="absolute right-0 top-0 h-full w-[88%] max-w-sm bg-gradient-to-b from-black via-gray-900 to-black border-l border-mtm-primary/30 shadow-2xl shadow-black/60 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-4 border-b border-mtm-primary/30">
                <Link href="/new-landing" onClick={closeMenu}>
                  <SiteLogo
                    width={40}
                    height={40}
                    className="h-10 w-auto"
                    alt="More Than Money"
                  />
                </Link>
                <button
                  onClick={closeMenu}
                  className="p-2 rounded-lg text-mtm-primary hover:bg-mtm-primary/10"
                  aria-label={t("navfooter.closeMenu")}
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
                          isParentActive(item)
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
                                isRouteActive(subitem.href, subitem.external)
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
                        isRouteActive(item.href, item.external)
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
          </div>,
          document.body
        )}
      </nav>

      {isClient && openDesktopSubmenu && openDesktopItem?.submenu && desktopMenuPos
        ? createPortal(
            <div
              id="navbar-desktop-submenu"
              className="fixed"
              style={{
                zIndex: DESKTOP_MENU_Z,
                top: desktopMenuPos.top,
                left: desktopMenuPos.left,
                width: desktopMenuPos.width,
              }}
              onMouseEnter={clearDesktopCloseTimer}
              onMouseLeave={scheduleCloseDesktopSubmenu}
            >
              <div className="rounded-xl border border-mtm-primary/30 bg-gradient-to-b from-black via-gray-950 to-black shadow-2xl shadow-black/50 ring-1 ring-mtm-primary/10 backdrop-blur-lg">
                <div className="py-1.5">
                  {openDesktopItem.submenu.map((subitem) => (
                    <Link
                      key={subitem.name}
                      href={subitem.href}
                      target={subitem.external ? "_blank" : undefined}
                      rel={subitem.external ? "noopener noreferrer" : undefined}
                      className={`block px-4 py-2.5 text-sm transition-all duration-200 ${
                        isRouteActive(subitem.href, subitem.external)
                          ? "text-mtm-primary bg-mtm-primary/10 border-l-2 border-mtm-primary"
                          : "text-gray-300 hover:text-mtm-primary hover:bg-mtm-primary/5 hover:border-l-2 hover:border-mtm-primary/50"
                      }`}
                    >
                      {subitem.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div className="h-16 md:h-20" />
    </>
  )
}

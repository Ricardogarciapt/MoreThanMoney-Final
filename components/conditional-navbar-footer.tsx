"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function ConditionalNavbarFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // True while running in the native iOS/Android WKWebView shell
  const [isNativeApp, setIsNativeApp] = useState(false)

  // Re-check on every client-side navigation so the flag is picked up after
  // the app-mobile page sets it and the user navigates to e.g. /member-area
  useEffect(() => {
    try {
      setIsNativeApp(sessionStorage.getItem("mtm_native") === "1")
    } catch {
      // sessionStorage unavailable (rare)
    }
  }, [pathname])

  const isExactOrChildPath = (basePath: string) => {
    if (!pathname) return false
    return pathname === basePath || pathname.startsWith(`${basePath}/`)
  }

  // Rotas standalone: não renderizar navbar/footer global.
  // `/mtmfunded` é um NEGÓCIO À PARTE, e não uma secção do site: tem navegação, rodapé,
  // FAQ e políticas próprias, sem caminho de regresso a morethanmoney.pt. Herdar a navbar
  // global misturava as duas marcas — e, num produto financiado, misturar quem responde
  // pelo quê não é uma questão de estética.
  const standalonePaths = ["/iqcharts2", "/charts-primeverse", "/app-mobile", "/work", "/tradingfloor", "/apresentacao", "/FreeSession", "/mtmfunded"]
  const isStandalonePage = standalonePaths.some(isExactOrChildPath)

  // In the native app every route is standalone — hide Navbar & Footer site-wide
  if (isStandalonePage || isNativeApp) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  )
}


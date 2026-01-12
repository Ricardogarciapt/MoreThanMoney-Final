"use client"

import { ReactNode, useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import AIAssistantFloating from "@/components/mobile/ai-assistant-floating"

export default function AppMobileLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showAI, setShowAI] = useState(true)

  useEffect(() => {
    // Adicionar classe ao body quando estiver em /app-mobile
    if (pathname?.startsWith('/app-mobile')) {
      document.body.classList.add('app-mobile-route')
    } else {
      document.body.classList.remove('app-mobile-route')
    }

    return () => {
      document.body.classList.remove('app-mobile-route')
    }
  }, [pathname])

  useEffect(() => {
    // Ocultar IA quando estiver na aba scanner
    const tab = searchParams?.get('tab')
    const isScanner = tab === 'scanner' || (pathname?.includes('scanner') && !tab)
    setShowAI(!isScanner)
  }, [pathname, searchParams])

  return (
    <div className="app-mobile-container">
      {children}
      {showAI && <AIAssistantFloating />}
    </div>
  )
}
